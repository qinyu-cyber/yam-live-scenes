// Two Stt implementations: serverStt (MediaRecorder → POST /api/stt, primary)
// and webStt (webkitSpeechRecognition, fallback via ?stt=web).
import type { Stt } from './types'
import { audioEngine } from './audioEngine'

export const serverStt: Stt = (() => {
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  return {
    start() {
      const stream = audioEngine.getMicStream()
      if (!stream) return
      chunks = []
      const mime = 'audio/webm;codecs=opus'
      recorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined
      )
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start()
    },
    stop() {
      return new Promise((resolve, reject) => {
        const rec = recorder
        recorder = null
        if (!rec || rec.state === 'inactive') return resolve({ text: '' })
        rec.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
            const form = new FormData()
            form.append('audio', blob, 'audio.webm')
            const res = await fetch('/api/stt', { method: 'POST', body: form })
            const json = await res.json()
            resolve({ text: json.text ?? '', emotion: json.emotion })
          } catch (err) {
            reject(err)
          }
        }
        rec.stop()
      })
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
