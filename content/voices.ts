// Inworld voice assignments, picked from the live catalog (scripts/voices.report.json
// has the raw list run) by matching catalog descriptions to each character's
// speechStyle. defaultEmotion is the baseline steering tag when a beat carries
// none; rate is Inworld's speakingRate [0.5, 1.5] — tuned up from 1.0 after
// rehearsal feedback that delivery dragged.

import type { CharId } from '../src/lib/types'

export const VOICES: Record<CharId, { voiceId: string; defaultEmotion: string; rate: number }> = {
  // "Energetic and expressive mid-range male voice, with a mildly nasal quality"
  gojo: { voiceId: 'Alex', defaultEmotion: 'happy', rate: 1.25 },
  // "Authoritative, manipulative male voice, perfect for cunning leaders"
  sukuna: { voiceId: 'Malcolm', defaultEmotion: 'angry', rate: 1.05 },
  // "Measured, ominous male voice, ideal for suspense narration ... composed"
  toji: { voiceId: 'Levi', defaultEmotion: 'happy', rate: 1.1 },
  // "Deliberate, controlled male voice, ideal for documentary narration"
  choso: { voiceId: 'Tristan', defaultEmotion: 'whisper', rate: 1.1 },
  // "Steady, professional, composed American male voice, ideal for banking support"
  nanami: { voiceId: 'Derek', defaultEmotion: 'sad', rate: 1.15 },
  // "Rich, intimate male voice, perfect for ... reassuring narration"
  geto: { voiceId: 'Blake', defaultEmotion: 'whisper', rate: 1.0 },
}
