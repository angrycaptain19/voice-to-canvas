import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    // tldraw ships ESM-only packages that need pre-bundling
    include: ['tldraw'],
  },

  server: {
    proxy: {
      /**
       * Deepgram API proxy — forwards /api/deepgram/* to https://api.deepgram.com/*
       *
       * The Authorization header is injected server-side from the DEEPGRAM_API_KEY
       * environment variable so the key is NEVER shipped in the browser bundle.
       *
       * WebSocket upgrade (wss://) is also forwarded, which is required for
       * Deepgram's streaming speech-recognition endpoint:
       *   wss://api.deepgram.com/v1/listen
       *
       * ⚠️  Production: replace this dev proxy with an edge function or
       *     serverless route (e.g. Vercel Edge, Cloudflare Worker, AWS Lambda)
       *     that performs the same Authorization-header injection.
       */
      '/api/deepgram': {
        target: 'https://api.deepgram.com',
        changeOrigin: true,
        ws: true, // forward WebSocket upgrades for streaming STT
        rewrite: (path) => path.replace(/^\/api\/deepgram/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.DEEPGRAM_API_KEY
            if (key) {
              proxyReq.setHeader('Authorization', `Token ${key}`)
            } else {
              // Warn loudly in the terminal so developers notice immediately
              console.warn(
                '[deepgram-proxy] DEEPGRAM_API_KEY is not set. ' +
                  'Copy .env.example → .env and add your key.',
              )
            }
          })
        },
      } satisfies ProxyOptions,
    },
  },
})
