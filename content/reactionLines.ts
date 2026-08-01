// Instant per-stance reaction lines — played within ~1s of the player's
// answer to mask LLM latency. Generic enough to follow any answer in the
// stance; each is unmistakably its speaker's voice. All original lines.

import type { CharId, Stance } from '../src/lib/types'

export type ReactionLine = {
  id: string
  speaker: CharId
  line: string
  emotion?: string
}

export const REACTION_LINES: Record<Stance, ReactionLine[]> = {
  villain_romance: [
    {
      id: 'villain_romance_1',
      speaker: 'sukuna',
      line: 'Oh? Someone walks in already on fire. Finally. Sit near me.',
      emotion: 'happy',
    },
    {
      id: 'villain_romance_2',
      speaker: 'gojo',
      line: "Night one and you pick CHAOS? I respect it. I'm scared of it, but I respect it.",
      emotion: 'surprise',
    },
    {
      id: 'villain_romance_3',
      speaker: 'toji',
      line: 'Heh. Trouble walked in wearing a mic pack. This job just got fun.',
      emotion: 'happy',
    },
  ],
  soulmate: [
    {
      id: 'soulmate_1',
      speaker: 'gojo',
      line: 'Wait wait — say that again. Slower. And this time the cameras better miss it.',
      emotion: 'whisper',
    },
    {
      id: 'soulmate_2',
      speaker: 'geto',
      line: 'Careful. Honesty like that, in this house? The villa rewards it. So might I.',
      emotion: 'whisper',
    },
    {
      id: 'soulmate_3',
      speaker: 'choso',
      line: 'Noted: they said something real, in a house built on lying. Choso is compromised.',
      emotion: 'whisper',
    },
  ],
  alone_but_iconic: [
    {
      id: 'alone_but_iconic_1',
      speaker: 'sukuna',
      line: 'A watcher. Good. The quiet ones are the only ones worth ranking.',
      emotion: 'whisper',
    },
    {
      id: 'alone_but_iconic_2',
      speaker: 'toji',
      line: "Smart. Case the room before you buy anything in it. First useful thing anyone's said tonight.",
      emotion: 'happy',
    },
    {
      id: 'alone_but_iconic_3',
      speaker: 'nanami',
      line: 'Restraint. On this show. Excuse me, I need to sit down.',
      emotion: 'surprise',
    },
  ],
  friendship_finale: [
    {
      id: 'friendship_finale_1',
      speaker: 'gojo',
      line: "Allies?! Yes. Claimed. Team Strongest has a second member now and it's you.",
      emotion: 'happy',
    },
    {
      id: 'friendship_finale_2',
      speaker: 'choso',
      line: 'Alliance acknowledged. Choso will now guard you with a devotion you may find alarming.',
      emotion: 'happy',
    },
    {
      id: 'friendship_finale_3',
      speaker: 'nanami',
      line: 'An adult. Thank goodness. Please sit near me at every ceremony.',
      emotion: 'happy',
    },
  ],
}
