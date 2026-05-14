/**
 * src/voice/index.ts
 *
 * Public API surface for the voice module.
 *
 * Voice capture hook
 * ------------------
 *   import { useVoiceTranscript } from 'src/voice'
 *   import type { UseVoiceTranscriptActions } from 'src/voice'
 *
 * UI components
 * -------------
 *   import { MicButton }    from 'src/voice'
 *   import { VoiceOverlay } from 'src/voice'
 *   import { VoiceCanvas }  from 'src/voice'
 *
 * Error handling & user feedback
 * ------------------------------
 *   import { useVoiceError }      from 'src/voice'
 *   import { VoiceErrorBoundary } from 'src/voice'
 *   import { VoiceErrorToast }    from 'src/voice'
 *
 * Types & utilities
 * -----------------
 *   import type { VoiceError, VoiceErrorCode } from 'src/voice'
 *   import { createVoiceError, toVoiceError }  from 'src/voice'
 *   import { VOICE_ERROR_MESSAGES }            from 'src/voice'
 */

// Voice capture
export { useVoiceTranscript } from './useVoiceTranscript'
export type { UseVoiceTranscriptActions } from './useVoiceTranscript'

// UI components
export { MicButton } from './MicButton'
export type { MicButtonProps } from './MicButton'

export { VoiceOverlay } from './VoiceOverlay'
export type { VoiceOverlayProps } from './VoiceOverlay'

export { VoiceCanvas } from './VoiceCanvas'
export type { VoiceCanvasProps } from './VoiceCanvas'

// Error types
export type { VoiceError, VoiceErrorCode } from './errors'

// Error utilities & constants
export {
  VOICE_ERROR_MESSAGES,
  PERSISTENT_ERROR_CODES,
  createVoiceError,
  toVoiceError,
  isVoiceError,
  isPersistentError,
  resolveErrorMessage,
} from './errors'

// Hooks
export { useVoiceError } from './useVoiceError'
export type { UseVoiceErrorReturn } from './useVoiceError'

// Components
export { VoiceErrorBoundary } from './VoiceErrorBoundary'
export type { VoiceErrorBoundaryProps } from './VoiceErrorBoundary'

export { VoiceErrorToast } from './VoiceErrorToast'
export type { VoiceErrorToastProps } from './VoiceErrorToast'
