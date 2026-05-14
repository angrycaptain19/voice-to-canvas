# voice-to-canvas

A Vite + React + TypeScript app that lets you draw on a [tldraw](https://tldraw.com) canvas using
your voice. Speak a command → it gets transcribed → parsed → turned into tldraw shapes.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Canvas | tldraw v3 | Full-featured vector drawing, programmatic API |
| Transcription | Web Speech API | Zero-latency, no API key needed for prototype |
| Framework | React 18 + Vite 6 | Fast dev loop, broad ecosystem |
| Language | TypeScript 5 (strict) | Safety at scale |
| State | Zustand v5 | Lightweight global state for canvas + voice |

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173> in **Chrome** (Web Speech API support is best there).

## Project structure

```
src/
  voice/
    useVoiceTranscript.ts   ← Core hook: mic capture + Web Speech API transcription
    speech-recognition.d.ts ← Type declarations for Web Speech API
    index.ts
  ui/
    MicButton.tsx           ← Hold-to-talk or toggle mic button
    VoiceOverlay.tsx        ← Live transcript overlay
    VoiceCanvas.tsx         ← tldraw canvas + voice UI composition
    index.ts
  commands/                 ← (future) transcript → tldraw action parser
  animation/                ← (future) shape animation utilities
  App.tsx
  main.tsx
```

## Voice hook API

```ts
import { useVoiceTranscript } from './voice'

// Minimal usage
const [{ status, interim, final, error }, { start, stop }] = useVoiceTranscript()

// With callbacks
const [state, controls] = useVoiceTranscript({
  onFinalTranscript: (text) => parseCommand(text),
  onInterimTranscript: (text) => updateOverlay(text),
  lang: 'en-US',
})
```

### `VoiceTranscriptState`

| Field | Type | Description |
|---|---|---|
| `status` | `'idle' \| 'listening' \| 'processing'` | Current lifecycle state |
| `interim` | `string` | Live partial transcript (resets on each final) |
| `final` | `string \| null` | Committed transcript; null until utterance ends |
| `error` | `string \| null` | Human-readable error, null when clear |

## Browser compatibility

| Browser | Support |
|---|---|
| Chrome / Edge (Chromium) | ✅ Full |
| Firefox | ⚠️ Shows "not supported" message gracefully |
| Safari | ⚠️ `webkitSpeechRecognition` available but API differs; shows error if absent |

## Scripts

```bash
npm run dev        # dev server (hot-reload)
npm run build      # production bundle
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
