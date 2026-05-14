/**
 * src/config/env.ts
 *
 * Central place for environment / build-time config values that need to reach
 * the browser.  Only `VITE_*` prefixed variables are exposed by Vite to the
 * client bundle — everything else stays on the server side.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  IMPORTANT                                                                │
 * │  The Deepgram secret key must NOT appear anywhere in src/.  The actual   │
 * │  secret lives in .env (gitignored) and is read only by the Vite          │
 * │  dev-server proxy configured in vite.config.ts.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Base URL for all Deepgram requests made by the voice capture hook.
 *
 * • In development the Vite dev-server proxies `/api/deepgram/*` to
 *   `https://api.deepgram.com/*`, injecting the `Authorization` header
 *   server-side so the API key never reaches the browser.
 *
 * • In production this should point to your own edge function / serverless
 *   route that performs the same header injection.
 *   e.g. set  VITE_DEEPGRAM_PROXY_URL=/api/deepgram  in your hosting env.
 */
export const DEEPGRAM_PROXY_URL: string =
  import.meta.env.VITE_DEEPGRAM_PROXY_URL ?? '/api/deepgram'

/**
 * Convenience: build the full URL for Deepgram's streaming STT WebSocket.
 *
 * Usage:
 *   const wsUrl = deepgramStreamUrl({ model: 'nova-2', language: 'en-US' })
 *   const socket = new WebSocket(wsUrl)
 */
export function deepgramStreamUrl(
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ model: 'nova-2', ...params }).toString()
  // In development the Vite proxy upgrades ws:// to wss:// transparently.
  const base = DEEPGRAM_PROXY_URL.replace(/\/$/, '')
  return `${base}/v1/listen?${query}`
}
