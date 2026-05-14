/**
 * src/voice/useVoiceError.ts
 *
 * useVoiceError — lightweight React hook that centralises voice-pipeline
 * error state for a single component subtree.
 *
 * Usage
 * -----
 *   const { error, setError, clearError } = useVoiceError()
 *
 *   // Raise an error (e.g. from a catch block):
 *   setError(createVoiceError('NO_SPEECH_DETECTED'))
 *
 *   // Clear after the user dismisses a toast:
 *   clearError()
 *
 * The hook is intentionally free of side-effects so it can be shared between
 * the voice-capture layer and the toast/banner UI without coupling them.
 */

import { useCallback, useState } from 'react'
import type { VoiceError } from './errors'

// ─── Public API type ──────────────────────────────────────────────────────────

export interface UseVoiceErrorReturn {
  /** The current error, or null when the pipeline is healthy. */
  error: VoiceError | null
  /**
   * Record a new voice error.  Replaces any previously recorded error so that
   * only the most-recent failure is surfaced to the user at a time.
   */
  setError: (error: VoiceError) => void
  /** Dismiss the current error (e.g. after a toast auto-dismiss or manual close). */
  clearError: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns a stable { error, setError, clearError } triple.
 *
 * setError and clearError are memoised with useCallback so they can
 * safely be listed in dependency arrays of other hooks.
 */
export function useVoiceError(): UseVoiceErrorReturn {
  const [error, setErrorState] = useState<VoiceError | null>(null)

  const setError = useCallback((nextError: VoiceError) => {
    setErrorState(nextError)
  }, [])

  const clearError = useCallback(() => {
    setErrorState(null)
  }, [])

  return { error, setError, clearError }
}
