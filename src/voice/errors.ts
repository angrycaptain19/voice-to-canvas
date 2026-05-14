/**
 * src/voice/errors.ts
 *
 * Central error taxonomy for the voice pipeline.
 *
 * All user-facing strings live here — do not inline error copy elsewhere.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Import conventions                                                      │
 * │  • Types:    import type { VoiceError, VoiceErrorCode } from './errors'  │
 * │  • Messages: import { VOICE_ERROR_MESSAGES }         from './errors'     │
 * │  • Guards:   import { isVoiceError }                 from './errors'     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ─── Error codes ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of every failure mode in the voice pipeline.
 *
 * | Code                      | Cause                                        |
 * |---------------------------|----------------------------------------------|
 * | MIC_PERMISSION_DENIED     | User blocked the microphone in the browser   |
 * | MIC_NOT_FOUND             | No audio input device is available           |
 * | SPEECH_API_UNAVAILABLE    | Browser doesn't support Web Speech API       |
 * | NO_SPEECH_DETECTED        | Silence timeout exceeded (> 6 s)             |
 * | PARSE_FAILURE             | Transcript didn't match any known command    |
 * | LLM_FALLBACK_ERROR        | GPT-4o-mini call failed                      |
 * | DEEPGRAM_CONNECTION_ERROR | WebSocket to the Deepgram proxy failed       |
 * | UNKNOWN                   | Any other / unexpected error                 |
 */
export type VoiceErrorCode =
  | 'MIC_PERMISSION_DENIED'
  | 'MIC_NOT_FOUND'
  | 'SPEECH_API_UNAVAILABLE'
  | 'NO_SPEECH_DETECTED'
  | 'PARSE_FAILURE'
  | 'LLM_FALLBACK_ERROR'
  | 'DEEPGRAM_CONNECTION_ERROR'
  | 'UNKNOWN'

// ─── Error value type ─────────────────────────────────────────────────────────

/** A structured voice-pipeline error value (not a thrown exception). */
export interface VoiceError {
  /** Discriminant — drives toast copy and recovery actions. */
  code: VoiceErrorCode
  /** Human-readable detail, useful for logging / debugging. */
  message: string
  /**
   * The raw transcript returned by the STT engine, present only when
   * code === 'PARSE_FAILURE'.
   */
  rawTranscript?: string
}

// ─── User-facing copy ─────────────────────────────────────────────────────────

/**
 * All user-visible strings for each error code.
 *
 * PARSE_FAILURE uses a function so the raw transcript can be interpolated;
 * every other code maps to a plain string.
 */
export const VOICE_ERROR_MESSAGES: {
  [K in VoiceErrorCode]: K extends 'PARSE_FAILURE' ? (rawTranscript: string) => string : string
} = {
  MIC_PERMISSION_DENIED: 'Microphone access blocked \u2014 click here to open browser settings',

  MIC_NOT_FOUND: 'No microphone found \u2014 plug in a mic and try again',

  SPEECH_API_UNAVAILABLE: 'Your browser doesn\u2019t support voice input \u2014 use Chrome or Edge',

  NO_SPEECH_DETECTED: 'Nothing heard \u2014 hold the mic button and speak',

  PARSE_FAILURE: (rawTranscript: string) =>
    `I didn\u2019t understand: \u201c${rawTranscript}\u201d \u2014 try again`,

  LLM_FALLBACK_ERROR: 'Something went wrong processing your command \u2014 please try again',

  DEEPGRAM_CONNECTION_ERROR:
    'Could not connect to speech recognition \u2014 check your network and retry',

  UNKNOWN: 'Something went wrong \u2014 please try again',
}

/**
 * Resolve the display string for a given VoiceError.
 *
 * Handles the PARSE_FAILURE interpolation automatically.
 */
export function resolveErrorMessage(error: VoiceError): string {
  if (error.code === 'PARSE_FAILURE') {
    return VOICE_ERROR_MESSAGES.PARSE_FAILURE(error.rawTranscript ?? '')
  }
  return VOICE_ERROR_MESSAGES[error.code]
}

// ─── Persistence / dismiss behaviour ─────────────────────────────────────────

/**
 * Error codes whose toasts should remain visible until the user explicitly
 * dismisses them (no auto-dismiss timer).
 */
export const PERSISTENT_ERROR_CODES = new Set<VoiceErrorCode>([
  'MIC_PERMISSION_DENIED',
  'SPEECH_API_UNAVAILABLE',
])

/**
 * Returns true when the toast for this error code should stay open until
 * manually dismissed.
 */
export function isPersistentError(code: VoiceErrorCode): boolean {
  return PERSISTENT_ERROR_CODES.has(code)
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** Construct a VoiceError from a VoiceErrorCode and optional overrides. */
export function createVoiceError(
  code: VoiceErrorCode,
  overrides: Partial<Omit<VoiceError, 'code'>> = {},
): VoiceError {
  const base: VoiceError = { code, message: '', ...overrides }
  base.message = overrides.message ?? resolveErrorMessage(base)
  return base
}

/**
 * Attempt to map an unknown caught value to a VoiceError.
 *
 * Useful in catch blocks where the error type is unknown.
 */
export function toVoiceError(unknown: unknown): VoiceError {
  if (isVoiceError(unknown)) return unknown

  const message = unknown instanceof Error ? unknown.message : 'An unknown error occurred'

  return { code: 'UNKNOWN', message }
}

// ─── Type guard ───────────────────────────────────────────────────────────────

/** Narrows unknown to VoiceError. */
export function isVoiceError(value: unknown): value is VoiceError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as VoiceError).code === 'string' &&
    typeof (value as VoiceError).message === 'string'
  )
}
