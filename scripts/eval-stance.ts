// Stance-classifier eval: 20 hand-labeled player utterances, 5 per stance.
// Run with `bun scripts/eval-stance.ts` after any keyword change.

import type { Stance } from '../src/lib/types'
import { classifyStance } from '../src/lib/stance'

const LABELED: Array<[string, Stance]> = [
  // villain_romance
  ["I'm here to steal your man and burn this villa down", 'villain_romance'],
  ['Chaos. I choose chaos.', 'villain_romance'],
  ["Sukuna's side, obviously — villains have more fun", 'villain_romance'],
  ["I'm the drama tonight", 'villain_romance'],
  ['Someone light the fire, I brought gasoline', 'villain_romance'],
  // soulmate
  ["I'm here to find something real", 'soulmate'],
  ['Honestly? I want love. Actual love.', 'soulmate'],
  ['Whoever wins my heart, wins. Simple.', 'soulmate'],
  ["I'd marry the right person tomorrow", 'soulmate'],
  ["I'm looking for my soulmate, not screen time", 'soulmate'],
  // friendship_finale
  ["Nobody's side — I just want good vibes with everyone", 'friendship_finale'],
  ["I'm here to make friends, sue me", 'friendship_finale'],
  ['You all seem cool, let’s just chill', 'friendship_finale'],
  ['Allies first, romance later maybe', 'friendship_finale'],
  ["I'm everyone's friend until the finale", 'friendship_finale'],
  // alone_but_iconic
  ["I'll just watch and wait", 'alone_but_iconic'],
  ["I'm here to observe before I strike", 'alone_but_iconic'],
  ['Call me mysterious. You’ll see.', 'alone_but_iconic'],
  ['The quiet ones always win', 'alone_but_iconic'],
  ["I'll wait for my moment", 'alone_but_iconic'],
]

let correct = 0
const confusions: string[] = []
for (const [text, expected] of LABELED) {
  const { stance } = classifyStance(text)
  if (stance === expected) correct++
  else confusions.push(`  "${text}" → ${stance} (expected ${expected})`)
}

console.log(`stance eval: ${correct}/${LABELED.length} (${Math.round((correct / LABELED.length) * 100)}%)`)
if (confusions.length) {
  console.log('confusions:')
  console.log(confusions.join('\n'))
}
