# Voice to Canvas 🎙️➜🖼️

> **Speak shapes into existence.** Voice to Canvas lets you narrate drawing commands ("draw a red rectangle in the top-left corner") and watch them appear live on an infinite [tldraw](https://tldraw.dev) canvas.

---

## Table of Contents

- [Purpose](#purpose)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)

---

## Purpose

Voice to Canvas bridges the gap between **speech** and **visual thinking**. The goal is a zero-friction whiteboarding experience: open the app, speak naturally, and the canvas reflects your intent — no mouse required.

Key use-cases in mind:

- Rapid idea sketching during a meeting or commute
- Accessible drawing for users with limited fine-motor control
- Exploration of LLM-powered intent parsing for UI commands

---

## Tech Stack

| Concern    | Choice                                    | Notes                                        |
| ---------- | ----------------------------------------- | -------------------------------------------- |
| Framework  | **React 18**                              | Concurrent features, `StrictMode`            |
| Build tool | **Vite 6**                                | Sub-second HMR, ESM-native                   |
| Language   | **TypeScript 5** (strict)                 | Full type safety across the codebase         |
| Canvas     | **tldraw v3**                             | Infinite canvas, shape API, extensible       |
| State      | **Zustand v5**                            | Lightweight store for timeline & voice state |
| Linting    | **ESLint 9** (flat config) + **Prettier** | Enforced on every commit                     |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9 (or pnpm / bun — adjust commands accordingly)

### Install & run

```bash
# Install dependencies
npm install

# Start the dev server with hot-reload
npm run dev
```

Open http://localhost:5173 in your browser — you should see a blank tldraw canvas ready to use.

---

## Available Scripts

| Script                 | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Start Vite dev server with HMR                                 |
| `npm run build`        | Type-check then produce optimised production bundle in `dist/` |
| `npm run preview`      | Serve the `dist/` build locally                                |
| `npm run typecheck`    | Run `tsc --noEmit` (CI-friendly)                               |
| `npm run lint`         | Run ESLint across all `.ts` / `.tsx` files                     |
| `npm run format`       | Auto-format with Prettier                                      |
| `npm run format:check` | Prettier dry-run (used in CI)                                  |

---

## Project Structure

```
voice-to-canvas/
├── index.html              # Vite HTML entry point
├── vite.config.ts          # Vite + React plugin config
├── tsconfig.json           # TypeScript (app sources)
├── tsconfig.node.json      # TypeScript (Vite config file)
├── eslint.config.js        # ESLint flat config
├── .prettierrc             # Prettier rules
└── src/
    ├── main.tsx            # React root mount
    ├── App.tsx             # Root component — renders <Tldraw />
    ├── index.css           # Global reset & full-viewport layout
    ├── voice/              # Future: Web Speech API integration
    ├── commands/           # Future: Voice → tldraw command parser
    ├── animation/          # Future: Shape animation & timeline engine
    └── ui/                 # Future: Overlay UI (mic button, transcript panel)
```

---

## Roadmap

- [x] **Scaffold** — Vite + React + TypeScript + tldraw blank canvas
- [ ] **Voice input** — capture microphone audio, stream to Web Speech API
- [ ] **Command parser** — map transcribed text to tldraw shape operations
- [ ] **Animation engine** — timeline-driven shape transitions
- [ ] **Overlay UI** — microphone toggle, live transcript, undo history

---

## License

MIT
