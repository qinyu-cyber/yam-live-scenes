# YAM Live Scenes

**A scene you're inside.** Six voiced JJK characters play a Love Island villa scene *with each other* — then one turns to you with a question, and from that moment you just talk. No buttons. The cast hears you, remembers you, argues about you, and you can pull any of them aside for a private call the others never hear.

Built in one day at the AGI House hackathon.

> *demo GIF lands here after rehearsal*

## First principles

A live voiced scene has exactly three ways to die, and every design decision here attacks one of them:

1. **Dead air.** Silence after the player speaks reads as broken. So nothing waits for anything: transcription runs *while* you talk, three LLMs race to write the reply, beats play as they stream out, and the next line's audio renders while the current one plays.
2. **A goldfish cast.** Characters who forget what you said three turns ago aren't characters. So the cast remembers exactly what was *actually heard* — including lines you cut off.
3. **A player who can't act.** If you can't interrupt, you're an audience, not a cast member. So speaking over a character stops them mid-word, and what you said becomes the next turn.

## What happens when you talk

```
always-on VAD mic (speech start = barge-in; mute button for noisy rooms)
        │  audio streams to STT while you're still talking
streaming STT ── final transcript ~200ms after you stop
        │  + voice profile: detected emotion & vocal style
stance keywords (<5ms) ─ villain_romance / soulmate / friendship / lone wolf
        │
branch-writer RACE, 3-way: Inworld LLM Router vs streamed Claude
(cached prefix) vs Qwen3-32B on Tenstorrent — first usable beat wins,
losers are aborted
        │
beats play as they stream in; each beat's TTS renders while the
previous one plays; characters cut each other off on cue
```

Everything you hear after the cold open is generated live. The cold open itself is prebaked mp3s — it can never fail on stage, and it buys time to pre-warm the LLM prompt cache so your *first* answer already gets warm latency.

## Your voice shapes the room

Streaming STT returns more than words: a voice profile with detected **emotion** (tender, angry, sad…) and **vocal style** (whispering, laughing, shouting…). Both feed the scene writer — whisper a threat and the cast reacts to the whisper, not just the threat. Emotion also moves per-character relationship scores (the ♥ meter): warmth lands differently on Sukuna than on Choso.

## Memory

The cast remembers the conversation *as heard*, not as generated: a beat enters history only after it plays, and a line you barged into is marked cut — the character knows they never finished it. Open questions stay open ("everyone answer" means everyone answers, across turns). History rides into every prompt.

## Private calls

Click a portrait and you're in a 1-on-1 speech-to-speech call (Inworld Realtime API): full duplex, server-side turn detection, native barge-in. The character knows everything from the group chat — but what's said on the call goes **only** into that character's private notes. Back in the villa they can act on it or almost slip; nobody else knows a thing.

## Measured

Real numbers from live runs on the build machine (the on-screen DebugPanel shows these per turn; `data/turns.jsonl` accumulates every turn):

| Stage | Measured |
|---|---|
| Inworld streaming TTS (tts-2), time to first byte | **196 ms** |
| Streaming STT: speech end → final transcript | **~200 ms** |
| Batch STT round-trip (fallback path) | 620 ms |
| Stance classification (keyword tiers) | < 5 ms |
| Stance eval accuracy (22 labeled utterances) | **22/22** |
| Race: first beat via Inworld Router | **~0.7–1.5 s** |
| Race: Claude, streamed + cached prefix, first token | ~1.5 s warm |
| Speech end → first live voice heard | **~2.5–3 s** |
| Private call: speech end → character's voice | ~2.5 s |

## Eval, harness, dataset

*Choose a model, build an eval, build a harness, curate your dataset, iterate.* Models improve every few months; the pipeline and the dataset are the compounding assets:

- **Eval** — `bun run eval:stance`: 22 hand-labeled voice answers scored against the classifier. Run it after any keyword change.
- **Harness** — the DebugPanel + per-turn metrics: every demo run is also a measurement run (`mic_release → stt_done → stance_done → llm_first_token → playback_start`).
- **Dataset** — every turn appends `{transcript, emotion, stance, branch, provider, beats, timings}` to `data/turns.jsonl` (sample committed). This is the eval/fine-tuning seed for the voice-native version of Yam.

## Architecture

- `content/` — cast sheets, the authored cold open, the branch-writer contract with continuity rules, per-character voice configs (rate / delivery / temperature, canon-researched).
- `src/app/api/tts` — streaming proxy to Inworld `voice:stream` (tts-2); key stays server-side.
- `src/app/api/stt-stream` — relay to Inworld's bidirectional STT WebSocket (browsers can't auth a WS): transcribing while the player talks, voice profiling on.
- `src/app/api/scene` — transcript → NDJSON stream of beats as the winning LLM writes them; pre-authored fallback branch if zero beats arrive.
- `src/app/api/realtime` — relay holding the Inworld Realtime session for private calls.
- `src/lib/llm.ts` — the 3-way race with an incremental beat scanner; first sanitized beat claims the turn.
- `src/lib/vad.ts` / `src/lib/audioEngine.ts` — always-on energy VAD with pre-roll and mute; one state machine owns all playback, `stop()` is barge-in.
- Dialogue only ever exists as `{speaker, line, emotion}` beats — the same contract as Yam's engine, which is what makes Yam voice-ready with no schema change.

## Sponsors

- **Inworld** — streaming TTS-2 (196ms TTFB, inline emotion steering), bidirectional streaming STT with voice profiling, the LLM Router (one key, any model — set `INWORLD_ROUTER_MODEL` to swap), and the Realtime speech-to-speech API behind private calls. All six voices are from the Inworld catalog, matched to each character's canon speech style.
- **Tenstorrent** — hosts the Qwen3-32B lane of the branch-writer race: when it wins, the story you hear was written on Tenstorrent hardware.

## Run it yourself

```bash
bun install
cp .env.example .env.local   # fill in INWORLD_API_KEY, TENSTORRENT_API_KEY, ANTHROPIC_API_KEY
bun run smoke:tts && bun run smoke:stt   # verify keys + record your own latency
bun run prebake              # render the cold open to mp3
bun run dev                  # open http://localhost:3000 in Chrome, click Enter the Villa
```

Optional: `INWORLD_ROUTER_MODEL` in `.env.local` picks the Router lane's model (defaults to `openai/gpt-4o-mini`). Background art and portraits are not in the repo — drop your own into `public/images/` (`bg-villa.jpg`, `portraits/<id>.png`) or the UI falls back to styled cards.

## Provenance

Cast sheets, story-direction rules, stances, and sanitizer patterns adapted (hand-rewritten) from our project **Yam**, an interactive-story platform. This repo is the seed of Yam's voice surface: the beats→voice queue maps 1:1 onto Yam's render pipeline.

MIT — see [LICENSE](LICENSE).
