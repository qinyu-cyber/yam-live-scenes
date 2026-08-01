# YAM Live Scenes

A voice-native interactive scene: six voiced characters play a villa reality-show scene with each other, one turns to *you* with a question, you answer **by voice**, and the story branches live.

Built in one day at the AGI House hackathon. Full README (architecture, latency measurements, prebaked-vs-live breakdown) lands with the final submission.

**Stack:** Next.js + Bun · Inworld streaming TTS/STT · Tenstorrent-hosted `inworld-tts-2` (pre-render) · Claude (branch writer)

Cast sheets and story-direction rules adapted from our project **Yam**.

MIT — see [LICENSE](LICENSE).
