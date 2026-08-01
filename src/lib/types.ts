// Shared contracts for YAM Live Scenes. Every module imports from here — do not redeclare these shapes.

export type CharId = 'gojo' | 'sukuna' | 'toji' | 'choso' | 'nanami' | 'geto'

// The only place dialogue lives. Never prose. `emotion` is an Inworld steering tag
// (e.g. "happy", "whisper") rendered as a [tag] prefix at TTS time.
export type Beat = { speaker: CharId; line: string; emotion?: string }

export type Stance =
  | 'villain_romance'
  | 'soulmate'
  | 'alone_but_iconic'
  | 'friendship_finale'

export type EngineState = 'idle' | 'playing' | 'listening' | 'thinking'

export interface Stt {
  start(): void
  stop(): Promise<{ text: string; emotion?: string }>
}

// Per-character relationship scores, shown in the DebugPanel.
export type RelScores = Partial<Record<CharId, number>>

export type SceneTimings = {
  sttMs?: number
  stanceMs?: number
  llmFirstTokenMs?: number
  totalMs?: number
}

// API shapes (implemented in src/app/api/*):
// POST /api/tts   { text, voiceId, emotion? } -> streamed passthrough of Inworld voice:stream
// POST /api/stt   FormData(audio)             -> { text: string, emotion?: string, ms: number }
// POST /api/scene { transcript, emotion? }    -> NDJSON stream of SceneStreamLine
//   (streamed so the client can voice beat 1 while the rest still generates)
export type SceneStreamLine =
  | { type: 'meta'; stance: Stance; reactionLineId: string; relDeltas: RelScores }
  | { type: 'beat'; beat: Beat }
  | { type: 'done'; branch: 'live' | 'preauthored'; timings: SceneTimings }
