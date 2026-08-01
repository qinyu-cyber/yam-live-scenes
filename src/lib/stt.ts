// Two Stt implementations: serverStt (PCM→WAV → POST /api/stt, primary) and
// webStt (webkitSpeechRecognition, fallback via ?stt=web).
// WAV instead of MediaRecorder: Inworld batch STT rejects webm containers
// ("only WAV, MP3, OGG, FLAC, and M4A are supported" — verified live), so we
// capture raw PCM off the mic stream and wrap it in a 16-bit mono WAV header.
import type { Stt } from './types'
import { audioEngine } from './audioEngine'

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const samples = chunks.reduce((n, c) => n + c.length, 0)
  const buf = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples * 2, true)
  let off = 44
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export const serverStt: Stt = (() => {
  let ctx: AudioContext | null = null
  let proc: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let chunks: Float32Array[] = []
  return {
    start() {
      const stream = audioEngine.getMicStream()
      if (!stream) return
      chunks = []
      ctx = new AudioContext()
      source = ctx.createMediaStreamSource(stream)
      proc = ctx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      // Route through a muted gain so the processor runs without mic echo.
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(proc)
      proc.connect(mute)
      mute.connect(ctx.destination)
    },
    async stop() {
      const c = ctx
      ctx = null
      if (!c || !proc) return { text: '' }
      const sampleRate = c.sampleRate
      proc.disconnect()
      source?.disconnect()
      proc = null
      source = null
      await c.close().catch(() => {})
      if (chunks.length === 0) return { text: '' }
      const form = new FormData()
      form.append('audio', encodeWav(chunks, sampleRate), 'audio.wav')
      chunks = []
      const res = await fetch('/api/stt', { method: 'POST', body: form })
      const json = await res.json()
      return { text: json.text ?? '', emotion: json.emotion }
    },
  }
})()

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

export const webStt: Stt = (() => {
  let rec: SpeechRecognitionLike | null = null
  let transcript = ''
  return {
    start() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctor = (window as any).webkitSpeechRecognition
      if (!Ctor) return
      transcript = ''
      rec = new Ctor() as SpeechRecognitionLike
      rec.lang = 'en-US'
      rec.continuous = true
      rec.interimResults = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) transcript += e.results[i][0].transcript
        }
      }
      rec.start()
    },
    stop() {
      return new Promise((resolve) => {
        const r = rec
        rec = null
        if (!r) return resolve({ text: '' })
        r.onend = () => resolve({ text: transcript.trim() })
        r.stop()
      })
    },
  }
})()

export function getStt(): Stt {
  if (
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('stt') === 'web'
  ) {
    return webStt
  }
  return serverStt
}
