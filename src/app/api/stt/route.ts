// POST /api/stt FormData(audio) → { text, emotion?, ms }
import { sttBatch } from '@/lib/inworld'

export async function POST(req: Request) {
  const t0 = Date.now()
  let audio: FormDataEntryValue | null
  try {
    audio = (await req.formData()).get('audio')
  } catch {
    return Response.json({ error: 'expected multipart FormData' }, { status: 400 })
  }
  if (!(audio instanceof Blob)) {
    return Response.json({ error: 'FormData field "audio" (file) is required' }, { status: 400 })
  }
  try {
    const { text, emotion } = await sttBatch(audio, audio.type || 'audio/webm')
    return Response.json({ text, emotion, ms: Date.now() - t0 })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
