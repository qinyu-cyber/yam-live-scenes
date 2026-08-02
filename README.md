# YAM Live Scenes

**A scene you're inside.** Six voiced JJK characters play a Love Island villa scene *with each other* — then one turns to you with a question, you answer **by voice**, and the story branches live, with the cast quoting your actual words back at you.

Built in one day at the AGI House hackathon.

> *demo GIF lands here after rehearsal*

## What's prebaked vs what's live

The demo is honest about its latency trick — masking is a design technique, not a cheat:

```
[title click] ──► 40s cold open ──► Gojo's question ──► YOU JUST TALK
                  (PREBAKED mp3s,                       (always-on VAD mic;
                   can never fail)                       speaking = barge-in)
                                                           │
                                          transcript (LIVE Inworld STT, ~0.6s)
                                                           │
                                          stance keywords (LIVE, <5ms)
                                                           │
                                          branch writer RACE (LIVE), 3-way:
                                          gpt-4o-mini via Inworld LLM Router vs
                                          streamed Claude vs Qwen3-32B on
                                          Tenstorrent — first usable beat wins
                                                           │
              beats play as they stream in (LIVE Inworld TTS per line;
              each beat's audio prefetches while the previous one plays) ◄┘
```

Everything you hear after the cold open is generated live. Latency is attacked
directly instead of masked: the prompt forces beat 1 to be a sub-60-char reflex
reaction (first beat ~3.5s, voiced moments later), beats stream out of the LLM
one at a time, and TTS for beat N+1 renders while beat N plays. If both LLMs
fail, a pre-authored branch for the classified stance plays and the panel says so.

## Measurement

Real numbers from live runs on the build machine (the DebugPanel shows these per turn; `data/turns.jsonl` accumulates every turn):

| Stage | Measured |
|---|---|
| Inworld streaming TTS, time to first byte | **196 ms** |
| Inworld TTS, short line fully streamed | 365 ms |
| Inworld batch STT round-trip | **620 ms** |
| Stance classification (keyword tiers) | < 5 ms |
| Stance eval accuracy (20 labeled utterances) | **20/20** |
| Branch: Qwen3-32B on Tenstorrent, all beats | ~4.4 s |
| Branch: gpt-4o-mini via Inworld Router, first beat | **~0.7–1.5 s** |
| Branch: Claude (streamed, cached prefix), first beat | ~2.4 s |
| Speech end → first live voice heard | ~4–5 s |

Timestamps logged per turn: `mic_release → stt_done → stance_done → llm_first_token → tts_first_audio → playback_start` (see `src/lib/metrics.ts`, surfaced in the on-screen DebugPanel).

## Eval, harness, dataset

*Choose a model, build an eval, build a harness, curate your dataset, and iterate relentlessly.* Models improve every few months; the eval pipeline and the turn dataset are the compounding assets:

- **Eval** — `bun run eval:stance`: 20 hand-labeled voice answers scored against the classifier. Run it after any keyword change.
- **Harness** — the DebugPanel + per-turn metrics: every demo run is also a measurement run.
- **Dataset** — every turn appends `{transcript, emotion, stance, branch, provider, beats, timings}` to `data/turns.jsonl` (sample committed at `data/turns.sample.jsonl`). This is the fine-tuning/eval seed for the voice-native version of Yam.

## Architecture

- `content/` — cast sheets, the authored cold open, per-stance reaction lines, pre-authored fallback branches, the ~40-line branch-writer contract, sanitizers. Adapted from our project **Yam**.
- `src/app/api/tts` — streaming passthrough proxy to Inworld `voice:stream` (key stays server-side; disk cache by text+voice hash).
- `src/app/api/stt` — Inworld batch STT → `{text, emotion?, ms}` (surfaces the voice-profile emotion when present).
- `src/app/api/scene` — transcript → stance → NDJSON stream: meta, then **beats as the LLM writes them**, then done. Fallback to a pre-authored branch mid-stream if zero beats arrive.
- `src/lib/llm.ts` — the race: Tenstorrent-hosted Qwen3-32B (`<think>`-stripped JSON) vs Claude with structured outputs, streamed through an incremental beat scanner.
- `src/lib/audioEngine.ts` — one state machine owns all playback; one AudioContext unlocked by the title click; `stop()` is barge-in.
- Dialogue only ever exists as `{speaker, line, emotion}` beats — the same contract as Yam's engine, which is what makes Yam voice-ready with no schema change.

## Sponsors

- **Inworld** — live streaming TTS (196ms TTFB, inline `[emotion]` / `[sigh]` steering tags on every line) and batch STT with voice-profile emotion. All 6 character voices are from the Inworld catalog, matched to each character's written speech style.
- **Tenstorrent** — hosts the **Qwen3-32B branch writer** (`/v1/chat/completions`, ~1.6s): when it wins the race, the story you hear was written on Tenstorrent hardware. (We evaluated its `inworld-tts-2` mirror for pre-rendering, but it currently exposes one English male voice — and a six-man cast that switches voices mid-scene would break the illusion, so the prebake renders through Inworld direct with the identical voice IDs.)

## Run it yourself

```bash
bun install
cp .env.example .env.local   # paste INWORLD_API_KEY, TENSTORRENT_API_KEY, ANTHROPIC_API_KEY
bun run smoke:tts && bun run smoke:stt && bun run probe:tt   # verify keys + record latency
bun run prebake              # render the opening + reaction lines to mp3
bun run dev                  # open http://localhost:3000 in Chrome, click Enter the Villa
```

`?stt=web` on the URL switches speech-to-text to the browser's built-in recognition (emergency fallback).

## Provenance

Cast sheets, story-direction rules, stances, and sanitizer patterns adapted from our project **Yam** — an interactive-story platform. This repo is the seed of Yam's voice surface: the beats→voice queue maps 1:1 onto Yam's render pipeline.

MIT — see [LICENSE](LICENSE).

## What's next

- Inworld **Realtime API**: single-WebSocket STT+LLM+TTS with turn detection and native barge-in.
- VAD instead of hold-to-talk; per-character lipsync on the portraits.
- The turn dataset feeding stance-classifier and branch-writer evals for Yam.
