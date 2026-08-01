// Client-side audio engine: owns the single AudioContext, the mic stream,
// and ALL playback. One state machine — the page orchestrates, the engine plays.
import type { EngineState } from './types'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function concatBytes(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out.buffer as ArrayBuffer
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private state: EngineState = 'idle'
  private listeners = new Set<(s: EngineState) => void>()
  private nodes: AudioBufferSourceNode[] = []
  private gen = 0 // bumped by stop(); in-flight playbacks abort when it changes
  private endResolve: (() => void) | null = null

  getState(): EngineState {
    return this.state
  }

  setState(s: EngineState): void {
    this.state = s
    this.listeners.forEach((cb) => cb(s))
  }

  onStateChange(cb: (s: EngineState) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  // Call from the title-screen click: unlocks audio output + mic in one gesture.
  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (!this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  // Streamed TTS playback: NDJSON lines, each carrying a base64 mp3 chunk that is
  // independently decodable. Decode per chunk, schedule back-to-back. If a chunk
  // fails to decode, accumulate it with subsequent chunks and retry the concatenation.
  async playStream(res: Response): Promise<void> {
    const ctx = this.ctx
    if (!ctx || !res.body) return
    const gen = this.gen
    const reader = res.body.getReader()
    const textDecoder = new TextDecoder()
    let buf = ''
    let pending: Uint8Array[] = [] // undecodable chunks awaiting more data
    let nextStartTime = 0
    let lastNode: AudioBufferSourceNode | null = null

    const schedule = (audio: AudioBuffer) => {
      const src = ctx.createBufferSource()
      src.buffer = audio
      src.connect(ctx.destination)
      const t = Math.max(ctx.currentTime, nextStartTime)
      src.start(t)
      nextStartTime = t + audio.duration
      this.nodes.push(src)
      lastNode = src
    }

    const tryDecode = async (bytes: Uint8Array) => {
      const data = concatBytes([...pending, bytes])
      try {
        const audio = await ctx.decodeAudioData(data)
        pending = []
        if (this.gen === gen) schedule(audio)
      } catch {
        pending.push(bytes) // degrade path: retry with the next chunk appended
      }
    }

    const handleLine = async (line: string) => {
      if (!line.trim()) return
      try {
        const parsed = JSON.parse(line)
        const b64 = parsed.result?.audioContent ?? parsed.audioContent
        if (typeof b64 === 'string' && b64) await tryDecode(b64ToBytes(b64))
      } catch {
        // partial/bad JSON line — skip
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (this.gen !== gen) {
        reader.cancel().catch(() => {})
        return
      }
      if (done) break
      buf += textDecoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) await handleLine(line)
    }
    await handleLine(buf)

    if (this.gen !== gen || !lastNode) return
    await new Promise<void>((resolve) => {
      this.endResolve = resolve
      ;(lastNode as AudioBufferSourceNode).onended = () => resolve()
    })
    this.endResolve = null
  }

  // Prebaked mp3 playback: fetch → decode → play; resolves when it ends.
  async playUrl(url: string): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return
    const gen = this.gen
    const res = await fetch(url)
    const data = await res.arrayBuffer()
    if (this.gen !== gen) return
    const audio = await ctx.decodeAudioData(data)
    if (this.gen !== gen) return
    const src = ctx.createBufferSource()
    src.buffer = audio
    src.connect(ctx.destination)
    this.nodes.push(src)
    await new Promise<void>((resolve) => {
      this.endResolve = resolve
      src.onended = () => resolve()
      src.start()
    })
    this.endResolve = null
  }

  // Cancels every scheduled node and unblocks any pending play promise.
  // Does NOT change state — the caller sets state for its own reason (barge-in, scene end).
  stop(): void {
    this.gen++
    for (const n of this.nodes) {
      n.onended = null
      try {
        n.stop()
      } catch {
        // never started or already stopped
      }
      n.disconnect()
    }
    this.nodes = []
    this.endResolve?.()
    this.endResolve = null
  }
}

export const audioEngine = new AudioEngine()

// Missing manifest means live TTS — not an error.
export async function loadManifest(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch('/audio/prebaked/manifest.json')
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
