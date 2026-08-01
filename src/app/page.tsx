'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Beat, CharId, EngineState, RelScores, SceneResponse, Stance } from '@/lib/types'
import { audioEngine, loadManifest } from '@/lib/audioEngine'
import { getStt } from '@/lib/stt'
import { markTurn, newTurn, currentTurn, logTable } from '@/lib/metrics'
import { classifyStance } from '@/lib/stance'
import Stage from '@/components/Stage'
import TitleScreen from '@/components/TitleScreen'
import MicButton from '@/components/MicButton'
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
  const [stance, setStance] = useState<Stance | null>(null)
  const [emotion, setEmotion] = useState<string | null>(null)
  const [rel, setRel] = useState<RelScores>({})
  const [branch, setBranch] = useState<'live' | 'preauthored' | null>(null)
  const [timings, setTimings] = useState<Record<string, number> | null>(null)
  const [openingDone, setOpeningDone] = useState(false)
  const manifestRef = useRef<Record<string, string> | null>(null)

  useEffect(() => audioEngine.onStateChange(setEngineState), [])

  // Play one beat: prebaked file if the manifest has it, else live streamed TTS.
  const playBeat = useCallback(async (beat: Beat, manifestKey: string) => {
    setSpeaking(beat.speaker)
    setCaption({ speaker: idToName(beat.speaker), text: beat.line })
    const url = manifestRef.current?.[manifestKey]
    if (url) {
      await audioEngine.playUrl(url)
    } else {
      const voice = VOICES[beat.speaker]
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: beat.line,
          voiceId: voice.voiceId,
          emotion: beat.emotion ?? voice.defaultEmotion,
        }),
      })
      if (res.ok) await audioEngine.playStream(res)
    }
    setSpeaking(null)
  }, [])

  const enterVilla = useCallback(async () => {
    await audioEngine.unlock()
    manifestRef.current = await loadManifest()
    setEntered(true)
    audioEngine.setState('playing')
    // The authored cold open. Barge-in is off here — the cinematic must land.
    for (let i = 0; i < OPENING.beats.length; i++) {
      if (audioEngine.getState() !== 'playing') return
      await playBeat(OPENING.beats[i], `opening_${i}`)
    }
    setOpeningDone(true)
    setCaption({ speaker: idToName(OPENING.asker), text: OPENING.question })
    audioEngine.setState('listening')
  }, [playBeat])

  const onHoldStart = useCallback(() => {
    if (audioEngine.getState() === 'playing') {
      audioEngine.stop() // barge-in: cut the current voice
    }
    audioEngine.setState('listening')
    newTurn()
    getStt().start()
  }, [])

  const onHoldEnd = useCallback(async () => {
    markTurn('mic_release')
    audioEngine.setState('thinking')
    const { text, emotion: detected } = await getStt().stop()
    markTurn('stt_done')
    setEmotion(detected ?? null)
    if (!text.trim()) {
      audioEngine.setState('listening')
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

    // Fire the branch request and the masking reaction line in parallel.
    const scenePromise = fetch('/api/scene', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript: text, emotion: detected }),
    }).then((r) => r.json() as Promise<SceneResponse>)

    audioEngine.setState('playing')
    await playBeat(
      { speaker: reaction.speaker, line: reaction.line, emotion: reaction.emotion },
      `reaction_${reaction.id}`,
    )

    const scene = await scenePromise
    markTurn('llm_first_token')
    setBranch(scene.branch)
    setRel((prev) => {
      const next = { ...prev }
      for (const [id, d] of Object.entries(scene.relDeltas)) {
        next[id as CharId] = (next[id as CharId] ?? 0) + (d ?? 0)
      }
      return next
    })

    markTurn('playback_start')
    for (const beat of scene.beats) {
      if (audioEngine.getState() !== 'playing') break // barge-in mid-branch
      await playBeat(beat, `beat_live_${beat.speaker}`)
    }
    setTimings(currentTurn())
    logTable()
    if (audioEngine.getState() === 'playing') audioEngine.setState('listening')
  }, [playBeat])

  if (!entered) return <TitleScreen onEnter={enterVilla} />

  return (
    <Stage
      speaking={speaking}
      caption={caption}
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
      <MicButton
        state={engineState}
        bargeInEnabled={openingDone}
        onHoldStart={onHoldStart}
        onHoldEnd={onHoldEnd}
      />
    </Stage>
  )
}
