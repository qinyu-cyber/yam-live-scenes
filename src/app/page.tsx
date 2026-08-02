'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Beat,
  CharId,
  EngineState,
  HistoryEntry,
  RelScores,
  SceneStreamLine,
  Stance,
} from '@/lib/types'
import { audioEngine, loadManifest } from '@/lib/audioEngine'
import { VoiceLoop } from '@/lib/vad'
import { SttStreamTurn } from '@/lib/sttStream'
import { RealtimeCall } from '@/lib/callEngine'
import { CAST_UI } from '@/components/Portrait'
import { markTurn, newTurn, currentTurn, logTable } from '@/lib/metrics'
import { classifyStance } from '@/lib/stance'
import Stage from '@/components/Stage'
import TitleScreen from '@/components/TitleScreen'
import DebugPanel from '@/components/DebugPanel'
import { OPENING } from '../../content/openingScene'
import { VOICES } from '../../content/voices'
import { idToName } from '../../content/cast'

type Caption = { speaker?: string; text: string } | null

export default function Home() {
  const [entered, setEntered] = useState(false)
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const [speaking, setSpeaking] = useState<CharId | null>(null)
  const [caption, setCaption] = useState<Caption>(null)
  const [narration, setNarration] = useState<string | null>(null)
  const [stance, setStance] = useState<Stance | null>(null)
  const [emotion, setEmotion] = useState<string | null>(null)
  const [rel, setRel] = useState<RelScores>({})
  const [branch, setBranch] = useState<'live' | 'preauthored' | null>(null)
  const [timings, setTimings] = useState<Record<string, number> | null>(null)
  const [micOk, setMicOk] = useState<boolean | null>(null)
  const [openingDone, setOpeningDone] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [muted, setMuted] = useState(false)
  // Beat position within the playing scene — drives the dialogue-card pips.
  const [progress, setProgress] = useState<{ i: number; total: number } | null>(null)
  const mutedRef = useRef(false)
  const manifestRef = useRef<Record<string, string> | null>(null)
  // Post-opening conversation as actually HEARD — beats are appended only
  // after they play; a barged-in beat is marked cut; dropped beats never enter.
  const historyRef = useRef<HistoryEntry[]>([])
  // Private 1-on-1 call state. What's said on a call lives ONLY in that
  // character's private notes — the group never sees it.
  const [call, setCall] = useState<{ charId: CharId; charText: string; userText: string } | null>(null)
  const callRef = useRef<RealtimeCall | null>(null)
  const inCallRef = useRef(false)
  const privateNotesRef = useRef<Partial<Record<CharId, string[]>>>({})
  const openingDoneRef = useRef(false)
  const turnInFlightRef = useRef(false)
  const pendingWavRef = useRef<Blob | null>(null)
  const voiceLoopRef = useRef<VoiceLoop | null>(null)

  useEffect(() => audioEngine.onStateChange(setEngineState), [])

  // Self-mute: drops mic audio at the source in whichever engine is live —
  // the group VoiceLoop and any in-progress private call.
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      mutedRef.current = next
      voiceLoopRef.current?.setMuted(next)
      callRef.current?.setMuted(next)
      return next
    })
  }, [])

  const fetchTts = useCallback((beat: Beat): Promise<Response> => {
    const voice = VOICES[beat.speaker]
    return fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: beat.line,
        voiceId: voice.voiceId,
        emotion: beat.emotion ?? voice.defaultEmotion,
        rate: voice.rate,
        deliveryMode: voice.deliveryMode,
        temperature: voice.temperature,
      }),
    })
  }, [])

  // Play one beat: prebaked file if the manifest has it, else live streamed TTS
  // (optionally already in flight — beats prefetch while earlier ones play).
  // `cutFraction` truncates THIS beat early — used when the next beat cuts in.
  const playBeat = useCallback(
    async (beat: Beat, manifestKey: string, cutFraction?: number, prefetched?: Promise<Response>) => {
      setSpeaking(beat.speaker)
      setCaption({ speaker: idToName(beat.speaker), text: beat.line })
      const url = manifestRef.current?.[manifestKey]
      if (url) {
        await audioEngine.playUrl(url, cutFraction)
      } else {
        const res = await (prefetched ?? fetchTts(beat)).catch(() => null)
        if (res?.ok) await audioEngine.playStream(res, cutFraction)
      }
      setSpeaking(null)
    },
    [fetchTts],
  )

  const runTurn = useCallback(
    async (wav: Blob, streamed: SttStreamTurn | null) => {
      turnInFlightRef.current = true
      markTurn('mic_release')
      audioEngine.setState('thinking')
      setProgress(null)
      let text = ''
      let detected: string | undefined
      let vocalStyle: string | undefined
      // Primary: the streaming session that transcribed WHILE the player
      // talked — its final lands ~200ms after speech end, WITH voice profile.
      if (streamed) {
        const result = await streamed.finish()
        if (result) {
          text = result.text
          detected = result.emotion
          vocalStyle = result.vocalStyle
        }
      }
      if (!text) {
        try {
          const form = new FormData()
          form.append('audio', wav, 'audio.wav')
          const res = await fetch('/api/stt', { method: 'POST', body: form })
          if (res.ok) {
            const json = await res.json()
            text = (json.text ?? '').trim()
            detected = json.emotion
          }
        } catch (err) {
          console.error('[stt]', err)
        }
      }
      markTurn('stt_done')
      setEmotion(detected ? `${detected}${vocalStyle ? ` (${vocalStyle})` : ''}` : null)
      if (text) {
        historyRef.current.push({ who: 'player', text, ...(detected ? { emotion: detected } : {}) })
      }
      if (!text) {
        setCaption({ text: "(didn't catch that — say it again?)" })
        audioEngine.setState('listening')
        turnInFlightRef.current = false
        return
      }
      setCaption({ speaker: 'You', text })

      // Stance shown in the panel; the server recomputes it authoritatively.
      const localStance = classifyStance(text).stance
      markTurn('stance_done')
      setStance(localStance)

      // No canned mask line — the branch's own short first beat IS the
      // reaction. Latency is attacked directly: prompt-enforced tiny beat 1,
      // per-beat TTS prefetch, trimmed VAD tail.
      const res = await fetch('/api/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          emotion: detected,
          vocalStyle,
          // everything before this utterance (it's already the transcript)
          history: historyRef.current.slice(0, -1).slice(-20),
          privateNotes: privateNotesRef.current,
        }),
      })

      const beatQueue: Array<{ beat: Beat; audio: Promise<Response> }> = []
      let streamDone = false
      const consume = (async () => {
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        let buf = ''
        const handle = (raw: string) => {
          if (!raw.trim()) return
          let line: SceneStreamLine
          try {
            line = JSON.parse(raw)
          } catch {
            return
          }
          if (line.type === 'meta') {
            setRel((prev) => {
              const next = { ...prev }
              for (const [id, d] of Object.entries(line.relDeltas)) {
                next[id as CharId] = (next[id as CharId] ?? 0) + (d ?? 0)
              }
              return next
            })
          } else if (line.type === 'beat') {
            if (beatQueue.length === 0 && !streamDone) markTurn('llm_first_token')
            // Kick off TTS immediately — audio renders while earlier beats play.
            // (caught fallback Response keeps abandoned prefetches from
            // becoming unhandled rejections on barge-in)
            beatQueue.push({
              beat: line.beat,
              audio: fetchTts(line.beat).catch(() => new Response(null, { status: 599 })),
            })
          } else if (line.type === 'done') {
            setBranch(line.branch)
          }
        }
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n')
          buf = parts.pop() ?? ''
          parts.forEach(handle)
        }
        handle(buf)
      })().finally(() => {
        streamDone = true
      })

      // Play beats as they arrive; the queue drains while the stream still fills.
      // State stays 'thinking' until the first beat's audio is ready to go.
      let started = false
      let played = 0
      for (;;) {
        if (started && audioEngine.getState() !== 'playing') break // barge-in mid-branch
        const entry = beatQueue.shift()
        if (entry) {
          if (!started) {
            started = true
            audioEngine.setState('playing')
            markTurn('playback_start')
          }
          // Pips: total grows as beats stream in — honest about an open scene.
          played++
          setProgress({ i: played, total: played + beatQueue.length })
          await playBeat(
            entry.beat,
            `beat_live_${entry.beat.speaker}`,
            beatQueue[0]?.beat.cutoff ? 0.72 : undefined,
            entry.audio,
          )
          // Heard (or barged into mid-line) — record it either way.
          historyRef.current.push({
            who: entry.beat.speaker,
            text: entry.beat.line,
            ...(audioEngine.getState() !== 'playing' ? { cut: true } : {}),
          })
          continue
        }
        if (streamDone) break
        await new Promise((r) => setTimeout(r, 100))
      }
      await consume.catch(() => {})
      setTimings(currentTurn())
      logTable()
      if (audioEngine.getState() === 'playing') audioEngine.setState('listening')
      turnInFlightRef.current = false
      // A barge-in utterance may have arrived while this turn was finishing —
      // it becomes the next turn immediately.
      const pending = pendingWavRef.current
      pendingWavRef.current = null
      if (pending) void runTurnRef.current?.(pending, null)
    },
    [playBeat],
  )
  const runTurnRef = useRef<typeof runTurn | null>(null)
  runTurnRef.current = runTurn

  const enterVilla = useCallback(async () => {
    // Audio unlock must not die on mic denial — playback still works.
    await audioEngine.unlock().catch((err) => console.warn('[unlock]', err))
    manifestRef.current = await loadManifest()

    // Always-on conversational mic: speech is detected automatically — speaking
    // over a character is a barge-in, no button anywhere.
    let sttTurn: SttStreamTurn | null = null
    const loop = new VoiceLoop({
      onSpeechStart: () => {
        if (inCallRef.current) return // the call engine owns the mic
        if (!openingDoneRef.current) return // the cold open always lands
        // Streaming STT session opens the moment speech starts — transcribing
        // runs concurrently with the player talking.
        sttTurn = new SttStreamTurn()
        // Barge-in: characters stop the moment the player starts talking —
        // including mid-branch while a turn is still technically in flight.
        if (audioEngine.getState() === 'playing') {
          audioEngine.stop()
          audioEngine.setState('listening')
        }
        if (!turnInFlightRef.current) newTurn()
      },
      onSpeechFrame: (pcm, rate) => {
        if (openingDoneRef.current && !inCallRef.current) sttTurn?.push(pcm, rate)
      },
      onSpeechEnd: (wav) => {
        if (inCallRef.current || !openingDoneRef.current) return
        const streamed = sttTurn
        sttTurn = null
        if (turnInFlightRef.current) {
          // The interrupted turn is still unwinding — park the utterance; it
          // starts the next turn the instant the old one releases.
          pendingWavRef.current = wav
          return
        }
        void runTurn(wav, streamed)
      },
      onMicError: () => setMicOk(false),
      onLevel: (rms) => setMicLevel(rms),
    })
    voiceLoopRef.current = loop
    void loop.start().then((ok) => setMicOk(ok))

    setEntered(true)
    setNarration(OPENING.sceneText)
    // Pre-warm the LLM prompt cache while the cold open plays, so the
    // player's FIRST answer gets warm-cache latency (~2.5s, not ~6s).
    void fetch('/api/scene').catch(() => {})
    audioEngine.setState('playing')
    // The authored cold open. Speech is ignored until Gojo's question lands.
    // Skip (or any stop) breaks the loop but still lands on the question.
    for (let i = 0; i < OPENING.beats.length; i++) {
      if (audioEngine.getState() !== 'playing') break
      const next = OPENING.beats[i + 1]
      setProgress({ i: i + 1, total: OPENING.beats.length })
      await playBeat(OPENING.beats[i], `opening_${i}`, next?.cutoff ? 0.72 : undefined)
    }
    openingDoneRef.current = true
    setOpeningDone(true)
    setNarration(null)
    setProgress(null)
    setCaption({ speaker: idToName(OPENING.asker), text: OPENING.question })
    audioEngine.setState('listening')
  }, [playBeat, runTurn])

  useEffect(() => () => voiceLoopRef.current?.stop(), [])

  const skipOpening = useCallback(() => {
    audioEngine.stop() // breaks the opening loop; its tail lands on the question
    audioEngine.setState('listening')
  }, [])

  const startCall = useCallback(async (charId: CharId) => {
    if (!openingDoneRef.current || inCallRef.current) return
    audioEngine.stop() // group scene goes quiet; the villa waits
    audioEngine.setState('listening')
    inCallRef.current = true
    setCall({ charId, charText: '', userText: '' })
    const engine = new RealtimeCall({
      onCharText: (delta) =>
        setCall((c) => (c ? { ...c, charText: (c.charText + delta).slice(-300) } : c)),
      onUserText: (text) => setCall((c) => (c ? { ...c, userText: text, charText: '' } : c)),
      onEnded: () => {
        // server closed on us — treat as hang-up
        if (inCallRef.current) void endCallRef.current?.()
      },
    })
    callRef.current = engine
    engine.setMuted(mutedRef.current) // mute state carries into the call
    const ok = await engine.start(charId, historyRef.current.slice(-20))
    if (!ok) {
      inCallRef.current = false
      callRef.current = null
      setCall(null)
      setCaption({ text: '(call failed — try again)' })
    }
  }, [])

  const endCall = useCallback(async () => {
    const engine = callRef.current
    const current = call
    callRef.current = null
    inCallRef.current = false
    setCall(null)
    if (!engine) return
    const transcript = await engine.stop()
    if (current && transcript.length) {
      // The character remembers the call; the group never hears it.
      const notes = (privateNotesRef.current[current.charId] ??= [])
      for (const t of transcript) {
        notes.push(`${t.who === 'player' ? 'player' : 'me'}: ${t.text}`)
      }
      privateNotesRef.current[current.charId] = notes.slice(-12)
    }
  }, [call])
  const endCallRef = useRef<typeof endCall | null>(null)
  endCallRef.current = endCall

  if (!entered) return <TitleScreen onEnter={enterVilla} />

  if (call) {
    const ui = CAST_UI[call.charId]
    return (
      <div className="relative flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[linear-gradient(180deg,#0b0716_0%,#1c1240_55%,#000_100%)]">
        <p className="text-xs uppercase tracking-widest text-white/40">
          private call — the villa can&apos;t hear you
        </p>
        <div
          className="h-44 w-44 overflow-hidden rounded-full border-2"
          style={{ borderColor: ui.accent, boxShadow: `0 0 60px ${ui.accent}55` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/images/portraits/${call.charId}.png`}
            alt={ui.name}
            className="h-full w-full object-cover object-top"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        </div>
        <p className="text-2xl font-semibold" style={{ color: ui.accent }}>
          {ui.name}
        </p>
        <div className="max-w-xl px-6 text-center">
          {call.userText && <p className="mb-2 text-sm text-white/50">you: {call.userText}</p>}
          <p className="min-h-12 text-lg text-white/90">{call.charText || 'just talk — they can hear you'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className={`rounded-full border px-5 py-2 transition-colors ${
              muted
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {muted ? '🔇 muted' : '🎙 mute'}
          </button>
          <button
            onClick={endCall}
            className="rounded-full border border-red-400/40 bg-red-500/20 px-6 py-2 text-red-200 hover:bg-red-500/30"
          >
            hang up
          </button>
        </div>
      </div>
    )
  }

  return (
    <Stage
      speaking={speaking}
      caption={caption}
      narration={narration}
      hearts={100 + 5 * Object.values(rel).reduce((n, v) => n + (v ?? 0), 0)}
      progress={progress}
      onPortraitSelect={openingDone ? (id) => void startCall(id) : undefined}
      debug={
        <DebugPanel
          state={engineState}
          stance={stance}
          emotion={emotion}
          rel={rel}
          timings={timings}
          branch={branch}
        />
      }
    >
      {/* Skip the cold open (testing / repeat runs). */}
      {!openingDone && (
        <button
          onClick={skipOpening}
          className="pointer-events-auto mr-3 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur hover:bg-black/70"
        >
          skip intro ⏭
        </button>
      )}
      {/* Conversation status pill — replaces the old hold-to-talk button.
          The dot doubles as a live mic level meter so you can SEE that the
          villa hears you. */}
      <div className="pointer-events-none flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm text-white/80 backdrop-blur">
        {micOk === false ? (
          <span>mic blocked — click the 🔒 by the address bar, allow Microphone, refresh</span>
        ) : !openingDone ? (
          <span>the villa is talking — Gojo turns to you in a moment</span>
        ) : muted ? (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
            <span>muted — the villa can&apos;t hear you</span>
          </>
        ) : engineState === 'thinking' ? (
          <span>…</span>
        ) : (
          <>
            <span
              className={`h-2.5 w-2.5 rounded-full ${engineState === 'listening' ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ transform: `scale(${Math.min(2.5, 1 + micLevel * 25)})`, transition: 'transform 120ms' }}
            />
            <span>
              {engineState === 'listening' ? 'listening — just talk' : 'talk to cut them off'}
            </span>
          </>
        )}
      </div>
      {/* Self-mute — for background noise; audio drops at the source. */}
      {openingDone && (
        <button
          onClick={toggleMute}
          className={`pointer-events-auto ml-3 rounded-full border px-3 py-1 text-xs backdrop-blur transition-colors ${
            muted
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
              : 'border-white/20 bg-black/50 text-white/70 hover:bg-black/70'
          }`}
        >
          {muted ? '🔇 muted' : '🎙 mute'}
        </button>
      )}
    </Stage>
  )
}
