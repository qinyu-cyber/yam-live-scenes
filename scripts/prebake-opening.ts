// Pre-render the opening beats + all reaction lines to mp3 so the demo's first
// minute (and the instant reaction mask) can never fail live.
// Renderer: Inworld direct voice:stream with the SAME voiceIds as live TTS —
// Tenstorrent's inworld-tts-2 mirror has only one English male voice, and a
// character switching voices at the prebaked/live boundary would be jarring.
// Run: bun scripts/prebake-opening.ts

import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { ttsStream } from '../src/lib/inworld'
import { OPENING } from '../content/openingScene'
import { REACTION_LINES } from '../content/reactionLines'
import { VOICES } from '../content/voices'
import type { Beat } from '../src/lib/types'

const OUT = path.join(process.cwd(), 'public', 'audio', 'prebaked')

async function renderToMp3(text: string, voiceId: string, rate: number): Promise<Buffer> {
  const res = await ttsStream(text, voiceId, rate)
  const body = await res.text()
  const parts: Buffer[] = []
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line)
      const b64 = parsed.result?.audioContent ?? parsed.audioContent
      if (typeof b64 === 'string' && b64) parts.push(Buffer.from(b64, 'base64'))
    } catch {
      // skip bad line
    }
  }
  if (parts.length === 0) throw new Error('no audio chunks in response')
  return Buffer.concat(parts)
}

async function bake(beat: Beat, file: string): Promise<number> {
  const voice = VOICES[beat.speaker]
  const text = `[${beat.emotion ?? voice.defaultEmotion}] ${beat.line}`
  const mp3 = await renderToMp3(text, voice.voiceId, voice.rate)
  await writeFile(file, mp3)
  return mp3.length
}

// Guard: the opening must end on a question to the player.
const last = OPENING.beats[OPENING.beats.length - 1]
if (!/\?\s*$/.test(last.line)) {
  throw new Error(`opening's last beat must end with "?": ${last.line}`)
}

await mkdir(path.join(OUT, 'opening'), { recursive: true })
await mkdir(path.join(OUT, 'reactions'), { recursive: true })
const manifest: Record<string, string> = {}

for (let i = 0; i < OPENING.beats.length; i++) {
  const rel = `opening/opening_${i}.mp3`
  const bytes = await bake(OPENING.beats[i], path.join(OUT, rel))
  manifest[`opening_${i}`] = `/audio/prebaked/${rel}`
  console.log(`opening_${i} (${OPENING.beats[i].speaker}) ${bytes} bytes`)
}

for (const lines of Object.values(REACTION_LINES)) {
  for (const r of lines) {
    const rel = `reactions/reaction_${r.id}.mp3`
    const bytes = await bake(
      { speaker: r.speaker, line: r.line, emotion: r.emotion },
      path.join(OUT, rel),
    )
    manifest[`reaction_${r.id}`] = `/audio/prebaked/${rel}`
    console.log(`reaction_${r.id} (${r.speaker}) ${bytes} bytes`)
  }
}

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`manifest.json: ${Object.keys(manifest).length} entries`)
