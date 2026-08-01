// Tiny turn-metrics helper: absolute performance.now() marks per turn,
// reported as ms deltas from mic_release.

export type TurnMark =
  | 'mic_release'
  | 'stt_done'
  | 'stance_done'
  | 'llm_first_token'
  | 'tts_first_audio'
  | 'playback_start'

type Turn = Partial<Record<TurnMark, number>>

let turn: Turn = {}
const past: Turn[] = [] // ring buffer of 20 finished turns
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((cb) => cb())
}

function deltas(t: Turn): Record<string, number> {
  const base = t.mic_release ?? 0
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(t)) out[k] = Math.round(v - base)
  return out
}

export function newTurn(): void {
  if (Object.keys(turn).length > 0) {
    past.push(turn)
    if (past.length > 20) past.shift()
  }
  turn = {}
  notify()
}

export function markTurn(name: TurnMark): void {
  turn[name] = performance.now()
  notify()
}

export function currentTurn(): Record<string, number> {
  return deltas(turn)
}

export function history(): Record<string, number>[] {
  return past.map(deltas)
}

export function logTable(): void {
  console.table([...history(), currentTurn()])
}

export function onUpdate(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
