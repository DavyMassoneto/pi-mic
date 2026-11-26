# pi-mic

Voice input for pi, in the terminal (CLI) and in
[pi-web](https://www.npmjs.com/package/@agegr/pi-web). You speak, the audio goes to an
OpenAI-compatible `/v1/audio/transcriptions` endpoint (for example OmniRoute with Gemini or Deepgram) and the
text lands in the message field without being sent.

## Installation

```bash
pi install npm:pi-mic
```

Then, once, inside pi:

```
/mic setup     # picks the provider (key and baseUrl come from models.json/auth.json) and the model
/mic check     # confirms provider, key and endpoint with a silent audio clip
```

The configuration lives in `~/.pi/agent/pi-mic.json`:

```json
{ "provider": "omni-memory", "model": "deepgram/nova-3", "language": "pt", "device": "Microphone (HD Pro Webcam C920)" }
```

`language` and `device` are optional: without `language` the gateway detects the language; without
`device` the system default microphone is used.

## Gemini dictation through OmniRoute

Run `/mic setup`, select provider `omniroute`, select model `agy/gemini-3.8-flash-low`, then
choose **Per phrase (the provider above)**. The provider must already be registered in pi's
`models.json`; its base URL (including `/v1`) and API key are resolved from the provider registry
and `auth.json`. The transcription model does not need to be a chat model in the registry.
The saved configuration is:

```json
{ "provider": "omniroute", "model": "agy/gemini-3.8-flash-low", "language": "pt" }
```

**This model requires the Gemini transcription change from OmniRoute PR branch
`feat/audio-transcription-gemini` on [DavyMassoneto/OmniRoute](https://github.com/DavyMassoneto/OmniRoute)
to be deployed on your OmniRoute server.** pi-mic sends multipart audio with
`model=agy/gemini-3.8-flash-low` to `POST /v1/audio/transcriptions`; a server without that change
does not support this Gemini transcription path.

Gemini is an option, not the global default: setup does not default to provider `omniroute`, so
`deepgram/nova-3` remains the default transcription model and existing configured models are kept.
For `omniroute`, setup offers Gemini alongside the current model and **Other model…** for a custom
model. Other providers keep the free-text model input. To switch an existing realtime config to
Gemini dictation, choose **Per phrase** in setup (or remove `realtime` from `pi-mic.json`).
Deepgram realtime remains a separate option and continues to use its own model (default `nova-3`),
not the segmented transcription model.

## CLI

| Action | How |
|---|---|
| Start / stop recording | `Alt+M` or `/mic` |
| Pick the microphone (Windows) | `/mic device` |
| Configure provider/model/language | `/mic setup` |
| Test the endpoint | `/mic check` |

The transcription shows up in the editor while you speak, in one of two ways:

- **Real time (Deepgram):** with `"realtime": { "provider": "deepgram", "apiKey": "…" }` in
  `pi-mic.json` (or `DEEPGRAM_API_KEY`), the audio goes through Deepgram streaming and the words
  arrive as you speak. `/mic setup` configures it.
- **Segment by segment (any provider):** without `realtime`, pi-mic splits speech on pauses and
  sends each segment to the provider's `/audio/transcriptions`, with a partial preview.

In both modes only audio with voice (loud and with pitch) goes through: keyboard, clicks and
knocks do not become words. The audio keeps the microphone's native rate (48 kHz in the browser),
without resampling.

In real time, when you stop, pi-mic records 500 ms more (the last syllable often comes out together
with the key press), sends `Finalize` and waits for the final streaming results, then sends the
whole recording to Deepgram's pre-recorded endpoint, which sees the full sentence; that text
replaces the streaming one.

Extra options in `pi-mic.json`: `"keyterms": ["pi-mic", "OmniRoute"]` (terms Deepgram should
prioritize) and `"debug": true` (the pi-web host saves the audio and the events of each session in
`~/.pi/agent/pi-mic-debug`).
While recording, the editor is locked (only `Alt+M` to stop and `Esc` to cancel and restore the
previous text) and the footer shows `🔴` with the microphone level.

Capture: Windows uses the native `waveIn` API (nothing to install); macOS/Linux use `rec` (SoX) or
`arecord`. For tests, `PI_MIC_FAKE_INPUT=<file.wav>` (16 kHz mono) replaces the microphone.

Set `language` (for example `"pt-BR"`): short segments hurt automatic language detection.

## pi-web

pi-mic runs inside pi-web itself. Install it with `pi install npm:pi-mic`; when a session opens in
pi-web, the extension attaches to pi-web's own HTTP server, injects the microphone button into the
page and transcribes the audio on the server, so the provider key never reaches the browser. No
extra process or port is needed. Reload the page once after pi-web starts to get the button (pi-web
shows a notice when it is ready).

The microphone button sits on the message field row, right before Send; click it or press `Alt+M`
to record and again to stop, `Esc` cancels. As in the CLI, the text appears live and the field (and
Send) stay locked until the transcription finishes. In pi-web `/mic setup` and `/mic check` are
available; recording happens in the browser, never on the server machine.

The browser only grants the microphone in a secure context: `localhost`/`127.0.0.1` or HTTPS. To
use it from another device, put pi-web behind HTTPS inside your private network (for example
`tailscale serve --bg <pi-web port>`). Do not expose pi-web publicly: it may have no password.

## Architecture

All code is TypeScript under `src/`, split by layer:

| Folder | Responsibility |
|---|---|
| `src/core` | Browser-safe audio, text and transcription logic (no Node APIs) |
| `src/config` | Reading and writing `pi-mic.json` |
| `src/providers` | OpenAI-compatible gateway and Deepgram clients |
| `src/cli` | The pi extension: capture, dictation state machine, `/mic` commands |
| `src/web/host` | Attaches the mic routes and button injection to pi-web's HTTP server |
| `src/web/server` | Mic routes: transcription, realtime stream, config, browser assets |
| `src/web/client` | The browser script injected into pi-web |

pi loads the extension directly from `src/cli/extension.ts`. Only the web side is compiled
(`npm run build` writes `dist/`); the extension serves `dist/core` and `dist/web/client` to the browser
under `/__pi-mic/assets/`.

## Development

Git-flow with PRs, everything in [Conventional Commits](https://www.conventionalcommits.org/)
(commits and PR titles; CI rejects what does not follow them, and PRs from branches outside the
flow):

1. `feature/<name>` (or `bugfix/<name>`) → PR to `dev`, titled like `feat: …` / `fix: …`.
2. On every push to `dev`, the pipeline computes the next version from the commits since the last
   tag (`feat` → minor, `fix`/`perf`/`refactor` → patch, `!`/`BREAKING CHANGE` → major; before 1.0
   a breaking change bumps the minor) and opens or updates the `release/<version>` → `main` PR on
   its own, titled `chore(release): <version>`. Nobody picks the version.
3. Merging into `main` publishes to npm with trusted publishing, creates the tag and the GitHub
   release, merges `main` back into `dev` and deletes the release branch.

`hotfix/<name>` branches from `main` and goes back to `main`.

```bash
npm install
npm run check   # biome + no-comments + tsc + build + tests
```

The code base has no comments by rule: names, small functions and types carry the explanation, and
`npm run check` fails if a comment sneaks in.
