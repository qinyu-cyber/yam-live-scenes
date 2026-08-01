// Server-side Inworld API helpers. Env access lives here only — never import from client code.
//
// Endpoints (confirmed via docs.inworld.ai api-reference):
//   TTS stream: POST https://api.inworld.ai/tts/v1/voice:stream
//     body { text, voiceId, modelId, audioConfig } → newline-delimited JSON,
//     each line { "result": { "audioContent": "<base64>" } } (or { "error": {...} })
//   STT batch:  POST https://api.inworld.ai/stt/v1/transcribe
//     body { transcribeConfig: { modelId, audioEncoding, language }, audioData: { content: "<base64>" } }
//     → { transcription: { transcript, ... }, usage: {...} }
//     NOTE: no emotion/voice-profile field is documented; we surface one opportunistically if present.

const BASE = 'https://api.inworld.ai'
const BACKOFF_MS = [0, 1000, 3000] // attempt 1 immediate, then 1s, then 3s

function authHeader(): string {
  const key = process.env.INWORLD_API_KEY
  if (!key) throw new Error('INWORLD_API_KEY is not set')
  return `Basic ${key}`
}

// Retries ONLY on 429/5xx and network throw; any other non-ok fails fast.
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown = new Error('unreachable')
  for (const delay of BACKOFF_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      lastErr = err
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Inworld ${res.status}: ${await res.text().catch(() => '')}`)
      continue
    }
    if (!res.ok) {
      throw new Error(`Inworld ${res.status}: ${await res.text().catch(() => '')}`)
    }
    return res
  }
  throw lastErr
}

/** Streams TTS audio. Returns the raw upstream Response (NDJSON body) for passthrough. */
export function ttsStream(text: string, voiceId: string): Promise<Response> {
  return fetchWithRetry(`${BASE}/tts/v1/voice:stream`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: 'inworld-tts-1',
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
}

/** Batch STT. `mimeType` is advisory — we let the API auto-detect the container. */
export async function sttBatch(
  audio: Blob | Buffer,
  mimeType: string,
): Promise<{ text: string; emotion?: string }> {
  const bytes = audio instanceof Blob ? Buffer.from(await audio.arrayBuffer()) : audio
  void mimeType // AUTO_DETECT handles mp3/wav/ogg/webm-opus sniffing
  const res = await fetchWithRetry(`${BASE}/stt/v1/transcribe`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcribeConfig: {
        modelId: 'groq/whisper-large-v3',
        audioEncoding: 'AUTO_DETECT',
        language: 'en',
      },
      audioData: { content: bytes.toString('base64') },
    }),
  })
  const json = (await res.json()) as {
    transcription?: { transcript?: string; emotion?: string }
    emotion?: string
  }
  const text = json.transcription?.transcript ?? ''
  const emotion = json.transcription?.emotion ?? json.emotion
  return emotion ? { text, emotion } : { text }
}
