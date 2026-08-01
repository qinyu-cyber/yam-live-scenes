// Inworld voice assignments, picked from the live catalog (scripts/voices.report.json
// has the raw list run) by matching catalog descriptions to each character's
// speechStyle. defaultEmotion is the baseline steering tag when a beat carries none.

import type { CharId } from '../src/lib/types'

export const VOICES: Record<CharId, { voiceId: string; defaultEmotion: string }> = {
  // "Energetic and expressive mid-range male voice, with a mildly nasal quality"
  gojo: { voiceId: 'Alex', defaultEmotion: 'happy' },
  // "Authoritative, manipulative male voice, perfect for cunning leaders"
  sukuna: { voiceId: 'Malcolm', defaultEmotion: 'angry' },
  // "Measured, ominous male voice, ideal for suspense narration ... composed"
  toji: { voiceId: 'Levi', defaultEmotion: 'happy' },
  // "Deliberate, controlled male voice, ideal for documentary narration"
  choso: { voiceId: 'Tristan', defaultEmotion: 'whisper' },
  // "Steady, professional, composed American male voice, ideal for banking support"
  nanami: { voiceId: 'Derek', defaultEmotion: 'sad' },
  // "Rich, intimate male voice, perfect for ... reassuring narration"
  geto: { voiceId: 'Blake', defaultEmotion: 'whisper' },
}
