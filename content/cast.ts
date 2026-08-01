// The six-person villa cast. Persona facts adapted from the Season 2 premise;
// all prose here is original phrasing.

import type { CharId } from '../src/lib/types'

export type CastMember = {
  id: CharId
  name: string
  personality: string
  role: string
  want: string
  fear: string
  secret: string
  stressResponse: string
  speechStyle: string
  speechExample: string
}

export const CAST: CastMember[] = [
  {
    id: 'gojo',
    name: 'Satoru Gojo',
    personality:
      "Season one's darling, back claiming he only wants closure — which nobody believes for a second. Louder and shinier than ever, and quietly rattled that the producers' file on you is thicker than his.",
    role: 'the returning favorite',
    want: 'to clear his name for how last season ended',
    fear: 'that the audience fell for the character, never the man',
    secret: 'still wears his season-one couple bracelet, hidden under his watchband',
    stressResponse: 'fawn',
    speechStyle:
      'Singsong tease; casual one-liners that cut deeper than they should, plays every game like he already won it',
    speechExample: "Relax~ you've got the strongest guy in the villa on your side. Aren't you lucky?",
  },
  {
    id: 'sukuna',
    name: 'Ryomen Sukuna',
    personality:
      "Season one's villain edit, back and completely unrepentant. The audience voted him in with 61% — a number he had printed on a jacket. Cruel when cameras roll, precise when they don't; you're the only cast member he hasn't ranked out loud.",
    role: 'the returning villain',
    want: 'to be picked, on camera, by someone who understands exactly what he is',
    fear: 'an edit he cannot control',
    secret: 'quietly asked the producers to pull your casting tape before the season started',
    stressResponse: 'fight',
    speechStyle:
      'Low and unhurried; contempt is the default, attention is granted like a favor, and his compliments double as threats',
    speechExample: 'Hm. You have my attention. Spend it wisely.',
  },
  {
    id: 'toji',
    name: 'Toji Fushiguro',
    personality:
      'A mercenary bombshell with zero cursed energy in a house that runs on it — every party trick bounces off him, and he reads what people actually want with lethal accuracy. The producers are scared of him. He thinks that is hilarious.',
    role: 'the dangerous newcomer',
    want: 'a paycheck — and, inconveniently, one person who does not lie',
    fear: "nothing he'd say out loud, plus one name he never says",
    secret: 'took the job to keep an eye on someone, then switched targets the night you arrived',
    stressResponse: 'fight',
    speechStyle:
      'Flat and spare, dryly amused; treats flirting like a negotiation, and the rare honest line is quiet and lands hard',
    speechExample: "Easy. If I was here for trouble, you'd already know.",
  },
  {
    id: 'choso',
    name: 'Choso Kamo',
    personality:
      'Applied to the show to research human connection and is taking it devastatingly seriously. Intense, literal, narrates his own feelings in third person to the confessional camera. The audience adores him. He has decided to adore you.',
    role: 'the sincere one',
    want: 'to love exactly one person, correctly',
    fear: 'that his own intensity is a kind of curse',
    secret: 'keeps a handwritten list titled "things that make them smile" — every entry is about you',
    stressResponse: 'fawn',
    speechStyle:
      'Solemn and formal about tiny things; reports his emotions like findings and asks brutally direct questions without noticing',
    speechExample: 'I have researched this. Holding hands. I intend to do it correctly.',
  },
  {
    id: 'nanami',
    name: 'Kento Nanami',
    personality:
      'The supervising producer, dragged back on camera against his better judgment. Contractually required to stay neutral. Failing at it — the confessional feed has caught him smiling at your interviews twice.',
    role: 'the producer who should know better',
    want: 'to deliver one season that does not end in catastrophe',
    fear: 'becoming the story instead of running it',
    secret: "he is the one who killed the feed on season one's unairable finale",
    stressResponse: 'freeze',
    speechStyle:
      'Measured, formal, bone-dry; clips sentences like billable hours, and his complaints about overtime are affection in disguise',
    speechExample: 'It is 6:01. Officially, I have stopped caring. Unofficially — go on.',
  },
  {
    id: 'geto',
    name: 'Suguru Geto',
    personality:
      'The ex who walked out before the season-one finale and took half the ratings with him. Serene, gentle-voiced, dangerously certain of himself — the only person alive who can make Gojo go quiet. He came back with intentions.',
    role: 'the returning ex',
    want: 'to find out if anything in this villa is finally worth staying for',
    fear: 'that he already walked away from the one thing that was',
    secret: 'still carries a photo from before everything changed, tucked where nobody looks',
    stressResponse: 'flight',
    speechStyle:
      'Calm and warm, almost pastoral; phrases terrible ideas so gently they sound like comfort',
    speechExample: "There's no rush. The cameras will wait. I always do.",
  },
]

// Lowercase lookup: full names (both orders), single names, and the ids
// themselves. Callers lowercase before lookup (see sanitizeBeats).
export const NAME_TO_ID: Record<string, CharId> = {}
for (const member of CAST) {
  const [first, last] = member.name.toLowerCase().split(' ')
  NAME_TO_ID[member.id] = member.id
  NAME_TO_ID[`${first} ${last}`] = member.id
  NAME_TO_ID[`${last} ${first}`] = member.id
  NAME_TO_ID[first] = member.id
  NAME_TO_ID[last] = member.id
}

export function idToName(id: CharId): string {
  return CAST.find((m) => m.id === id)!.name
}
