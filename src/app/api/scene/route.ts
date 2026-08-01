import { appendFile, mkdir } from 'fs/promises'
import path from 'path'
import type { Beat, RelScores, SceneStreamLine, SceneTimings } from '@/lib/types'
import { classifyStance, addressedCharacter } from '@/lib/stance'
import { streamBranch } from '@/lib/llm'
import { REACTION_LINES } from '../../../../content/reactionLines'
import { PREAUTHORED_BRANCHES } from '../../../../content/branches'
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
    return Response.json({ error: 'empty transcript' }, { status: 400 })
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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: SceneStreamLine) =>
        controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))

      send({ type: 'meta', stance, reactionLineId: reaction.id, relDeltas })

      const emitted: Beat[] = []
      let firstTokenMs: number | null = null
      let provider: 'tenstorrent' | 'claude' | undefined
      try {
        const result = await streamBranch({ transcript, emotion, stance }, (beat) => {
          emitted.push(beat)
          send({ type: 'beat', beat })
        })
        firstTokenMs = result.firstTokenMs
        provider = result.provider ?? undefined
      } catch (err) {
        console.error('[scene] branch stream failed:', err)
      }

      let branch: 'live' | 'preauthored' = 'live'
      if (emitted.length === 0) {
        branch = 'preauthored'
        for (const beat of PREAUTHORED_BRANCHES[stance]) {
          emitted.push(beat)
          send({ type: 'beat', beat })
        }
      }

      const timings: SceneTimings = {
        stanceMs,
        llmFirstTokenMs: firstTokenMs ?? undefined,
        totalMs: Date.now() - t0,
      }
      send({ type: 'done', branch, provider, timings })
      controller.close()

      // Turn dataset (eval/harness/dataset loop) — gitignored jsonl
      try {
        const dir = path.join(process.cwd(), 'data')
        await mkdir(dir, { recursive: true })
        await appendFile(
          path.join(dir, 'turns.jsonl'),
          JSON.stringify({
            ts: new Date().toISOString(),
            transcript,
            emotion,
            stance,
            reactionLineId: reaction.id,
            relDeltas,
            branch,
            provider,
            beats: emitted,
            timings,
          }) + '\n',
        )
      } catch {
        // logging must never break the demo
      }
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}
