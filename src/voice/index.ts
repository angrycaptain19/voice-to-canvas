/**
 * src/voice/index.ts
 *
 * Public API surface for the voice module.
 *
 * Error handling & user feedback
 * ──────────────────────────────
 *   import { useVoiceError }        from 'src/voice'
 *   import { VoiceErrorBoundary }   from 'src/voice'
 *   import { VoiceErrorToast }      from 'src/voice'
 *
 * Types & utilities
 * ─────────────────
 *   import type { VoiceError, VoiceErrorCode } from 'src/voice'
 *   import { createVoiceError, toVoiceError }  from 'src/voice'
 *   import { VOICE_ERROR_MESSAGES }            from 'src/voice'
 */

// ─── Error types ──────────────────────────────────────────────────────────────
export type { VoiceError, VoiceErrorCode } from './errors'

// ─── Error utilities & constants ─────────────────────────────────────────────
export {
  VOICE_ERROR_MESSAGES,
  PERSISTENT_ERROR_CODES,
  createVoiceError,
  toVoiceError,
  isVoiceError,
  isPersistentError,
  resolveErrorMessage,
} from './errors'

// ─── Hook ─────────────────────────────────────────────────────────────────────
export { useVoiceError } from './useVoiceError'
export type { UseVoiceErrorReturn } from './useVoiceError'

// ─── Components ───────────────────────────────────────────────────────────────
export { VoiceErrorBoundary } from './VoiceErrorBoundary'
export type { VoiceErrorBoundaryProps } from './VoiceErrorBoundary'

export { VoiceErrorToast } from './VoiceErrorToast'
export type { VoiceErrorToastProps } from './VoiceErrorToast'
