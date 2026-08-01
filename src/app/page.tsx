'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Beat, CharId, EngineState, RelScores, SceneStreamLine, Stance } from '@/lib/types'
import { audioEngine, loadManifest } from '@/lib/audioEngine'
import { VoiceLoop } from '@/lib/vad'
import { markTurn, newTurn, currentTurn, logTable } from '@/lib/metrics'
import { classifyStance } from '@/lib/stance'
import Stage from '@/components/Stage'
import TitleScreen from '@/components/TitleScreen'
import DebugPanel from '@/components/DebugPanel'
import { OPENING } from '../../content/openingScene'
import { REACTION_LINES } from '../../content/reactionLines'
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
  const manifestRef = useRef<Record<string, string> | null>(null)
  const openingDoneRef = useRef(false)
  const turnInFlightRef = useRef(false)
  const voiceLoopRef = useRef<VoiceLoop | null>(null)

  useEffect(() => audioEngine.onStateChange(setEngineState), [])

  // Play one beat: prebaked file if the manifest has it, else live streamed TTS.
  // `cutFraction` truncates THIS beat early — used when the next beat cuts in.
  const playBeat = useCallback(async (beat: Beat, manifestKey: string, cutFraction?: number) => {
    setSpeaking(beat.speaker)
    setCaption({ speaker: idToName(beat.speaker), text: beat.line })
    const url = manifestRef.current?.[manifestKey]
    if (url) {
      await audioEngine.playUrl(url, cutFraction)
    } else {
      const voice = VOICES[beat.speaker]
      const res = await fetch('/api/tts', {
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
      if (res.ok) await audioEngine.playStream(res, cutFraction)
    }
    setSpeaking(null)
  }, [])

  const runTurn = useCallback(
    async (wav: Blob) => {
      turnInFlightRef.current = true
      markTurn('mic_release')
      audioEngine.setState('thinking')
      let text = ''
      let detected: string | undefined
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
      markTurn('stt_done')
      setEmotion(detected ?? null)
      if (!text) {
        setCaption({ text: "(didn't catch that — say it again?)" })
        audioEngine.setState('listening')
        turnInFlightRef.current = false
        return
      }
      setCaption({ speaker: 'You', text })

      // Client-side stance pick for the INSTANT reaction (latency mask) — the
      // server recomputes with the same keywords for the authoritative record.
      const localStance = classifyStance(text).stance
      markTurn('stance_done')
      setStance(localStance)
      const lines = REACTION_LINES[localStance]
      const reaction = lines[text.length % lines.length]

      // Fire the branch request; beats stream in while the reaction line masks.
      const res = await fetch('/api/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: text, emotion: detected }),
      })

      const beatQueue: Beat[] = []
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
            beatQueue.push(line.beat)
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

      audioEngine.setState('playing')
      await playBeat(
        { speaker: reaction.speaker, line: reaction.line, emotion: reaction.emotion },
        `reaction_${reaction.id}`,
      )

      // Play beats as they arrive; the queue drains while the stream still fills.
      markTurn('playback_start')
      for (;;) {
        if (audioEngine.getState() !== 'playing') break // barge-in mid-branch
        const beat = beatQueue.shift()
        if (beat) {
          await playBeat(beat, `beat_live_${beat.speaker}`, beatQueue[0]?.cutoff ? 0.72 : undefined)
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
    },
    [playBeat],
  )

  const enterVilla = useCallback(async () => {
    // Audio unlock must not die on mic denial — playback still works.
    await audioEngine.unlock().catch((err) => console.warn('[unlock]', err))
    manifestRef.current = await loadManifest()

    // Always-on conversational mic: speech is detected automatically — speaking
    // over a character is a barge-in, no button anywhere.
    const loop = new VoiceLoop({
      onSpeechStart: () => {
        if (turnInFlightRef.current || !openingDoneRef.current) return
        if (audioEngine.getState() === 'playing') {
          audioEngine.stop()
          audioEngine.setState('listening')
        }
        newTurn()
      },
      onSpeechEnd: (wav) => {
        if (turnInFlightRef.current || !openingDoneRef.current) return
        if (audioEngine.getState() !== 'listening') return
        void runTurn(wav)
      },
      onMicError: () => setMicOk(false),
    })
    voiceLoopRef.current = loop
    void loop.start().then((ok) => setMicOk(ok))

    setEntered(true)
    setNarration(OPENING.sceneText)
    audioEngine.setState('playing')
    // The authored cold open. Speech is ignored until Gojo's question lands.
    for (let i = 0; i < OPENING.beats.length; i++) {
      if (audioEngine.getState() !== 'playing') return
      const next = OPENING.beats[i + 1]
      await playBeat(OPENING.beats[i], `opening_${i}`, next?.cutoff ? 0.72 : undefined)
    }
    openingDoneRef.current = true
    setNarration(null)
    setCaption({ speaker: idToName(OPENING.asker), text: OPENING.question })
    audioEngine.setState('listening')
  }, [playBeat, runTurn])

  useEffect(() => () => voiceLoopRef.current?.stop(), [])

  if (!entered) return <TitleScreen onEnter={enterVilla} />

  return (
    <Stage
      speaking={speaking}
      caption={caption}
      narration={narration}
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
      {/* Conversation status pill — replaces the old hold-to-talk button. */}
      <div className="pointer-events-none flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm text-white/80 backdrop-blur">
        {micOk === false ? (
          <span>mic blocked — click the 🔒 by the address bar, allow Microphone, refresh</span>
        ) : engineState === 'listening' ? (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            <span>listening — just talk</span>
          </>
        ) : engineState === 'thinking' ? (
          <span>…</span>
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span>speak any time to jump in</span>
          </>
        )}
      </div>
    </Stage>
  )
}
