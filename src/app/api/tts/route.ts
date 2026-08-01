// POST /api/tts { text, voiceId, emotion? } → streamed NDJSON passthrough of Inworld voice:stream.
// Disk cache keyed on hash(text+voiceId+emotion) under .cache/tts/ — always on (hackathon).
import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { ttsStream, TTS_MODEL } from '@/lib/inworld'

export async function POST(req: Request) {
  const { text, voiceId, emotion, rate, deliveryMode, temperature } = (await req.json()) as {
    text?: string
    voiceId?: string
    emotion?: string
    rate?: number
    deliveryMode?: 'STABLE' | 'BALANCED' | 'CREATIVE'
    temperature?: number
  }
  if (!text || !voiceId) {
    return Response.json({ error: 'text and voiceId are required' }, { status: 400 })
  }
  if (text.length > 200) {
    return Response.json({ error: 'text exceeds 200 chars' }, { status: 400 })
  }

  const fullText = emotion ? `[${emotion}] ${text}` : text
  const opts = {
    rate: typeof rate === 'number' ? rate : 1.0,
    deliveryMode,
    temperature,
  }
  const hash = createHash('sha1')
    .update(
      `${TTS_MODEL}|${fullText}|${voiceId}|${opts.rate}|${opts.deliveryMode ?? ''}|${opts.temperature ?? ''}`,
    )
    .digest('hex')
  const cacheFile = path.join(process.cwd(), '.cache', 'tts', `${hash}.ndjson`)
  const ndjsonHeaders = { 'Content-Type': 'application/x-ndjson' }

  try {
    const cached = await readFile(cacheFile)
    return new Response(new Uint8Array(cached), { headers: { ...ndjsonHeaders, 'X-Tts-Cache': 'hit' } })
  } catch {
    // cache miss — fall through to live call
  }

  let upstream: Response
  try {
    upstream = await ttsStream(fullText, voiceId, opts)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
  if (!upstream.body) {
    return Response.json({ error: 'empty upstream body' }, { status: 502 })
  }

  // Tee: stream to client immediately, accumulate a copy for the disk cache.
  const [toClient, toCache] = upstream.body.tee()
  void (async () => {
    try {
      const chunks: Uint8Array[] = []
      const reader = toCache.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      await mkdir(path.dirname(cacheFile), { recursive: true })
      await writeFile(cacheFile, Buffer.concat(chunks))
    } catch {
      // cache write failure is non-fatal
    }
  })()

  return new Response(toClient, { headers: { ...ndjsonHeaders, 'X-Tts-Cache': 'miss' } })
}
