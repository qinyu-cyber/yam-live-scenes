// Private-call relay for Inworld's Realtime speech-to-speech API. The browser
// can't authenticate the WS, so the server holds it: POST ?op=start configures
// a session as ONE character (aware of the group chat; the group can't hear),
// GET ?op=events streams NDJSON events back (audio deltas, captions, barge-in),
// POST ?op=audio feeds mic PCM, POST ?op=stop returns the call transcript.
import { randomUUID } from 'crypto'
import WebSocket from 'ws'
import type { CharId, HistoryEntry } from '@/lib/types'
import { CAST, idToName, NAME_TO_ID } from '../../../../content/cast'
import { VOICES } from '../../../../content/voices'
import { OPENING } from '../../../../content/openingScene'

export const runtime = 'nodejs'

type RelayEvent =
  | { type: 'audio'; b64: string }
  | { type: 'char_text'; delta: string }
  | { type: 'user_text'; text: string }
  | { type: 'speech_started' }
  | { type: 'response_done' }
  | { type: 'closed' }

type CallSession = {
  ws: WebSocket
  ready: Promise<void>
  queue: RelayEvent[]
  wake: (() => void) | null
  transcript: Array<{ who: 'player' | CharId; text: string }>
  charId: CharId
  charTextBuf: string
  startedAt: number
}

const sessions = new Map<string, CallSession>()

function push(s: CallSession, ev: RelayEvent): void {
  s.queue.push(ev)
  s.wake?.()
  s.wake = null
}

function cleanup(sid: string): void {
  const s = sessions.get(sid)
  if (!s) return
  sessions.delete(sid)
  push(s, { type: 'closed' })
  try {
    s.ws.close()
  } catch {
    // already closed
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    if (now - s.startedAt > 10 * 60_000) cleanup(sid)
  }
}, 60_000).unref()

function buildInstructions(charId: CharId, history: HistoryEntry[]): string {
  const c = CAST.find((m) => m.id === charId)!
  const groupLines = history
    .slice(-16)
    .map((h) => `${h.who === 'player' ? 'PLAYER' : idToName(h.who)}: ${h.text}`)
    .join('\n')
  return [
    `You are ${c.name} on the villa reality show. The player just pulled you aside for a PRIVATE one-on-one call — the rest of the cast cannot hear a word of this.`,
    `Personality: ${c.personality}`,
    `Speech style: ${c.speechStyle} Example of your voice: "${c.speechExample}"`,
    `What has happened so far (you were there for all of it):`,
    `THE OPENING: ${OPENING.sceneText}`,
    groupLines ? `GROUP CONVERSATION SO FAR:\n${groupLines}` : '',
    `RULES: This is intimate, off-camera talk — you can say things here you would never say in front of the group. Stay completely in character. React to what the player actually says. Spoken replies only, 1-3 sentences, no narration, no stage directions. Refer to group events naturally when relevant.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const op = url.searchParams.get('op')

  if (op === 'start') {
    const body = (await req.json()) as { charId?: string; history?: HistoryEntry[] }
    const charId = NAME_TO_ID[String(body.charId ?? '').toLowerCase()]
    if (!charId) return Response.json({ error: 'unknown charId' }, { status: 400 })
    const key = process.env.INWORLD_API_KEY
    if (!key) return Response.json({ error: 'INWORLD_API_KEY not set' }, { status: 500 })

    const ws = new WebSocket('wss://api.inworld.ai/api/v1/realtime/session', {
      headers: { Authorization: `Basic ${key}` },
    })
    let resolveReady!: () => void
    let rejectReady!: (e: Error) => void
    const ready = new Promise<void>((res, rej) => {
      resolveReady = res
      rejectReady = rej
    })
    const session: CallSession = {
      ws,
      ready,
      queue: [],
      wake: null,
      transcript: [],
      charId,
      charTextBuf: '',
      startedAt: Date.now(),
    }
    const voice = VOICES[charId]

    ws.on('message', (data) => {
      try {
        const d = JSON.parse(String(data))
        switch (d.type) {
          case 'session.created':
            ws.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  model: process.env.INWORLD_ROUTER_MODEL ?? 'openai/gpt-4o-mini',
                  instructions: buildInstructions(charId, body.history ?? []),
                  output_modalities: ['text', 'audio'],
                  audio: {
                    input: {
                      format: { type: 'audio/pcm', rate: 24000 },
                      transcription: { model: 'inworld/inworld-stt-1' },
                      turn_detection: {
                        type: 'server_vad',
                        create_response: true,
                        interrupt_response: true,
                      },
                    },
                    output: {
                      format: { type: 'audio/pcm', rate: 24000 },
                      voice: voice.voiceId,
                      model: 'inworld-tts-2',
                      speed: voice.rate,
                    },
                  },
                },
              }),
            )
            break
          case 'session.updated':
            resolveReady()
            break
          case 'response.output_audio.delta':
            if (d.delta) push(session, { type: 'audio', b64: d.delta })
            break
          case 'response.output_audio_transcript.delta':
            if (d.delta) {
              session.charTextBuf += d.delta
              push(session, { type: 'char_text', delta: d.delta })
            }
            break
          case 'conversation.item.input_audio_transcription.completed': {
            const text = (d.transcript ?? d.text ?? '').trim()
            if (text) {
              session.transcript.push({ who: 'player', text })
              push(session, { type: 'user_text', text })
            }
            break
          }
          case 'input_audio_buffer.speech_started':
            push(session, { type: 'speech_started' }) // client clears scheduled audio
            break
          case 'response.done':
            if (session.charTextBuf.trim()) {
              session.transcript.push({ who: charId, text: session.charTextBuf.trim() })
              session.charTextBuf = ''
            }
            push(session, { type: 'response_done' })
            break
        }
      } catch {
        // non-JSON frame
      }
    })
    ws.on('error', (err) => {
      console.error('[realtime] ws error:', String(err).slice(0, 120))
      rejectReady(err as Error)
    })
    ws.on('close', () => push(session, { type: 'closed' }))

    const sid = randomUUID()
    sessions.set(sid, session)
    try {
      await ready
      return Response.json({ sid })
    } catch (err) {
      cleanup(sid)
      return Response.json({ error: String(err) }, { status: 502 })
    }
  }

  const sid = url.searchParams.get('sid') ?? ''
  const session = sessions.get(sid)
  if (!session) return Response.json({ error: 'unknown session' }, { status: 410 })

  if (op === 'audio') {
    const pcm = Buffer.from(await req.arrayBuffer())
    if (pcm.length > 0 && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(
        JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') }),
      )
    }
    return new Response(null, { status: 204 })
  }

  // Force the turn to end now (server VAD normally does this from real mic
  // silence; synthetic audio without a noise floor may never trigger it).
  if (op === 'commit') {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    }
    return new Response(null, { status: 204 })
  }

  if (op === 'stop') {
    const transcript = session.transcript
    cleanup(sid)
    return Response.json({ transcript })
  }

  return Response.json({ error: 'unknown op' }, { status: 400 })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sid = url.searchParams.get('sid') ?? ''
  const session = sessions.get(sid)
  if (!session) return Response.json({ error: 'unknown session' }, { status: 410 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for (;;) {
        while (session.queue.length > 0) {
          const ev = session.queue.shift()!
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'))
          if (ev.type === 'closed') {
            controller.close()
            return
          }
        }
        if (!sessions.has(sid)) {
          controller.close()
          return
        }
        await new Promise<void>((r) => {
          session.wake = r
          setTimeout(r, 500) // safety tick
        })
      }
    },
    cancel() {
      cleanup(sid)
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
}
