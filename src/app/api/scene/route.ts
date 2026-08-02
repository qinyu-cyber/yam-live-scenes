import { appendFile, mkdir } from 'fs/promises'
import path from 'path'
import type { Beat, HistoryEntry, RelScores, SceneStreamLine, SceneTimings } from '@/lib/types'
import { NAME_TO_ID } from '../../../../content/cast'
import { classifyStance, addressedCharacter } from '@/lib/stance'
import { streamBranch } from '@/lib/llm'
import { REACTION_LINES, ADDRESS_LINES } from '../../../../content/reactionLines'
import { PREAUTHORED_BRANCHES } from '../../../../content/branches'
import { OPENING } from '../../../../content/openingScene'
import { idToName } from '../../../../content/cast'

export const runtime = 'nodejs'

// GET = cache pre-warm, fired by the client during the cold open. Runs one
// throwaway branch so Claude's prompt-prefix cache and the schema compile are
// hot before the player's first real answer. Not logged to the dataset.
export async function GET() {
  try {
    await streamBranch(
      { transcript: '(warmup — ignore)', stance: 'villain_romance' },
      () => {},
    )
  } catch {
    // warmup is best-effort
  }
  return new Response(null, { status: 204 })
}

// Small relationship delta on the character the player addressed (or the
// asker), shaped by stance + detected voice emotion. Yam castDeltas, simplified.
const STANCE_DELTA: Record<string, number> = {
  villain_romance: 2,
  soulmate: 3,
  friendship_finale: 1,
  alone_but_iconic: 0,
}

// Voice-emotion valence → relationship delta modifier. Warmth lands as +1;
// negative emotion costs -1 — EXCEPT on the villain arc, where fire is
// exactly what Sukuna wants (+1 for angry/disgusted).
function emotionDelta(emotion: string | undefined, stance: string): number {
  if (!emotion) return 0
  if (['happy', 'tender', 'surprised', 'calm'].includes(emotion)) return 1
  if (['angry', 'disgusted'].includes(emotion)) return stance === 'villain_romance' ? 1 : -1
  if (['sad', 'fearful'].includes(emotion)) return -1
  return 0
}

// Defensive clamp on client-supplied history: known speakers only, capped
// lengths, most recent 20 entries.
function sanitizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryEntry[] = []
  for (const entry of raw.slice(-20)) {
    if (typeof entry !== 'object' || entry === null) continue
    const rec = entry as Record<string, unknown>
    const who = rec.who === 'player' ? 'player' : NAME_TO_ID[String(rec.who ?? '').toLowerCase()]
    const text = typeof rec.text === 'string' ? rec.text.trim().slice(0, 300) : ''
    if (!who || !text) continue
    out.push({
      who,
      text,
      ...(rec.cut === true ? { cut: true } : {}),
      ...(typeof rec.emotion === 'string' ? { emotion: rec.emotion.slice(0, 40) } : {}),
    })
  }
  return out
}

export async function POST(req: Request) {
  const t0 = Date.now()
  const body = (await req.json()) as {
    transcript: string
    emotion?: string
    vocalStyle?: string
    history?: unknown
    privateNotes?: unknown
  }
  const { transcript, emotion, vocalStyle } = body
  const history = sanitizeHistory(body.history)
  const privateNotes: Partial<Record<string, string[]>> = {}
  if (body.privateNotes && typeof body.privateNotes === 'object') {
    for (const [k, v] of Object.entries(body.privateNotes as Record<string, unknown>)) {
      const id = NAME_TO_ID[k.toLowerCase()]
      if (id && Array.isArray(v)) {
        privateNotes[id] = v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 300)).slice(-12)
      }
    }
  }
  if (!transcript?.trim()) {
    return Response.json({ error: 'empty transcript' }, { status: 400 })
  }

  const { stance } = classifyStance(transcript)
  const stanceMs = Date.now() - t0

  // Mirrors the client's pick: an addressed character acknowledges in their
  // own voice; otherwise a stance-flavored line. Keyed by transcript length —
  // deterministic and stable across replays.
  const addressed = addressedCharacter(transcript)
  const lines = addressed ? ADDRESS_LINES[addressed] : REACTION_LINES[stance]
  const reaction = lines[transcript.length % lines.length]

  const target = addressed ?? OPENING.asker
  const relDeltas: RelScores = {
    [target]: STANCE_DELTA[stance] + emotionDelta(emotion, stance),
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: SceneStreamLine) =>
        controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))

      send({ type: 'meta', stance, reactionLineId: reaction.id, relDeltas })

      const emitted: Beat[] = []
      let firstTokenMs: number | null = null
      let provider: 'inworld' | 'tenstorrent' | 'claude' | undefined
      try {
        const result = await streamBranch(
          {
            transcript,
            emotion,
            vocalStyle,
            stance,
            addressed: addressed ? idToName(addressed) : undefined,
            history,
            privateNotes,
          },
          (beat) => {
            emitted.push(beat)
            send({ type: 'beat', beat })
          },
        )
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
            vocalStyle,
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
