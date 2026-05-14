/**
 * src/voice/useVoiceTranscript.ts
 *
 * Core voice-capture hook — wraps the Web Speech API and exposes a clean
 * React interface for the rest of the app.
 *
 * API
 * ---
 *   const [state, { start, stop }] = useVoiceTranscript()
 *
 * `state` follows the VoiceTranscriptState schema from src/types/voice.ts:
 *   {
 *     status:            'idle' | 'listening' | 'processing' | 'error'
 *     interimTranscript: string   // live partial text while speaking
 *     finalTranscript:   string   // committed utterance (resets on next start)
 *     error:             VoiceError | null
 *   }
 *
 * ## Streaming / auto-restart behaviour
 *
 * Recognition runs in `continuous` mode.  After a final result fires, if no
 * new speech arrives within SILENCE_TIMEOUT_MS the recognition is
 * soft-reset (stop → onend → restart) so the next utterance gets a clean
 * session.  The user can fully deactivate the mic by calling `stop()` (Space
 * bar second press), which sets `wantListeningRef = false` so the onend
 * handler does NOT restart.
 *
 * After a very long silence (LONG_SILENCE_TIMEOUT_MS with no interim
 * transcript) the mic is fully closed to prevent battery drain.
 *
 * Browser support
 * ---------------
 *   Chrome / Edge  — Web Speech API fully supported
 *   Firefox        — Web Speech API is absent; the hook sets status='error'
 *                    with code NOT_SUPPORTED and never requests mic
 *   Safari (iOS)   — Supported via webkitSpeechRecognition prefix
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { VOICE_TRANSCRIPT_INITIAL, type VoiceTranscriptState, type VoiceError } from '../types'

// ---------------------------------------------------------------------------
// Browser type augmentation
// ---------------------------------------------------------------------------

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: ((ev: Event) => void) | null
  onstart: ((ev: Event) => void) | null
  onnomatch: ((ev: Event) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * After a final result, if no new speech arrives within this window the
 * recognition is soft-restarted so the next sentence gets a clean session.
 */
const SILENCE_TIMEOUT_MS = 1500

/**
 * If there has been absolutely no interim or final speech for this long the
 * mic is fully closed (wantListeningRef false) to prevent battery drain.
 */
const LONG_SILENCE_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Obtain the SpeechRecognition constructor from the global scope,
 * handling the webkit-prefixed version used by Safari/older Chrome.
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (
      window as unknown as {
        webkitSpeechRecognition?: SpeechRecognitionConstructor
      }
    ).webkitSpeechRecognition ??
    null
  )
}

/** User-facing messages for each error code in VoiceErrorSchema. */
const VOICE_ERROR_TEXT: Record<VoiceError['code'], string> = {
  PERMISSION_DENIED: 'Microphone access blocked \u2014 check your browser settings',
  NOT_SUPPORTED: 'Your browser doesn\u2019t support voice input \u2014 use Chrome or Edge',
  NETWORK_ERROR: 'Network error \u2014 check your connection and try again',
  NO_SPEECH: 'Nothing heard \u2014 hold the mic button and speak',
  ABORTED: 'Recording stopped',
  UNKNOWN: 'Something went wrong \u2014 please try again',
}

function makeVoiceError(code: VoiceError['code'], message?: string): VoiceError {
  return { code, message: message ?? VOICE_ERROR_TEXT[code] }
}

/**
 * Map a SpeechRecognitionErrorEvent.error string to VoiceError.
 */
