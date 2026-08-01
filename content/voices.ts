// Inworld voice assignments. Real voiceIds get filled in once picked from the
// Inworld catalog; defaultEmotion is the baseline steering tag when a beat
// carries none.

import type { CharId } from '../src/lib/types'

export const VOICES: Record<CharId, { voiceId: string; defaultEmotion: string }> = {
  gojo: { voiceId: 'PLACEHOLDER', defaultEmotion: 'happy' },
  sukuna: { voiceId: 'PLACEHOLDER', defaultEmotion: 'angry' },
  toji: { voiceId: 'PLACEHOLDER', defaultEmotion: 'happy' },
  choso: { voiceId: 'PLACEHOLDER', defaultEmotion: 'whisper' },
  nanami: { voiceId: 'PLACEHOLDER', defaultEmotion: 'sad' },
  geto: { voiceId: 'PLACEHOLDER', defaultEmotion: 'whisper' },
}
