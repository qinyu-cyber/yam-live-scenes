// Live smoke test for Inworld streaming TTS. Run: bun scripts/smoke-tts.ts
// Writes scripts/voices.report.json and scripts/fixtures/sample.mp3.
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = path.join(ROOT, 'scripts', 'voices.report.json')
const FIXTURES = path.join(ROOT, 'scripts', 'fixtures')
const TEST_LINE = 'Well well, look who finally showed up to the party.'

const KEY = process.env.INWORLD_API_KEY
if (!KEY) {
  await writeFile(
    REPORT,
    JSON.stringify({ status: 'deferred - no .env', notes: 'INWORLD_API_KEY missing; wrote no fixtures' }, null, 2),
  )
  console.log('deferred - no .env (INWORLD_API_KEY missing)')
  process.exit(0)
}

const AUTH = { Authorization: `Basic ${KEY}`, 'Content-Type': 'application/json' }
const notes: string[] = []

// --- 1. list voices -----------------------------------------------------------
type Voice = { voiceId?: string; name?: string; description?: string; gender?: string; languages?: string[] }
let voiceList: Voice[] = []
try {
  const res = await fetch('https://api.inworld.ai/tts/v1/voices', { headers: AUTH })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const json = (await res.json()) as { voices?: Voice[] }
  voiceList = json.voices ?? (Array.isArray(json) ? (json as Voice[]) : [])
  notes.push(`voices endpoint OK: GET /tts/v1/voices returned ${voiceList.length} voices`)
} catch (err) {
  notes.push(`voices endpoint failed: ${err}`)
}

// --- 2. pick 6 distinct male voices by description keywords -------------------
const WANTED: Record<string, string[]> = {
  gojo: ['bright', 'playful', 'energetic', 'cheerful', 'lively', 'upbeat'],
  sukuna: ['deep', 'menacing', 'dark', 'villain', 'gravelly', 'intimidating'],
  toji: ['low', 'flat', 'monotone', 'rough', 'gruff'],
  choso: ['soft', 'earnest', 'gentle', 'sincere', 'quiet'],
  nanami: ['formal', 'dry', 'serious', 'professional', 'measured'],
  geto: ['calm', 'warm', 'smooth', 'composed', 'soothing'],
}
const picked: Record<string, { id: string; name: string }> = {}
const used = new Set<string>()
const englishMale = voiceList.filter(
  (v) =>
    (!v.gender || /male/i.test(v.gender)) &&
    (!v.languages || v.languages.some((l) => l.toLowerCase().startsWith('en'))),
)
for (const [char, keywords] of Object.entries(WANTED)) {
  const scored = englishMale
    .filter((v) => !used.has(v.voiceId ?? v.name ?? ''))
    .map((v) => {
      const hay = `${v.name ?? ''} ${v.description ?? ''}`.toLowerCase()
      return { v, score: keywords.filter((k) => hay.includes(k)).length }
    })
    .sort((a, b) => b.score - a.score)
  const best = scored[0]?.v
  if (best) {
    const id = best.voiceId ?? best.name ?? ''
    used.add(id)
    picked[char] = { id, name: best.name ?? id }
  }
}
if (Object.keys(picked).length < 6) notes.push('fewer than 6 voices assigned — inspect voice list manually')

// --- 3. stream one line with a steering tag, measure + validate ---------------
const testVoice = picked.gojo?.id ?? voiceList[0]?.voiceId ?? 'Ashton'
notes.push(`streamed test voice: ${testVoice}`)
const t0 = Date.now()
let ttfbMs = -1
let chunkCount = 0
let chunkShape: 'result.audioContent' | 'audioContent' | 'unknown' = 'unknown'
const audioParts: Buffer[] = []
let totalMs = -1

try {
  const res = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      text: `[happy] ${TEST_LINE}`,
      voiceId: testVoice,
      modelId: 'inworld-tts-1',
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`)

  let buf = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (ttfbMs < 0) ttfbMs = Date.now() - t0
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const json = JSON.parse(line)
      const b64: string | undefined = json.result?.audioContent ?? json.audioContent
      if (json.result?.audioContent) chunkShape = 'result.audioContent'
      else if (json.audioContent) chunkShape = 'audioContent'
      if (!b64) {
        notes.push(`non-audio line keys: ${Object.keys(json).join(',')}`)
        continue
      }
      chunkCount++
      const bytes = Buffer.from(b64, 'base64')
      const head = bytes.subarray(0, 4)
      const plausible =
        head.toString('latin1').startsWith('ID3') ||
        head.toString('latin1').startsWith('RIFF') ||
        (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) // mp3 frame sync (fff3/fffb etc.)
      if (!plausible) notes.push(`chunk ${chunkCount} header not audio-like: ${head.toString('hex')}`)
      audioParts.push(bytes)
    }
  }
  totalMs = Date.now() - t0
  await mkdir(FIXTURES, { recursive: true })
  await writeFile(path.join(FIXTURES, 'sample.mp3'), Buffer.concat(audioParts))
  notes.push(`saved fixtures/sample.mp3 (${Buffer.concat(audioParts).length} bytes)`)
} catch (err) {
  notes.push(`stream failed: ${err}`)
}

const report = {
  status: totalMs >= 0 ? 'ok' : 'failed',
  ttfbMs,
  totalMs,
  chunkShape,
  chunkCount,
  steeringTagsRendered: 'unknown' as const, // needs a human ear; API does not echo tag handling
  voices: picked,
  notes,
}
await writeFile(REPORT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
