import { NextResponse } from 'next/server'
import { appendFile, mkdir } from 'fs/promises'
import path from 'path'
import type { RelScores, SceneResponse } from '@/lib/types'
import { classifyStance, addressedCharacter } from '@/lib/stance'
import { writeBranch } from '@/lib/llm'
import { REACTION_LINES } from '../../../../content/reactionLines'
import { OPENING } from '../../../../content/openingScene'

export const runtime = 'nodejs'

// Small relationship delta on the character the player addressed (or the
// asker), shaped by stance + detected voice emotion. Yam castDeltas, simplified.
const STANCE_DELTA: Record<string, number> = {
  villain_romance: 2,
  soulmate: 3,
  friendship_finale: 1,
  alone_but_iconic: 0,
}

export async function POST(req: Request) {
  const t0 = Date.now()
  const { transcript, emotion } = (await req.json()) as {
    transcript: string
    emotion?: string
  }
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'empty transcript' }, { status: 400 })
  }

  const { stance } = classifyStance(transcript)
  const stanceMs = Date.now() - t0

  const lines = REACTION_LINES[stance]
  // Deterministic pick keyed by transcript length — stable across replays
  const reaction = lines[transcript.length % lines.length]

  const target = addressedCharacter(transcript) ?? OPENING.asker
  const relDeltas: RelScores = {
    [target]: STANCE_DELTA[stance] + (emotion === 'happy' ? 1 : 0),
  }

  const { beats, branch, llmMs } = await writeBranch({ transcript, emotion, stance })

  const body: SceneResponse = {
    stance,
    reactionLineId: reaction.id,
    beats,
    relDeltas,
    branch,
    timings: { stanceMs, llmFirstTokenMs: llmMs, totalMs: Date.now() - t0 },
  }

  // Turn dataset (eval/harness/dataset loop) — gitignored jsonl
  try {
    const dir = path.join(process.cwd(), 'data')
    await mkdir(dir, { recursive: true })
    await appendFile(
      path.join(dir, 'turns.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), transcript, emotion, ...body }) + '\n',
    )
  } catch {
    // logging must never break the demo
  }

  return NextResponse.json(body)
}
