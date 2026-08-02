// Stance classification + addressed-character resolution for the player's
// transcribed answer. Deterministic — never AI.

import type { CharId, Stance } from './types'
import { CAST } from '../../content/cast'

// Ordered keyword tiers; first hit wins. Fallback keeps the show moving in
// the most dramatic direction. Word-bounded — unanchored substrings misfired
// ("totALLY" matched ally, "reALly" matched real).
const TIERS: Array<[RegExp, Stance]> = [
  [/\b(hot|steal|drama|burn|chaos|villain|fire)\b/, 'villain_romance'],
  [/\b(love|real|soulmate|worth|heart|marry)\b/, 'soulmate'],
  [/\b(friend|friends|cool|chill|nice|vibe|vibes|ally|allies)\b/, 'friendship_finale'],
  [/\b(watch|wait|observe|quiet|strike|mysterious)\b/, 'alone_but_iconic'],
]

export function classifyStance(reply: string): { stance: Stance; matched: 'keyword' | 'fallback' } {
  const text = reply.toLowerCase()
  for (const [pattern, stance] of TIERS) {
    if (pattern.test(text)) return { stance, matched: 'keyword' }
  }
  return { stance: 'villain_romance', matched: 'fallback' }
}

function mentionIndex(reply: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(reply)
  return match ? match.index : -1
}

/**
 * WHO the reply addresses, or null for a general answer. Full-name matches
 * beat single-name matches; among equals the earliest mention wins; a single
 * name shared by 2+ cast members never targets (only the full name can).
 */
export function addressedCharacter(reply: string): CharId | null {
  const tokenCounts = new Map<string, number>()
  for (const member of CAST) {
    for (const token of member.name.toLowerCase().split(' ')) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
    }
  }

  let best: { id: CharId; index: number; fullName: boolean } | null = null
  for (const member of CAST) {
    const candidates: Array<{ text: string; fullName: boolean }> = [
      { text: member.name, fullName: true },
    ]
    for (const token of member.name.split(' ')) {
      if ((tokenCounts.get(token.toLowerCase()) ?? 0) === 1) {
        candidates.push({ text: token, fullName: false })
      }
    }
    for (const candidate of candidates) {
      const index = mentionIndex(reply, candidate.text)
      if (index < 0) continue
      const wins =
        best === null ||
        (candidate.fullName && !best.fullName) ||
        (candidate.fullName === best.fullName && index < best.index)
      if (wins) best = { id: member.id, index, fullName: candidate.fullName }
    }
  }
  return best?.id ?? null
}
