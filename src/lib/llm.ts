// Server-side branch writer. Claude is primary (the Tenstorrent probe found no
// chat endpoint). Non-streaming Opus takes ~7-9s for a full branch — too slow
// for the reaction-line mask — so we STREAM and emit each beat the moment its
// JSON object completes (~3s to first beat), letting playback start while the
// rest still generates. Zero usable beats → the route falls back to the
// pre-authored branch for the stance.

import Anthropic from '@anthropic-ai/sdk'
import type { Beat, HistoryEntry, Stance } from './types'
import { idToName } from '../../content/cast'
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
  vocalStyle?: string
  stance: Stance
  /** Display name of the character the player addressed by name, if any. */
  addressed?: string
  /** Post-opening conversation as actually heard (client-tracked). */
  history?: HistoryEntry[]
}

function formatHistory(history: HistoryEntry[] | undefined): string {
  if (!history?.length) return ''
  const lines = history.map((h) => {
    const who = h.who === 'player' ? 'PLAYER' : idToName(h.who)
    const voice = h.who === 'player' && h.emotion ? ` [voice: ${h.emotion}]` : ''
    return `${who}${voice}: ${h.text}${h.cut ? ' (cut off by the player)' : ''}`
  })
  return `CONVERSATION SINCE THE OPENING (everyone heard all of this):\n${lines.join('\n')}`
}

// Static scene context — identical every turn, so Claude caches it as a prompt
// prefix (faster first token + cheaper) and Qwen gets it inline.
const SCENE_CONTEXT = [
  `SCENE SO FAR:\n${OPENING.sceneText}`,
  OPENING.beats.map((b) => `${b.speaker}: ${b.line}`).join('\n'),
].join('\n')

function buildTurnPrompt(params: BranchParams): string {
  return [
    formatHistory(params.history),
    `THE PLAYER JUST SAID (by voice): "${params.transcript}"`,
    params.emotion || params.vocalStyle
      ? `Their VOICE sounded: ${[params.emotion, params.vocalStyle].filter(Boolean).join(', ')} — apply the voice-shapes-the-room rule.`
      : '',
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

export type Provider = 'inworld' | 'claude' | 'tenstorrent'

// Three-way race: Inworld Router gpt-4o-mini (fastest — measured 810ms TTFT,
// streamed), Claude opus-5 (strongest writing, streamed, cached prefix), and
// Tenstorrent Qwen3-32B (all-at-once). The first provider to produce a usable
// beat claims the whole turn; the others are aborted/discarded. Any one — or
// two — failing is invisible to the player.
export async function streamBranch(
  params: BranchParams,
  onBeat: (beat: Beat) => void,
): Promise<{
  beatCount: number
  firstTokenMs: number | null
  totalMs: number
  provider: Provider | null
}> {
  const start = Date.now()
  let firstTokenMs: number | null = null
  let beatCount = 0
  let committed: Provider | null = null
  const userPrompt = buildTurnPrompt(params)
  const inworldAbort = new AbortController()

  const claim = (me: Provider): boolean => {
    if (committed === null) {
      committed = me
      if (firstTokenMs === null) firstTokenMs = Date.now() - start
      if (me !== 'claude') stream.controller.abort()
      if (me !== 'inworld') inworldAbort.abort()
    }
    return committed === me
  }

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

  const claudeScanner = new BeatScanner((obj) => {
    const [beat] = sanitizeBeats([obj])
    if (beat && claim('claude')) {
      beatCount++
      onBeat(beat)
    }
  })
  stream.on('text', (delta) => claudeScanner.push(delta))
  const claudeDone = stream
    .finalMessage()
    .then(() => {})
    .catch((err) => {
      if (committed === 'claude' || committed === null)
        console.warn('[llm] claude out:', String(err).slice(0, 100))
    })

  // Inworld Router (OpenAI-compatible SSE) — same Basic key as TTS/STT.
  const inworldDone = (async () => {
    const key = process.env.INWORLD_API_KEY
    if (!key) throw new Error('INWORLD_API_KEY not set')
    const res = await fetch('https://api.inworld.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Basic ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        // gemini-3.1-flash is the preferred lane but is billing-gated on the
        // Inworld plan — set INWORLD_ROUTER_MODEL once billing is enabled.
        model: process.env.INWORLD_ROUTER_MODEL ?? 'openai/gpt-4o-mini',
        stream: true,
        max_tokens: 900, // plan-capped at 1000
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${BRANCH_SYSTEM_PROMPT}\n\n${SCENE_CONTEXT}` },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: inworldAbort.signal,
    })
    if (!res.ok || !res.body) throw new Error(`Inworld router ${res.status}`)
    const scanner = new BeatScanner((obj) => {
      const [beat] = sanitizeBeats([obj])
      if (beat && claim('inworld')) {
        beatCount++
        onBeat(beat)
      }
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content
          if (typeof delta === 'string') scanner.push(delta)
        } catch {
          // partial SSE line — skip
        }
      }
    }
  })().catch((err) => {
    if (committed === null) console.warn('[llm] inworld router out:', String(err).slice(0, 100))
  })

  const ttDone = tenstorrentBranch(userPrompt)
    .then((beats) => {
      if (!claim('tenstorrent')) return // someone is already speaking
      for (const beat of beats) {
        beatCount++
        onBeat(beat)
      }
    })
    .catch((err) => console.warn('[llm] tenstorrent out:', String(err).slice(0, 100)))

  await Promise.allSettled([claudeDone, inworldDone, ttDone])
  return { beatCount, firstTokenMs, totalMs: Date.now() - start, provider: committed }
}
