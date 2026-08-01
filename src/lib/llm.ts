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

export async function streamBranch(
  params: { transcript: string; emotion?: string; stance: Stance },
  onBeat: (beat: Beat) => void,
): Promise<{ beatCount: number; firstTokenMs: number | null; totalMs: number }> {
  const start = Date.now()
  let firstTokenMs: number | null = null
  let beatCount = 0

  const userPrompt = [
    `SCENE SO FAR:\n${OPENING.sceneText}`,
    OPENING.beats.map((b) => `${b.speaker}: ${b.line}`).join('\n'),
    `\nTHE PLAYER ANSWERED (by voice): "${params.transcript}"`,
    params.emotion ? `Detected voice emotion: ${params.emotion}` : '',
    `Classified stance: ${params.stance}`,
    `\nWrite the next 4-6 beats.`,
  ]
    .filter(Boolean)
    .join('\n')

  const scanner = new BeatScanner((obj) => {
    const [beat] = sanitizeBeats([obj])
    if (beat) {
      beatCount++
      onBeat(beat)
    }
  })

  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 1500,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: BEATS_SCHEMA },
    },
    system: BRANCH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  stream.on('text', (delta) => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - start
    scanner.push(delta)
  })

  await stream.finalMessage()
  return { beatCount, firstTokenMs, totalMs: Date.now() - start }
}
