// Defensive clamps for LLM branch output. Caps mirror the reference shapes:
// 300 chars/line, 12 beats, 120-char question.

import type { Beat } from '../src/lib/types'
import { NAME_TO_ID } from './cast'

const MAX_BEATS = 12
const MAX_LINE_CHARS = 300
const MAX_QUESTION_CHARS = 120

/** Accepts parsed JSON — either a beats array or `{ beats: [...] }`. Drops
 * junk entries, resolves speakers to CharIds (unresolvable = dropped, which
 * also drops any attempt to speak as the player), trims and caps lines. */
export function sanitizeBeats(raw: unknown): Beat[] {
  const list = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as { beats?: unknown }).beats)
      ? ((raw as { beats: unknown[] }).beats)
      : []
  const out: Beat[] = []
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue
    const rec = entry as Record<string, unknown>
    const speaker =
      typeof rec.speaker === 'string' ? NAME_TO_ID[rec.speaker.trim().toLowerCase()] : undefined
    const line = typeof rec.line === 'string' ? rec.line.trim().slice(0, MAX_LINE_CHARS) : ''
    if (!speaker || line.length === 0) continue
    const emotion = typeof rec.emotion === 'string' ? rec.emotion.trim() : ''
    const beat: Beat = emotion ? { speaker, line, emotion } : { speaker, line }
    if (rec.cutoff === true) beat.cutoff = true
    out.push(beat)
    if (out.length >= MAX_BEATS) break
  }
  return out
}

/** Trim + clamp a question; guarantees it ends in "?". Null when unusable. */
export function sanitizeQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let q = raw.trim().slice(0, MAX_QUESTION_CHARS)
  if (q.length === 0) return null
  if (!q.endsWith('?')) q = q.slice(0, MAX_QUESTION_CHARS - 1) + '?'
  return q
}
