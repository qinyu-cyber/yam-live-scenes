// Client half of a private Realtime call: streams mic PCM (24k int16) to the
// relay and plays the character's PCM replies as they arrive. Turn-taking and
// barge-in are SERVER-side (Inworld VAD) — this class just moves audio.
import type { CharId, HistoryEntry } from './types'
import { audioEngine } from './audioEngine'

const CALL_RATE = 24000
const FLUSH_BYTES = 12000 // ≈250ms of 24k mono PCM16

export type CallHandlers = {
  onCharText: (delta: string) => void
  onUserText: (text: string) => void
  onEnded: () => void
}

export class RealtimeCall {
  private sid: string | null = null
  private ctx: AudioContext | null = null
  private proc: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  private sendChain: Promise<void> = Promise.resolve()
  private nodes: AudioBufferSourceNode[] = []
  private nextStart = 0
  private stopped = false

  constructor(private handlers: CallHandlers) {}

  async start(charId: CharId, history: HistoryEntry[]): Promise<boolean> {
    const res = await fetch('/api/realtime?op=start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ charId, history }),
    }).catch(() => null)
    if (!res?.ok) return false
    this.sid = (await res.json()).sid
    void this.consumeEvents()

    // Mic: reuse the already-granted stream; capture + downsample to 24k.
    const stream = audioEngine.getMicStream()
    if (!stream) return false
    this.ctx = new AudioContext()
    this.source = this.ctx.createMediaStreamSource(stream)
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1)
    const inputRate = this.ctx.sampleRate
    this.proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const step = inputRate / CALL_RATE
      const out = new Int16Array(Math.floor(input.length / step))
      for (let i = 0; i < out.length; i++) {
        const s = Math.max(-1, Math.min(1, input[Math.floor(i * step)]))
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.pending.push(new Uint8Array(out.buffer))
      this.pendingBytes += out.byteLength
      if (this.pendingBytes >= FLUSH_BYTES) this.flushMic()
    }
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.source.connect(this.proc)
    this.proc.connect(mute)
    mute.connect(this.ctx.destination)
    return true
  }

  private flushMic(): void {
    if (this.pendingBytes === 0 || !this.sid || this.stopped) return
    const parts = this.pending
    this.pending = []
    this.pendingBytes = 0
    const total = parts.reduce((n, p) => n + p.length, 0)
    const body = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      body.set(p, off)
      off += p.length
    }
    this.sendChain = this.sendChain.then(async () => {
      if (this.stopped) return
      await fetch(`/api/realtime?op=audio&sid=${this.sid}`, { method: 'POST', body }).catch(
        () => {},
      )
    })
  }

  private clearPlayback(): void {
    for (const n of this.nodes) {
      n.onended = null
      try {
        n.stop()
      } catch {
        // never started
      }
      n.disconnect()
    }
    this.nodes = []
    this.nextStart = 0
  }

  private schedulePcm(b64: string): void {
    const ctx = this.ctx
    if (!ctx) return
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2))
    if (int16.length === 0) return
    const buf = ctx.createBuffer(1, int16.length, CALL_RATE)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 0x8000
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const t = Math.max(ctx.currentTime, this.nextStart)
    src.start(t)
    this.nextStart = t + buf.duration
    this.nodes.push(src)
  }

  private async consumeEvents(): Promise<void> {
    const res = await fetch(`/api/realtime?op=events&sid=${this.sid}`).catch(() => null)
    const reader = res?.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
      if (done || this.stopped) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'audio') this.schedulePcm(ev.b64)
          else if (ev.type === 'char_text') this.handlers.onCharText(ev.delta)
          else if (ev.type === 'user_text') this.handlers.onUserText(ev.text)
          else if (ev.type === 'speech_started') this.clearPlayback() // barge-in
          else if (ev.type === 'closed') this.handlers.onEnded()
        } catch {
          // partial line
        }
      }
    }
  }

  /** Hang up; resolves the private transcript for the character's memory. */
  async stop(): Promise<Array<{ who: 'player' | CharId; text: string }>> {
    this.stopped = true
    this.clearPlayback()
    this.proc?.disconnect()
    this.source?.disconnect()
    this.proc = null
    this.source = null
    await this.ctx?.close().catch(() => {})
    this.ctx = null
    if (!this.sid) return []
    try {
      const res = await fetch(`/api/realtime?op=stop&sid=${this.sid}`, { method: 'POST' })
      if (!res.ok) return []
      return (await res.json()).transcript ?? []
    } catch {
      return []
    }
  }
}
