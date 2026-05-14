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
  // Track whether we are intentionally stopping to suppress the onend
  // side-effect that would otherwise reset state prematurely
  const intentionalStopRef = useRef(false)

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
      intentionalStopRef.current = false
      setState({
        status: 'listening',
        interimTranscript: '',
        finalTranscript: '',
        error: null,
      })
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

      if (latestFinal) {
        // A final result arrived — commit it and clear interim
        setState((prev) => ({
          ...prev,
          status: 'listening',
          interimTranscript: '',
          finalTranscript: latestFinal,
          error: null,
        }))
      } else {
        // Only interim update
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
      // 'aborted' is raised when we call stop() ourselves — suppress it
      if (event.error === 'aborted') return

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
      if (intentionalStopRef.current) {
        // We stopped deliberately — transition to idle, keep finalTranscript
        setState((prev) => ({
          ...prev,
          status: 'idle',
          interimTranscript: '',
        }))
      } else {
        // Recognition ended on its own (silence timeout, connection drop)
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
  }, [])

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

    try {
      intentionalStopRef.current = false
      recognition.start()
    } catch {
      // InvalidStateError is thrown if start() is called while already running.
      // This can happen in StrictMode double-invocation; silently ignore.
    }
  }, [getOrCreateRecognition])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    intentionalStopRef.current = true
    // Use stop() (not abort()) so any pending results are delivered first
    try {
      recognition.stop()
    } catch {
      // May throw if already stopped
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
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
  }, [])

  return [state, { start, stop }]
}
