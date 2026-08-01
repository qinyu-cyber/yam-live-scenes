// Server-side branch writer. Claude is primary (the Tenstorrent probe found no
// chat endpoint). Non-streaming Opus takes ~7-9s for a full branch — too slow
// for the reaction-line mask — so we STREAM and emit each beat the moment its
// JSON object completes (~3s to first beat), letting playback start while the
// rest still generates. Zero usable beats → the route falls back to the
// pre-authored branch for the stance.

import Anthropic from '@anthropic-ai/sdk'
import type { Beat, Stance } from './types'
import { BRANCH_SYSTEM_PROMPT } from '../../content/prompts'
import { OPENING } from '../../content/openingScene'
import { sanitizeBeats } from '../../content/sanitize'

const LLM_CEILING_MS = 15000

const BEATS_SCHEMA = {
  type: 'object' as const,
  properties: {
    beats: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          speaker: { type: 'string' as const },
          line: { type: 'string' as const },
          emotion: { type: 'string' as const },
          cutoff: { type: 'boolean' as const },
        },
        required: ['speaker', 'line', 'emotion'],
        additionalProperties: false,
      },
    },
  },
  required: ['beats'],
  additionalProperties: false,
}

// Incremental extractor: feeds on text deltas, emits each complete depth-2
// object (a beat) as soon as its closing brace streams in.
class BeatScanner {
  private buf = ''
  private pos = 0
  private depth = 0
  private inStr = false
  private esc = false
  private objStart = -1

  constructor(private emit: (obj: unknown) => void) {}

  push(delta: string): void {
    this.buf += delta
    for (; this.pos < this.buf.length; this.pos++) {
      const c = this.buf[this.pos]
      if (this.inStr) {
        if (this.esc) this.esc = false
        else if (c === '\\') this.esc = true
        else if (c === '"') this.inStr = false
        continue
      }
      if (c === '"') this.inStr = true
      else if (c === '{') {
        this.depth++
        if (this.depth === 2 && this.objStart < 0) this.objStart = this.pos
      } else if (c === '}') {
        if (this.depth === 2 && this.objStart >= 0) {
          try {
            this.emit(JSON.parse(this.buf.slice(this.objStart, this.pos + 1)))
          } catch {
            // malformed object — skip
          }
          this.objStart = -1
        }
        this.depth--
      }
    }
  }
}

const client = new Anthropic({ maxRetries: 0, timeout: LLM_CEILING_MS })

export type BranchParams = {
  transcript: string
  emotion?: string
  stance: Stance
  /** Display name of the character the player addressed by name, if any. */
  addressed?: string
}

// Static scene context — identical every turn, so Claude caches it as a prompt
// prefix (faster first token + cheaper) and Qwen gets it inline.
const SCENE_CONTEXT = [
  `SCENE SO FAR:\n${OPENING.sceneText}`,
  OPENING.beats.map((b) => `${b.speaker}: ${b.line}`).join('\n'),
].join('\n')

function buildTurnPrompt(params: BranchParams): string {
  return [
    `THE PLAYER ANSWERED (by voice): "${params.transcript}"`,
    params.emotion ? `Detected voice emotion: ${params.emotion}` : '',
    `Classified stance: ${params.stance}`,
    params.addressed
      ? `The player spoke DIRECTLY to ${params.addressed}. ${params.addressed} MUST speak first and actually answer what was asked; others react after.`
      : '',
    `\nWrite the next 4-6 beats.`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Tenstorrent-hosted Qwen3-32B (probe: chat endpoint live, ~1.6s). Non-streaming;
// Qwen may wrap output in <think> blocks or code fences — strip and extract JSON.
async function tenstorrentBranch(userPrompt: string): Promise<Beat[]> {
  const key = process.env.TENSTORRENT_API_KEY
  if (!key) throw new Error('TENSTORRENT_API_KEY not set')
  const res = await fetch('https://console.tenstorrent.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen/Qwen3-32B',
      max_tokens: 1200,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: `${BRANCH_SYSTEM_PROMPT}\n\n${SCENE_CONTEXT}` },
        { role: 'user', content: `${userPrompt} /no_think` },
      ],
    }),
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Tenstorrent ${res.status}`)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = (json.choices?.[0]?.message?.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON in Tenstorrent reply')
  const beats = sanitizeBeats(JSON.parse(raw.slice(start, end + 1)))
  if (beats.length < 2) throw new Error(`too few beats: ${beats.length}`)
  return beats
}

// Race: Tenstorrent (fast, all-at-once) vs Claude (streamed beat-by-beat).
// Whichever produces the first usable beat commits the turn; the loser is
// discarded/aborted. Either failing alone is invisible to the player.
export async function streamBranch(
  params: BranchParams,
  onBeat: (beat: Beat) => void,
): Promise<{
  beatCount: number
  firstTokenMs: number | null
  totalMs: number
  provider: 'tenstorrent' | 'claude' | null
}> {
  const start = Date.now()
  let firstTokenMs: number | null = null
  let beatCount = 0
  let committed: 'tenstorrent' | 'claude' | null = null
  const userPrompt = buildTurnPrompt(params)

  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 1500,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: BEATS_SCHEMA },
    },
    // Everything static rides in a cached prefix; only the turn varies.
    system: [
      {
        type: 'text',
        text: `${BRANCH_SYSTEM_PROMPT}\n\n${SCENE_CONTEXT}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const scanner = new BeatScanner((obj) => {
    if (committed === 'tenstorrent') return
    const [beat] = sanitizeBeats([obj])
    if (beat) {
      committed = 'claude'
      beatCount++
      onBeat(beat)
    }
  })

  stream.on('text', (delta) => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - start
    scanner.push(delta)
  })

  const claudeDone = stream
    .finalMessage()
    .then(() => {})
    .catch((err) => {
      if (committed !== 'tenstorrent') console.error('[llm] claude failed:', err)
    })

  const ttDone = tenstorrentBranch(userPrompt)
    .then((beats) => {
      if (committed !== null) return // Claude already speaking — discard
      committed = 'tenstorrent'
      if (firstTokenMs === null) firstTokenMs = Date.now() - start
      for (const beat of beats) {
        beatCount++
        onBeat(beat)
      }
      stream.controller.abort()
    })
    .catch((err) => console.warn('[llm] tenstorrent lost the race:', String(err).slice(0, 120)))

  await Promise.allSettled([claudeDone, ttDone])
  return { beatCount, firstTokenMs, totalMs: Date.now() - start, provider: committed }
}
