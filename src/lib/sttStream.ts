// Client half of streaming STT: downsample mic PCM to 16k int16 and feed the
// server relay (/api/stt-stream) WHILE the player talks, so the transcript is
// ready ~150ms after they stop instead of ~800ms. One instance per utterance.

const TARGET_RATE = 16000
const FLUSH_BYTES = 8000 // ≈250ms of 16k mono PCM16 per POST

function downsampleToInt16(input: Float32Array, inputRate: number): Int16Array {
  const step = inputRate / TARGET_RATE
  const out = new Int16Array(Math.floor(input.length / step))
  for (let i = 0; i < out.length; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * step)]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export class SttStreamTurn {
  private sid: Promise<string | null>
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  private sendChain: Promise<void> = Promise.resolve()
  private failed = false

  constructor() {
    this.sid = fetch('/api/stt-stream?op=start', { method: 'POST' })
      .then(async (r) => (r.ok ? ((await r.json()).sid as string) : null))
      .catch(() => null)
  }

  push(pcm: Float32Array, sampleRate: number): void {
    if (this.failed) return
    const int16 = downsampleToInt16(pcm, sampleRate)
    this.pending.push(new Uint8Array(int16.buffer))
    this.pendingBytes += int16.byteLength
    if (this.pendingBytes >= FLUSH_BYTES) this.flush()
  }

  private flush(): void {
    if (this.pendingBytes === 0) return
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
    // Chunks must arrive in order — chain the POSTs.
    this.sendChain = this.sendChain.then(async () => {
      const sid = await this.sid
      if (!sid || this.failed) return
      const r = await fetch(`/api/stt-stream?op=chunk&sid=${sid}`, {
        method: 'POST',
        body,
      }).catch(() => null)
      if (!r || (!r.ok && r.status !== 204)) this.failed = true
    })
  }

  /** Ends the turn; resolves the transcript, or null → caller falls back to batch. */
  async finish(): Promise<string | null> {
    this.flush()
    await this.sendChain
    const sid = await this.sid
    if (!sid || this.failed) return null
    try {
      const r = await fetch(`/api/stt-stream?op=end&sid=${sid}`, { method: 'POST' })
      if (!r.ok) return null
      const json = await r.json()
      const text = (json.text ?? '').trim()
      return text.length > 0 ? text : null
    } catch {
      return null
    }
  }
}
