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

// When the player addresses a character BY NAME, that character acknowledges
// instantly (instead of a stance line from someone else) while the LLM writes
// their real answer. Short, generic enough to follow any question, and
// unmistakably in-voice per the canon speech tells.
export const ADDRESS_LINES: Record<CharId, ReactionLine[]> = {
  gojo: [
    { id: 'address_gojo_1', speaker: 'gojo', line: "Oho, asking ME? Smart. I'm the only reliable source in this villa.", emotion: 'happy' },
    { id: 'address_gojo_2', speaker: 'gojo', line: "Careful — I always answer honestly, and nobody here can handle that.", emotion: 'happy' },
  ],
  sukuna: [
    { id: 'address_sukuna_1', speaker: 'sukuna', line: 'You address me directly. Bold. Speak carefully.', emotion: 'disgust' },
    { id: 'address_sukuna_2', speaker: 'sukuna', line: 'Hm. The brat has a question for a king. Amusing.', emotion: 'happy' },
  ],
  toji: [
    { id: 'address_toji_1', speaker: 'toji', line: "Me? Heh. Depends what an honest answer pays these days.", emotion: 'whisper' },
    { id: 'address_toji_2', speaker: 'toji', line: "You're asking the mercenary. Fine. One freebie.", emotion: 'whisper' },
  ],
  choso: [
    { id: 'address_choso_1', speaker: 'choso', line: 'You have asked Choso directly. He is taking this very seriously.', emotion: 'sad' },
    { id: 'address_choso_2', speaker: 'choso', line: 'A direct question. Choso will not waste it.', emotion: 'whisper' },
  ],
  nanami: [
    { id: 'address_nanami_1', speaker: 'nanami', line: 'Noted. I will answer once, precisely, and then return to my drink.', emotion: 'sad' },
    { id: 'address_nanami_2', speaker: 'nanami', line: 'A sensible question. Rare here. One moment.', emotion: 'sad' },
  ],
  geto: [
    { id: 'address_geto_1', speaker: 'geto', line: "Asking me? I'm flattered. Let's think it through together, shall we?", emotion: 'happy' },
    { id: 'address_geto_2', speaker: 'geto', line: 'What a lovely question. Come closer — this deserves a real answer.', emotion: 'whisper' },
  ],
}