function mapSpeechError(errorCode: string): VoiceError {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return makeVoiceError('PERMISSION_DENIED')
    case 'no-speech':
      return makeVoiceError('NO_SPEECH')
    case 'audio-capture':
      return makeVoiceError('UNKNOWN', 'No microphone found \u2014 plug in a mic and try again')
    case 'network':
      return makeVoiceError('NETWORK_ERROR')
    case 'aborted':
      return makeVoiceError('ABORTED')
    default:
      return makeVoiceError('UNKNOWN')
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseVoiceTranscriptActions {
  /** Begin listening. No-op if already listening or not supported. */
  start: () => void
  /** Stop listening and commit any pending transcript. */
  stop: () => void
}

/**
 * useVoiceTranscript
 *
 * Returns a tuple of [state, actions] where:
 *  - state   — current VoiceTranscriptState
 *  - actions — { start, stop } callbacks
 *
 * The recognition instance is lazily created and reused across start/stop
 * cycles to minimise latency.
 */
export function useVoiceTranscript(): [VoiceTranscriptState, UseVoiceTranscriptActions] {
  const [state, setState] = useState<VoiceTranscriptState>(VOICE_TRANSCRIPT_INITIAL)

  // Stable ref to the recognition instance so it persists across renders
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Track whether the user *wants* to be listening.
  // true  - start() was called; onend will auto-restart recognition.
  // false - stop() was called by the user; onend will NOT restart.
  const wantListeningRef = useRef(false)

  // Silence timer: after a final result, soft-restart if no new speech within
  // SILENCE_TIMEOUT_MS.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long-silence timer: fully close mic if nothing heard for LONG_SILENCE_TIMEOUT_MS.
  const longSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Timer helpers
  // ---------------------------------------------------------------------------

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const clearLongSilenceTimer = useCallback(() => {
    if (longSilenceTimerRef.current !== null) {
      clearTimeout(longSilenceTimerRef.current)
      longSilenceTimerRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Create recognition instance
  // ---------------------------------------------------------------------------

  const getOrCreateRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (recognitionRef.current) return recognitionRef.current

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return null

    const r = new SpeechRecognition()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    r.maxAlternatives = 1

    // onstart
    r.onstart = () => {
      setState({
        status: 'listening',
        interimTranscript: '',
        finalTranscript: '',
        error: null,
      })

      // Start the long-silence guard.  Any speech activity will reset it.
      clearLongSilenceTimer()
      longSilenceTimerRef.current = setTimeout(() => {
        // No speech at all for LONG_SILENCE_TIMEOUT_MS - fully close mic.
        wantListeningRef.current = false
        const recognition = recognitionRef.current
        if (recognition) {
          try {
            recognition.stop()
          } catch {
            // ignore
          }
        }
      }, LONG_SILENCE_TIMEOUT_MS)
    }

    // onresult
    r.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let latestFinal = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          latestFinal += transcript
        } else {
          interim += transcript
        }
      }

      // Any speech activity resets the long-silence guard.
      clearLongSilenceTimer()
      longSilenceTimerRef.current = setTimeout(() => {
        wantListeningRef.current = false
        const recognition = recognitionRef.current
        if (recognition) {
          try {
            recognition.stop()
          } catch {
            // ignore
          }
        }
      }, LONG_SILENCE_TIMEOUT_MS)

      if (latestFinal) {
        // A final result arrived - commit it and clear interim.
        setState((prev) => ({
          ...prev,
          status: 'listening',
          interimTranscript: '',
          finalTranscript: latestFinal,
          error: null,
        }))

        // Arm the silence timer: if no new speech within SILENCE_TIMEOUT_MS,
        // soft-restart recognition so the next utterance gets a clean session.
        clearSilenceTimer()
        silenceTimerRef.current = setTimeout(() => {
          const recognition = recognitionRef.current
          if (recognition && wantListeningRef.current) {
            // Soft stop - onend will restart because wantListeningRef stays true.
            try {
              recognition.stop()
            } catch {
              // ignore
            }
          }
        }, SILENCE_TIMEOUT_MS)
      } else {
        // Only interim update - disarm the post-final silence timer because
        // the user is still speaking.
        clearSilenceTimer()

        setState((prev) => ({
          ...prev,
          status: 'listening',
          interimTranscript: interim,
          error: null,
        }))
      }
    }

    // onerror
    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' is raised when we call stop() ourselves - suppress it
      if (event.error === 'aborted') return

      // 'no-speech' during a soft-restart is benign; restart if still wanted.
      if (event.error === 'no-speech' && wantListeningRef.current) return

      const voiceError = mapSpeechError(event.error)

      setState((prev) => ({
        ...prev,
        status: 'error',
        interimTranscript: '',
        error: voiceError,
      }))
    }

    // onend
    r.onend = () => {
      clearSilenceTimer()
      clearLongSilenceTimer()

      if (wantListeningRef.current) {
        // Auto-restart: user still wants to be listening (soft reset between
        // utterances, or browser-initiated end).
        setState((prev) => ({
          ...prev,
          interimTranscript: '',
          // Keep status as 'listening' so the badge stays active.
          status: 'listening',
        }))

        // Restart recognition asynchronously to allow the engine to reset.
        setTimeout(() => {
          const recognition = recognitionRef.current
          if (recognition && wantListeningRef.current) {
            try {
              recognition.start()
            } catch {
              // Already started (e.g. StrictMode double-invoke) - ignore.
            }
          }
        }, 0)
      } else {
        // User explicitly stopped (or long-silence timeout) - go idle.
        setState((prev) => {
          if (prev.status === 'error') return prev
          return {
            ...prev,
            status: 'idle',
            interimTranscript: '',
          }
        })
      }
    }

    recognitionRef.current = r
    return r
  }, [clearSilenceTimer, clearLongSilenceTimer])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const start = useCallback(() => {
    // Check browser support first
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      setState({
        status: 'error',
        interimTranscript: '',
        finalTranscript: '',
        error: makeVoiceError('NOT_SUPPORTED'),
      })
      return
    }

    const recognition = getOrCreateRecognition()
    if (!recognition) return

    // Signal that we want to be listening - onend will auto-restart if needed.
    wantListeningRef.current = true

    try {
      recognition.start()
    } catch {
      // InvalidStateError is thrown if start() is called while already running.
      // This can happen in StrictMode double-invocation; silently ignore.
    }
  }, [getOrCreateRecognition])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    // Signal that the user explicitly wants to stop - onend will NOT restart.
    wantListeningRef.current = false
    clearSilenceTimer()
    clearLongSilenceTimer()

    // Use stop() (not abort()) so any pending results are delivered first
    try {
      recognition.stop()
    } catch {
      // May throw if already stopped
    }
  }, [clearSilenceTimer, clearLongSilenceTimer])

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      clearSilenceTimer()
      clearLongSilenceTimer()

      const recognition = recognitionRef.current
      if (recognition) {
        // Null out handlers before aborting to prevent state updates on
        // an unmounted component
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.onstart = null
        try {
          recognition.abort()
        } catch {
          // Ignore
        }
        recognitionRef.current = null
      }
    }
  }, [clearSilenceTimer, clearLongSilenceTimer])

  return [state, { start, stop }]
}
