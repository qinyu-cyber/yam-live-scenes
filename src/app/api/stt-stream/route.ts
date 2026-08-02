// Streaming STT relay. The browser can't authenticate a WebSocket (no headers
// on the WS API), so the server holds the Inworld WS and the client feeds PCM
// via three tiny POSTs: ?op=start → {sid}, ?op=chunk&sid= (raw PCM16 body),
// ?op=end&sid= → {text, ms}. Verified live: final transcript ~150ms after the
// last chunk vs ~700-900ms for batch.
import { randomUUID } from 'crypto'
import WebSocket from 'ws'

export const runtime = 'nodejs'

type Session = {
  ws: WebSocket
  ready: Promise<void>
  latest: string
  finals: string[]
  done: Promise<void>
  resolveDone: () => void
  startedAt: number
}

const sessions = new Map<string, Session>()

function cleanup(sid: string): void {
  const s = sessions.get(sid)
  if (!s) return
  sessions.delete(sid)
  try {
    s.ws.close()
  } catch {
    // already closed
  }
}

// Stale-session sweeper — a crashed client must not leak sockets.
setInterval(() => {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    if (now - s.startedAt > 60_000) cleanup(sid)
  }
}, 30_000).unref()

function openSession(): Session {
  const key = process.env.INWORLD_API_KEY
  if (!key) throw new Error('INWORLD_API_KEY is not set')
  const ws = new WebSocket('wss://api.inworld.ai/stt/v1/transcribe:streamBidirectional', {
    headers: { Authorization: `Basic ${key}` },
  })
  let resolveReady!: () => void
  let rejectReady!: (e: Error) => void
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res
    rejectReady = rej
  })
  let resolveDone!: () => void
  const done = new Promise<void>((res) => {
    resolveDone = res
  })
  const session: Session = { ws, ready, latest: '', finals: [], done, resolveDone, startedAt: Date.now() }

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        transcribeConfig: {
          modelId: 'inworld/inworld-stt-1',
          audioEncoding: 'LINEAR16',
          sampleRateHertz: 16000,
          language: 'en',
        },
      }),
    )
    resolveReady()
  })
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data))
      const tr = msg.result?.transcription
      if (tr?.transcript) {
        session.latest = tr.transcript
        if (tr.isFinal) session.finals.push(tr.transcript)
      }
      if (msg.result?.usage) session.resolveDone() // usage = stream fully processed
    } catch {
      // non-JSON frame — ignore
    }
  })
  ws.on('error', (err) => {
    console.error('[stt-stream] ws error:', String(err).slice(0, 120))
    rejectReady(err as Error)
    session.resolveDone()
  })
  ws.on('close', () => session.resolveDone())
  return session
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const op = url.searchParams.get('op')

  if (op === 'start') {
    const sid = randomUUID()
    try {
      const session = openSession()
      sessions.set(sid, session)
      await session.ready
      return Response.json({ sid })
    } catch (err) {
      cleanup(sid)
      return Response.json({ error: String(err) }, { status: 502 })
    }
  }

  const sid = url.searchParams.get('sid') ?? ''
  const session = sessions.get(sid)
  if (!session) return Response.json({ error: 'unknown session' }, { status: 410 })

  if (op === 'chunk') {
    const pcm = Buffer.from(await req.arrayBuffer())
    if (pcm.length > 0 && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ audioChunk: { content: pcm.toString('base64') } }))
    }
    return new Response(null, { status: 204 })
  }

  if (op === 'end') {
    const t0 = Date.now()
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ closeStream: {} }))
    }
    // usage message (or close/error) marks completion; don't hang past 2.5s
    await Promise.race([session.done, new Promise((r) => setTimeout(r, 2500))])
    const text = (session.finals.length ? session.finals.join(' ') : session.latest).trim()
    cleanup(sid)
    return Response.json({ text, ms: Date.now() - t0 })
  }

  return Response.json({ error: 'unknown op' }, { status: 400 })
}
