// Pre-authored fallback branches — one per stance, used when the live LLM
// call fails. Each continues the opening from the player's answer in that
// stance's direction and ends on an open beat that invites the next reply.

import type { Beat, Stance } from '../src/lib/types'

export const PREAUTHORED_BRANCHES: Record<Stance, Beat[]> = {
  villain_romance: [
    {
      speaker: 'sukuna',
      line: 'You hear that? Night one and they walk straight into the fire. Someone bring them a drink.',
      emotion: 'happy',
    },
    {
      speaker: 'gojo',
      line: 'Betrayal! I offer you the winning side and you pick the arson side. Bold. Wrong, but bold.',
      emotion: 'surprise',
    },
    {
      speaker: 'toji',
      line: "Villain team's got better snacks. I checked.",
      emotion: 'happy',
    },
    {
      speaker: 'nanami',
      line: 'Let the record show I predicted this exact disaster at the casting stage.',
      emotion: 'sad',
    },
    {
      speaker: 'geto',
      line: 'Interesting. Everyone else auditions for the cameras. You aimed straight at the fire.',
      emotion: 'whisper',
    },
    {
      speaker: 'sukuna',
      line: "Come sit. We're planning how this season burns down — what do we light first?",
      emotion: 'whisper',
    },
  ],
  soulmate: [
    {
      speaker: 'gojo',
      line: "Okay, everybody OUT of this conversation. That answer was for me and I'm keeping it.",
      emotion: 'happy',
    },
    {
      speaker: 'choso',
      line: 'Choso heard it too. It has been written down. It has been underlined.',
      emotion: 'whisper',
    },
    {
      speaker: 'sukuna',
      line: 'Sincerity. On night one. Revolting. ...Continue.',
      emotion: 'disgust',
    },
    {
      speaker: 'geto',
      line: 'You meant it. That is rare in here — and the villa tests everything real by morning.',
      emotion: 'whisper',
    },
    {
      speaker: 'nanami',
      line: 'A reminder: words spoken honestly in this villa are binding. Choose the next ones with care.',
      emotion: 'sad',
    },
    {
      speaker: 'gojo',
      line: 'Forget the show for one second. Just you and me — did you actually mean that?',
      emotion: 'whisper',
    },
  ],
  alone_but_iconic: [
    {
      speaker: 'toji',
      line: "Look at that. Everyone else performed. They took inventory. I've been paid to do exactly that.",
      emotion: 'happy',
    },
    {
      speaker: 'sukuna',
      line: "A predator's answer. Watch, wait, pick your moment. I approve. Cautiously.",
      emotion: 'whisper',
    },
    {
      speaker: 'gojo',
      line: "You can't just ANNOUNCE you'll be watching us! Now I'm nervous! I am never nervous!",
      emotion: 'surprise',
    },
    {
      speaker: 'nanami',
      line: "At last, a strategy that isn't 'kiss everyone by Thursday.' I could weep.",
      emotion: 'happy',
    },
    {
      speaker: 'geto',
      line: 'The quiet ones decide how seasons end. I would know.',
      emotion: 'whisper',
    },
    {
      speaker: 'choso',
      line: 'Choso has a question. If you are watching everyone — who is winning so far?',
      emotion: 'happy',
    },
  ],
  friendship_finale: [
    {
      speaker: 'gojo',
      line: "Did everyone hear that? Friends. Real ones. This villa has literally never produced one before.",
      emotion: 'happy',
    },
    {
      speaker: 'nanami',
      line: 'A contestant interested in allies instead of drama. I may frame this transcript.',
      emotion: 'happy',
    },
    {
      speaker: 'choso',
      line: 'Alliance registered. Choso protects his people. This is not negotiable and it does not expire.',
      emotion: 'happy',
    },
    {
      speaker: 'sukuna',
      line: "Friends. In a dating villa. The audience will riot. ...Allow it. It's funnier.",
      emotion: 'disgust',
    },
    {
      speaker: 'toji',
      line: 'Alliances are free, which happens to be my favorite price. In.',
      emotion: 'happy',
    },
    {
      speaker: 'gojo',
      line: 'Team meeting, first order of business — who are we voting out first?',
      emotion: 'happy',
    },
  ],
}
