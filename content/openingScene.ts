// The authored ~30-second cold open. Beats are dialogue only (prose lives in
// sceneText); each line carries an Inworld emotion steering tag and stays
// under 200 chars for TTS.

import type { Beat, CharId } from '../src/lib/types'

export const OPENING: {
  sceneText: string
  beats: Beat[]
  question: string
  asker: CharId
} = {
  sceneText:
    'Night one. The villa doors swing open on a wall of camera flashes and floating cursed flames — and two season-one legends are already at war over a couch. Somewhere off-screen, a producer starts drafting an apology to the network.',
  beats: [
    {
      speaker: 'gojo',
      line: "Sukuna! Buddy! Doors are opening and you're on MY couch. The season one seating chart died with the season. Up.",
      emotion: 'happy',
    },
    {
      speaker: 'sukuna',
      line: 'I held this couch through a walk-off and a lawsuit. Take your complaint to someone who ranks.',
      emotion: 'angry',
    },
    {
      speaker: 'gojo',
      line: 'Oh he brought the jacket. The sixty-one percent jacket. You printed a NUMBER on CLOTHING. Who hurt you?',
      emotion: 'happy',
      cutoff: true, // talks right over Sukuna
    },
    {
      speaker: 'nanami',
      line: 'It is night one. We are ninety seconds in. I have already drafted two apologies to the network.',
      emotion: 'sad',
    },
    {
      speaker: 'toji',
      line: "Don't stop on my account. I get paid whether this show survives or not.",
      emotion: 'happy',
    },
    {
      speaker: 'choso',
      line: 'Confessional, entry one: Choso has arrived to love one person correctly. He is currently surrounded by amateurs.',
      emotion: 'whisper',
    },
    {
      speaker: 'sukuna',
      line: 'New cast. Rank yourselves by threat level and save me the effort.',
      emotion: 'disgust',
    },
    {
      speaker: 'geto',
      line: 'Strange. They swore these gates would stay welded shut. And yet — here I am. Someone must be worth the trouble.',
      emotion: 'whisper',
    },
    {
      speaker: 'gojo',
      line: "...Suguru. Nobody told me— okay. Okay! Fine. Great. Love that for the season.",
      emotion: 'surprise',
    },
    {
      speaker: 'sukuna',
      line: 'Ha! Look at that. The loud one finally ran out of words. Best premiere we have ever had.',
      emotion: 'happy',
      cutoff: true, // pounces on Gojo's stumble
    },
    {
      speaker: 'nanami',
      line: 'Security was not briefed on this arrival. I was not briefed. Naturally, the cameras were.',
      emotion: 'fear',
    },
    {
      speaker: 'gojo',
      line: "Hold on — new face at the door. You watched ALL of that and you're still standing there. So tell me: whose side are you walking in on?",
      emotion: 'happy',
      cutoff: true, // cuts Nanami off the moment he spots the player
    },
  ],
  question: "You watched all of that and you're still here. Whose side are you walking in on?",
  asker: 'gojo',
}
