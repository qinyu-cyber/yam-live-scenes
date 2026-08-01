// Sponsor probe for Tenstorrent Cloud. Run: bun scripts/probe-tenstorrent.ts
// Writes scripts/probe.report.json and (if TTS works) scripts/fixtures/tt-sample.mp3.
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = path.join(ROOT, 'scripts', 'probe.report.json')
const FIXTURES = path.join(ROOT, 'scripts', 'fixtures')
const BASE = 'https://console.tenstorrent.com'

const KEY = process.env.TENSTORRENT_API_KEY
if (!KEY) {
  await writeFile(
    REPORT,
    JSON.stringify({ status: 'deferred - no .env', notes: 'TENSTORRENT_API_KEY missing' }, null, 2),
  )
  console.log('deferred - no .env (TENSTORRENT_API_KEY missing)')
  process.exit(0)
}

const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const notes: string[] = []

// --- 1. list TTS voices -------------------------------------------------------
let ttsVoices: string[] = []
try {
  const res = await fetch(`${BASE}/v1/audio/voices?model=inworld-tts-2`, { headers: AUTH })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const json = (await res.json()) as { voices?: Array<{ id?: string; name?: string } | string> }
  ttsVoices = (json.voices ?? []).map((v) => (typeof v === 'string' ? v : v.name ?? v.id ?? '')).filter(Boolean)
  notes.push(`voices OK (${ttsVoices.length})`)
} catch (err) {
  notes.push(`voices failed: ${err}`)
}

// --- 2. TTS speech (OpenAI-compatible), timed ---------------------------------
let ttsLatencyMs = -1
try {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      model: 'inworld-tts-2',
      input: 'Tenstorrent probe: one short line of test audio.',
      voice: ttsVoices[0] ?? 'Ashton',
      response_format: 'mp3',
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  ttsLatencyMs = Date.now() - t0
  await mkdir(FIXTURES, { recursive: true })
  await writeFile(path.join(FIXTURES, 'tt-sample.mp3'), bytes)
  notes.push(`speech OK: ${bytes.length} bytes in ${ttsLatencyMs}ms → fixtures/tt-sample.mp3`)
} catch (err) {
  notes.push(`speech failed: ${err}`)
}

// --- 3. chat endpoint probe ---------------------------------------------------
let chatModel = 'inworld-tts-2' // fallback; replaced if /v1/models lists anything chat-ish
try {
  const res = await fetch(`${BASE}/v1/models`, { headers: AUTH })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const json = (await res.json()) as { data?: Array<{ id: string }> }
  const ids = (json.data ?? []).map((m) => m.id)
  notes.push(`models: ${ids.join(', ') || '(empty)'}`)
  const nonTts = ids.find((id) => !/tts|audio|speech/i.test(id))
  if (nonTts) chatModel = nonTts
} catch (err) {
  notes.push(`models failed: ${err}`)
}

let chatEndpoint: 'present' | 'absent' = 'absent'
const chatLatencies: number[] = []
let jsonOk = 0
for (let i = 0; i < 3; i++) {
  try {
    const t0 = Date.now()
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        model: chatModel,
        messages: [
          { role: 'user', content: 'Reply with ONLY this JSON, no prose: {"ok": true, "n": ' + i + '}' },
        ],
        max_tokens: 50,
      }),
    })
    const body = await res.text()
    if (res.status === 404 || res.status === 405) {
      notes.push(`chat probe ${i}: ${res.status} — endpoint absent`)
      break
    }
    if (!res.ok) {
      notes.push(`chat probe ${i}: ${res.status} ${body.slice(0, 200)}`)
      continue
    }
    chatEndpoint = 'present'
    chatLatencies.push(Date.now() - t0)
    const content = (JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content ?? ''
    try {
      JSON.parse(content.replace(/^```(json)?|```$/g, '').trim())
      jsonOk++
    } catch {
      notes.push(`chat probe ${i}: non-JSON content: ${content.slice(0, 100)}`)
    }
  } catch (err) {
    notes.push(`chat probe ${i} threw: ${err}`)
  }
}

const report = {
  status: ttsLatencyMs >= 0 || ttsVoices.length > 0 ? 'ok' : 'failed',
  ttsVoices,
  ttsLatencyMs,
  chatEndpoint,
  ...(chatEndpoint === 'present'
    ? {
        chatLatencyMs: Math.round(chatLatencies.reduce((a, b) => a + b, 0) / chatLatencies.length),
        chatJsonReliable: jsonOk === chatLatencies.length && jsonOk > 0,
      }
    : {}),
  notes,
}
await writeFile(REPORT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
