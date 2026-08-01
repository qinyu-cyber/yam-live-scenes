// Live smoke test for Inworld batch STT. Run: bun scripts/smoke-stt.ts (after smoke-tts).
// Writes scripts/stt.report.json.
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = path.join(ROOT, 'scripts', 'stt.report.json')
const SAMPLE = path.join(ROOT, 'scripts', 'fixtures', 'sample.mp3')
// Must match TEST_LINE in smoke-tts.ts (that's what sample.mp3 says).
const EXPECTED = 'Well well, look who finally showed up to the party.'

const KEY = process.env.INWORLD_API_KEY
if (!KEY) {
  await writeFile(
    REPORT,
    JSON.stringify({ status: 'deferred - no .env', notes: 'INWORLD_API_KEY missing' }, null, 2),
  )
  console.log('deferred - no .env (INWORLD_API_KEY missing)')
  process.exit(0)
}

const notes: string[] = []
let audio: Buffer
try {
  audio = await readFile(SAMPLE)
} catch {
  await writeFile(
    REPORT,
    JSON.stringify({ status: 'failed', notes: 'fixtures/sample.mp3 missing — run smoke:tts first' }, null, 2),
  )
  console.log('failed: run smoke:tts first to produce fixtures/sample.mp3')
  process.exit(1)
}

const t0 = Date.now()
let transcript = ''
let emotionField: string | null = null
let roundtripMs = -1
try {
  const res = await fetch('https://api.inworld.ai/stt/v1/transcribe', {
    method: 'POST',
    headers: { Authorization: `Basic ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcribeConfig: { modelId: 'groq/whisper-large-v3', audioEncoding: 'AUTO_DETECT', language: 'en' },
      audioData: { content: audio.toString('base64') },
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  roundtripMs = Date.now() - t0
  const json = (await res.json()) as Record<string, unknown>
  const transcription = (json.transcription ?? {}) as Record<string, unknown>
  transcript = String(transcription.transcript ?? '')
  notes.push(`response top-level keys: ${Object.keys(json).join(',')}`)
  notes.push(`transcription keys: ${Object.keys(transcription).join(',')}`)
  const emo = Object.keys(transcription).find((k) => /emotion|profile|paralinguistic/i.test(k))
  emotionField = emo ?? null
  notes.push(`transcript: "${transcript}"`)
} catch (err) {
  notes.push(`transcribe failed: ${err}`)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim()
const transcriptMatches = roundtripMs >= 0 && norm(transcript).includes(norm(EXPECTED).slice(0, 30))

const report = {
  status: roundtripMs >= 0 ? 'ok' : 'failed',
  roundtripMs,
  transcriptMatches,
  emotionField,
  webmOpus: 'untested' as const, // no ffmpeg in env to fabricate a webm/opus container
  notes,
}
await writeFile(REPORT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
