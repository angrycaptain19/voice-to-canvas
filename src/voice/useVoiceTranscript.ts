/**
 * useVoiceTranscript
 *
 * React hook that wraps the Web Speech API (SpeechRecognition) to provide
 * live interim and final transcription.
 *
 * Hook API contract
 * ─────────────────
 * interface VoiceTranscriptState {
 *   status: 'idle' | 'listening' | 'processing';
 *   interim: string;       // live partial transcript
 *   final: string | null;  // committed transcript, null until utterance ends
 *   error: string | null;
 * }
 * function useVoiceTranscript(): [VoiceTranscriptState, { start: () => void; stop: () => void }]
 *
 * Extended options:
 * function useVoiceTranscript(opts?: UseVoiceTranscriptOptions): [VoiceTranscriptState, VoiceTranscriptControls]
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Public types ─────────────────────────────────────────────────────────────

export type TranscriptStatus = 'idle' | 'listening' | 'processing'

export interface VoiceTranscriptState {
  /** Current lifecycle state */
  status: TranscriptStatus
  /** Live partial transcript; resets to '' when a final result is committed */
  interim: string
  /** Committed transcript for the last utterance; null until an utterance ends */
  final: string | null
  /** Human-readable error; null when there is no error */
  error: string | null
}

export interface UseVoiceTranscriptOptions {
  /** Called every time a final utterance is committed */
  onFinalTranscript?: (text: string) => void
  /** Called on every interim (partial) result update */
  onInterimTranscript?: (text: string) => void
  /** BCP-47 language tag. Defaults to 'en-US'. */
  lang?: string
}

export interface VoiceTranscriptControls {
  /** Begin microphone capture */
  start: () => void
  /** Stop microphone capture */
  stop: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    (window as Window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
  return Ctor ?? null
}

function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null
}

/** Maps SpeechRecognitionErrorCode to a user-friendly message */
function friendlyError(code: SpeechRecognitionErrorCode): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Please allow microphone permissions and try again.'
    case 'no-speech':
      return 'No speech was detected. Please try again.'
    case 'aborted':
      return 'Voice capture was cancelled.'
    case 'audio-capture':
      return 'No microphone was found or it could not be accessed.'
    case 'network':
      return 'A network error occurred during speech recognition. Please check your connection.'
    case 'bad-grammar':
      return 'Speech grammar error.'
    case 'language-not-supported':
      return 'The selected language is not supported by your browser.'
    default:
      return `Speech recognition error: ${code}`
  }
}

const INITIAL_STATE: VoiceTranscriptState = {
  status: 'idle',
  interim: '',
  final: null,
  error: null,
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Primary export.  Returns `[state, { start, stop }]`.
 *
 * @example
 * const [{ status, interim, final, error }, { start, stop }] = useVoiceTranscript()
 *
 * @example – with callbacks
 * const [state, controls] = useVoiceTranscript({
 *   onFinalTranscript: (text) => parseAndExecuteCommand(text),
 *   onInterimTranscript: (text) => setOverlayText(text),
 * })
 */
export function useVoiceTranscript(
  opts: UseVoiceTranscriptOptions = {},
): [VoiceTranscriptState, VoiceTranscriptControls] {
  const { lang = 'en-US' } = opts

  const [state, setState] = useState<VoiceTranscriptState>(() => {
    if (!isSpeechRecognitionSupported()) {
      return {
        ...INITIAL_STATE,
        error:
          'Speech recognition is not supported in this browser. ' +
          'Please use Chrome, Edge, or another Chromium-based browser.',
      }
    }
    return INITIAL_STATE
  })

  // Keep a stable ref to the latest opts so event handlers always see current callbacks.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Track whether stop() was called by the user (to suppress spurious 'aborted' errors)
  const stoppedByUserRef = useRef(false)

  // ── start ──────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) {
      setState((s) => ({
        ...s,
        error:
          'Speech recognition is not supported in this browser. ' +
          'Please use Chrome, Edge, or another Chromium-based browser.',
      }))
      return
    }

    // Prevent double-start
    if (recognitionRef.current) return

    stoppedByUserRef.current = false

    const recognition = new Ctor()
    recognition.lang = lang
    // continuous keeps the session open until stop() is called
    recognition.continuous = true
    // interimResults streams partial results as the user speaks
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setState({
        status: 'listening',
        interim: '',
        final: null,
        error: null,
      })
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''
      let finalTranscript = ''

      // Accumulate results from the last batch (resultIndex → end)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          finalTranscript += text
        } else {
          interimTranscript += text
        }
      }

      if (finalTranscript) {
        // Commit the final transcript; clear interim
        setState((s) => ({
          ...s,
          status: 'processing',
          interim: '',
          final: finalTranscript,
        }))
        optsRef.current.onFinalTranscript?.(finalTranscript)
        // Return to listening state if the session is still active
        setState((s) => ({
          ...s,
          status: recognitionRef.current ? 'listening' : 'idle',
        }))
      } else if (interimTranscript) {
        setState((s) => ({
          ...s,
          interim: interimTranscript,
          final: null,
        }))
        optsRef.current.onInterimTranscript?.(interimTranscript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const message = friendlyError(event.error)
      // 'no-speech' is non-fatal in continuous mode — report but keep listening
      if (event.error === 'no-speech') {
        setState((s) => ({ ...s, error: message }))
        return
      }
      // 'aborted' triggered by our own stop() call — swallow silently
      if (event.error === 'aborted' && stoppedByUserRef.current) {
        return
      }
      recognitionRef.current = null
      setState({
        status: 'idle',
        interim: '',
        final: null,
        error: message,
      })
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setState((s) => ({
        ...s,
        status: 'idle',
        interim: '',
      }))
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (err) {
      recognitionRef.current = null
      setState({
        status: 'idle',
        interim: '',
        final: null,
        error: `Could not start speech recognition: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }, [lang])

  // ── stop ───────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    stoppedByUserRef.current = true
    // stop() gracefully ends the session; onend fires asynchronously and resets state
    recognitionRef.current.stop()
  }, [])

  // Cleanup on unmount — abort without surfacing an error
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        stoppedByUserRef.current = true
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return [state, { start, stop }]
}

export default useVoiceTranscript
