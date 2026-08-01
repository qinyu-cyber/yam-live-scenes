// Server-side branch writer. Claude is primary (the Tenstorrent probe found no
// chat endpoint). Hard latency ceiling: the instant reaction line masks ~6-8s,
// so a slow/failed call falls back to the pre-authored branch for the stance.

import Anthropic from '@anthropic-ai/sdk'
import type { Beat, Stance } from './types'
import { BRANCH_SYSTEM_PROMPT } from '../../content/prompts'
import { PREAUTHORED_BRANCHES } from '../../content/branches'
import { OPENING } from '../../content/openingScene'
import { sanitizeBeats } from '../../content/sanitize'

const LLM_CEILING_MS = 8000

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

const client = new Anthropic({ maxRetries: 0, timeout: LLM_CEILING_MS })

export async function writeBranch(params: {
  transcript: string
  emotion?: string
  stance: Stance
}): Promise<{ beats: Beat[]; branch: 'live' | 'preauthored'; llmMs: number }> {
  const start = Date.now()
  const userPrompt = [
    `SCENE SO FAR:\n${OPENING.sceneText}`,
    OPENING.beats.map((b) => `${b.speaker}: ${b.line}`).join('\n'),
    `\nTHE PLAYER ANSWERED (by voice): "${params.transcript}"`,
    params.emotion ? `Detected voice emotion: ${params.emotion}` : '',
    `Classified stance: ${params.stance}`,
    `\nWrite the next 4-8 beats.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: BEATS_SCHEMA },
      },
      system: BRANCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const llmMs = Date.now() - start
    if (response.stop_reason === 'refusal') throw new Error('refusal')
    const block = response.content.find((b) => b.type === 'text')
    const beats = sanitizeBeats(JSON.parse(block?.text ?? '{}'))
    if (beats.length < 2) throw new Error(`too few beats: ${beats.length}`)
    return { beats, branch: 'live', llmMs }
  } catch (err) {
    console.error('[llm] falling back to preauthored branch:', err)
    return {
      beats: PREAUTHORED_BRANCHES[params.stance],
      branch: 'preauthored',
      llmMs: Date.now() - start,
    }
  }
}
