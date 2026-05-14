# voice-to-canvas

A Vite + React + TypeScript application that lets you draw and manipulate shapes
on a [tldraw](https://tldraw.dev) canvas using your voice. Speech recognition
falls back to **Deepgram Nova-2** when the browser's built-in Web Speech API is
unavailable (Firefox, Safari) or when higher accuracy is needed.

---

## Setup

### 1. Prerequisites

- **Node.js 18+** (LTS recommended)
- A free **Deepgram API key** — sign up at <https://console.deepgram.com>

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and replace `your_key_here` with your Deepgram API key:

```dotenv
DEEPGRAM_API_KEY=<paste your key here>
```

> **Why a `.env` file?**
> The Vite dev server reads `DEEPGRAM_API_KEY` at startup and injects it as an
> `Authorization` header on every proxied request to Deepgram (`/api/deepgram/*`).
> The key is **never** included in the browser bundle or sent to the client.
> `.env` is listed in `.gitignore` — never commit it.

### 4. Start the dev server

```bash
npm run dev
```

The app is available at <http://localhost:5173>.

#### Verify the proxy is working

While the dev server is running you can test the proxy with a quick REST call:

```bash
curl -s "http://localhost:5173/api/deepgram/v1/projects" | head -c 200
```

You should receive a JSON response from Deepgram (not an error). If you see
`DEEPGRAM_API_KEY is not set` in the Vite terminal output, make sure `.env`
exists and contains a valid key, then restart the dev server.

---

## Deepgram proxy architecture

```
Browser
  │  WebSocket / fetch to /api/deepgram/*
  ▼
Vite dev server  (vite.config.ts  server.proxy)
  │  Rewrites path, injects Authorization: Token <key>
  ▼
https://api.deepgram.com/*
```

The proxy config lives in [`vite.config.ts`](./vite.config.ts).  
Client-side URLs are exported from [`src/config/env.ts`](./src/config/env.ts).

### Production deployment

The Vite dev proxy is **development-only**. For production you must replace it
with a server-side route that injects the `Authorization` header. Recommended
options:

| Platform | Approach |
|---|---|
| Vercel | [Edge Function](https://vercel.com/docs/functions/edge-functions) at `/api/deepgram.ts` |
| Cloudflare Pages | [Pages Function](https://developers.cloudflare.com/pages/functions/) at `functions/api/deepgram/[[path]].ts` |
| AWS | Lambda function behind API Gateway |
| Self-hosted | Express/Fastify route that proxies to Deepgram |

Set the corresponding `VITE_DEEPGRAM_PROXY_URL` build variable to point the
browser at your production route (e.g. `VITE_DEEPGRAM_PROXY_URL=/api/deepgram`).

---

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check + production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |

---

## Voice command vocabulary

See [COMMANDS.md](./COMMANDS.md) for the full list of supported utterances,
intents, and grammar rules.
