// Inworld voice setup per character, grounded in canon personality research
// (fandom-wiki sourced; see git history / README). Each entry drives the full
// Inworld voice:stream config:
//   rate         — speakingRate [0.5, 1.5]
//   deliveryMode — STABLE (controlled) | BALANCED | CREATIVE (expressive)
//   temperature  — (0, 2], higher = more expressive variation
//   defaultEmotion — baseline steering tag when a beat carries none

import type { CharId } from '../src/lib/types'

export type VoiceConfig = {
  voiceId: string
  defaultEmotion: string
  rate: number
  deliveryMode: 'STABLE' | 'BALANCED' | 'CREATIVE'
  temperature: number
}

export const VOICES: Record<CharId, VoiceConfig> = {
  // Playful, cocky, carefree surface over total confidence — bright sing-song
  // that can snap flat for one serious line. Fast, irreverent, expressive.
  gojo: { voiceId: 'Alex', defaultEmotion: 'happy', rate: 1.2, deliveryMode: 'CREATIVE', temperature: 1.4 },
  // Regal, unhurried amused contempt — a king entertaining insects. Menace is
  // calm certainty, never volume. The one voice allowed below 1.0.
  sukuna: { voiceId: 'Malcolm', defaultEmotion: 'disgust', rate: 0.95, deliveryMode: 'BALANCED', temperature: 1.1 },
  // Lazy gravel-flat drawl; bored even when threatening — disinterest IS the
  // intimidation. Dry, transactional, controlled.
  toji: { voiceId: 'Levi', defaultEmotion: 'whisper', rate: 1.0, deliveryMode: 'STABLE', temperature: 0.8 },
  // Quiet, even, deliberate; solemn earnestness with melancholy underneath.
  // Intensity rises as conviction, not volume.
  choso: { voiceId: 'Tristan', defaultEmotion: 'sad', rate: 1.05, deliveryMode: 'STABLE', temperature: 0.9 },
  // Composed salaryman baritone; irritation as tightened precision, never
  // raised voice. Efficient — no wasted syllables.
  nanami: { voiceId: 'Derek', defaultEmotion: 'sad', rate: 1.1, deliveryMode: 'STABLE', temperature: 0.8 },
  // Rich sermon voice — unfailingly gentle surface; the horror is how
  // pleasantly he says monstrous things. Smile audible in every line.
  geto: { voiceId: 'Blake', defaultEmotion: 'happy', rate: 1.05, deliveryMode: 'BALANCED', temperature: 1.0 },
}
