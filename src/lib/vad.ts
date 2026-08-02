// Always-on conversational listening: no button, no hold-to-talk. A single
// persistent capture pipeline watches mic energy (RMS); when the player starts
// speaking it fires onSpeechStart (the page uses this for barge-in), and when
// they stop it delivers the utterance as a 16-bit mono WAV blob.
//
// Speaker bleed (characters triggering the mic) is handled two ways: the mic
// is opened with echoCancellation, and the page ignores utterances it didn't
// ask for while a turn is already in flight.

const FRAME = 2048 // ~43ms at 48kHz
const START_RMS = 0.02 // speech begins above this...
const START_FRAMES = 4 // ...for ~170ms
const END_RMS = 0.01 // speech ends below this...
const END_FRAMES = 13 // ...for ~560ms — snappier turn-taking
const MIN_SPEECH_MS = 350 // discard blips shorter than this
const PREROLL_FRAMES = 8 // ~340ms kept from before the trigger

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

export type VoiceLoopHandlers = {
  onSpeechStart: () => void
  onSpeechEnd: (wav: Blob, durationMs: number) => void
  onMicError: () => void
  /** Called ~every 130ms with the current mic RMS — drive a level indicator. */
  onLevel?: (rms: number) => void
  /** Every captured frame while speaking (pre-roll included) — feeds streaming STT. */
  onSpeechFrame?: (pcm: Float32Array, sampleRate: number) => void
}

export class VoiceLoop {
  private ctx: AudioContext | null = null
  private proc: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private preroll: Float32Array[] = []
  private captured: Float32Array[] = []
  private speaking = false
  private loudFrames = 0
  private quietFrames = 0
  private running = false
  private muted = false

  constructor(private handlers: VoiceLoopHandlers) {}

  /** Mute drops audio at the source — nothing captures, nothing triggers. */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) {
      this.speaking = false
      this.captured = []
      this.preroll = []
      this.loudFrames = 0
      this.quietFrames = 0
      this.handlers.onLevel?.(0)
    }
  }

  async start(): Promise<boolean> {
    if (this.running) return true
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      console.warn('[vad] mic unavailable:', err)
      this.handlers.onMicError()
      return false
    }
    this.ctx = new AudioContext()
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.proc = this.ctx.createScriptProcessor(FRAME, 1, 1)
    this.proc.onaudioprocess = (e) => this.onFrame(e.inputBuffer.getChannelData(0))
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.source.connect(this.proc)
    this.proc.connect(mute)
    mute.connect(this.ctx.destination)
    this.running = true
    return true
  }

  private frameCount = 0

  private onFrame(frame: Float32Array): void {
    if (this.muted) return
    const copy = new Float32Array(frame)
    let sum = 0
    for (let i = 0; i < copy.length; i++) sum += copy[i] * copy[i]
    const rms = Math.sqrt(sum / copy.length)
    if (this.frameCount++ % 3 === 0) this.handlers.onLevel?.(rms)

    if (!this.speaking) {
      this.preroll.push(copy)
      if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift()
      if (rms > START_RMS) {
        this.loudFrames++
        if (this.loudFrames >= START_FRAMES) {
          this.speaking = true
          this.captured = [...this.preroll]
          this.preroll = []
          this.quietFrames = 0
          this.handlers.onSpeechStart()
          const rate = this.ctx?.sampleRate ?? 48000
          for (const f of this.captured) this.handlers.onSpeechFrame?.(f, rate)
        }
      } else {
        this.loudFrames = 0
      }
      return
    }

    this.captured.push(copy)
    this.handlers.onSpeechFrame?.(copy, this.ctx?.sampleRate ?? 48000)
    if (rms < END_RMS) {
      this.quietFrames++
      if (this.quietFrames >= END_FRAMES) this.finishUtterance()
    } else {
      this.quietFrames = 0
    }
  }

  private finishUtterance(): void {
    const sampleRate = this.ctx?.sampleRate ?? 48000
    const frames = this.captured
    this.captured = []
    this.speaking = false
    this.loudFrames = 0
    const durationMs = (frames.reduce((n, c) => n + c.length, 0) / sampleRate) * 1000
    if (durationMs < MIN_SPEECH_MS) return // blip — ignore
    this.handlers.onSpeechEnd(encodeWav(frames, sampleRate), Math.round(durationMs))
  }

  stop(): void {
    this.running = false
    this.proc?.disconnect()
    this.source?.disconnect()
    this.proc = null
    this.source = null
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
