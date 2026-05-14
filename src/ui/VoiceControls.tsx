/**
 * src/ui/VoiceControls.tsx
 *
 * Voice UI layer -- floating mic button, live transcript overlay,
 * status badge, and command-feedback toast.
 *
 * ## Interaction modes
 *
 * The mic button supports a hybrid hold-to-talk / toggle gesture:
 *   Hold >= 300 ms -> push-to-talk (release to stop)
 *   Tap  < 300 ms  -> toggle (click again to stop)
 *
 * Keyboard shortcut: Space (when not inside a text field) toggles listening.
 *
 * ## Composition
 *
 *   <VoiceControls
 *     status={voiceStatus}
 *     interim={interimTranscript}
 *     final={finalTranscript}
 *     error={voiceError}
 *     onStart={start}
 *     onStop={stop}
 *     commandFeedback={lastFeedback}
 *   />
 *
 * ## Accessibility
 * - Mic button: aria-label, aria-pressed
 * - Status badge: aria-live="polite" (screen reader announcements)
 * - Transcript overlay: role="status", aria-live="polite", aria-atomic="false"
 * - Command toast: role="status", aria-live="polite"
 * - Space key support with guard against text fields
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { VoiceStatus, VoiceError } from '../types'
import styles from './VoiceControls.module.css'

// ---- Constants --------------------------------------------------------------

const HOLD_THRESHOLD_MS = 300
const TOAST_VISIBLE_MS = 2500
const TOAST_EXIT_MS = 220
const DONE_BADGE_MS = 1800

// ---- MicIcon ----------------------------------------------------------------

function MicIcon({ recording }: { recording: boolean }): React.ReactElement {
  return (
    <svg
      className={styles.micIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {recording ? (
        <rect x={6} y={6} width={12} height={12} rx={1} fill="currentColor" stroke="none" />
      ) : (
        <>
          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
          <path d="M19 10a7 7 0 0 1-14 0" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      )}
    </svg>
  )
}

// ---- StatusBadge ------------------------------------------------------------

interface StatusBadgeProps {
  status: VoiceStatus
  showDone: boolean
  error: VoiceError | null
}

function badgeLabel(status: VoiceStatus, showDone: boolean, error: VoiceError | null): string {
  if (error !== null || status === 'error') return 'Error ✗'
  if (showDone) return 'Done ✓'
  switch (status) {
    case 'listening':
      return 'Listening…'
    case 'processing':
      return 'Processing…'
    default:
      return ''
  }
}

function StatusBadge({ status, showDone, error }: StatusBadgeProps): React.ReactElement | null {
  const label = badgeLabel(status, showDone, error)
  if (!label) return null

  const isListening = status === 'listening' && !showDone && error === null
  const isProcessing = status === 'processing' && !showDone && error === null
  const isError = error !== null || status === 'error'
  const isDone = showDone && error === null

  const badgeClass = [
    styles.statusBadge,
    isListening ? styles.statusListening : '',
    isProcessing ? styles.statusProcessing : '',
    isDone ? styles.statusDone : '',
    isError ? styles.statusError : '',
  ]
    .filter(Boolean)
    .join(' ')

  const dotClass = [styles.statusDot, isListening || isProcessing ? styles.pulsing : '']
    .filter(Boolean)
    .join(' ')

  return (
    <span className={badgeClass}>
      <span className={dotClass} aria-hidden="true" />
      {label}
    </span>
  )
}

// ---- TranscriptOverlay ------------------------------------------------------

interface TranscriptOverlayProps {
  status: VoiceStatus
  interim: string
  final: string
}

function TranscriptOverlay({
  status,
  interim,
  final: finalText,
}: TranscriptOverlayProps): React.ReactElement | null {
  const hasContent = Boolean(interim || finalText)
  const isActive = status === 'listening' || status === 'processing'

  if (!hasContent || !isActive) return null

  return (
    <div role="status" aria-live="polite" aria-atomic="false" className={styles.transcriptOverlay}>
      {finalText && <span className={styles.finalText}>{finalText}</span>}
      {finalText && interim && <span className={styles.textSep}> </span>}
      {interim && <span className={styles.interimText}>{interim}</span>}
    </div>
  )
}

// ---- CommandToast -----------------------------------------------------------

interface CommandToastProps {
  message: string
  exiting: boolean
}

function intentToIcon(message: string): string {
  const lc = message.toLowerCase()
  if (lc.includes('creat') || lc.includes('add') || lc.includes('draw')) return '✏️'
  if (lc.includes('delet') || lc.includes('remov')) return '🗑️'
  if (lc.includes('mov')) return '↔️'
  if (lc.includes('resiz') || lc.includes('scal')) return '⤢'
  if (lc.includes('rotat')) return '↻'
  if (lc.includes('select')) return '⬚'
  if (lc.includes('undo')) return '↩️'
  if (lc.includes('redo')) return '↪️'
  if (lc.includes('color') || lc.includes('colour') || lc.includes('fill')) return '🎨'
  if (lc.includes('play')) return '▶️'
  if (lc.includes('pause')) return '⏸️'
  if (lc.includes('stop')) return '⏹️'
  return '✓'
}

function CommandToast({ message, exiting }: CommandToastProps): React.ReactElement {
  const toastClass = [styles.commandToast, exiting ? styles.exiting : ''].filter(Boolean).join(' ')
  const icon = intentToIcon(message)

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={toastClass}>
      <span className={styles.toastIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.toastMessage}>{message}</span>
    </div>
  )
}

// ---- Props ------------------------------------------------------------------

export interface VoiceControlsProps {
  /** Current voice capture status. */
  status: VoiceStatus
  /** In-progress partial transcript. */
  interim: string
  /** Committed final transcript. */
  final: string
  /** Non-null when status === 'error'. */
  error: VoiceError | null
  /** Called when the button wants to begin recording. */
  onStart: () => void
  /** Called when the button wants to end recording. */
  onStop: () => void
  /**
   * When set, a command-feedback toast appears bottom-right for 2.5 s.
   * Pass the human-readable summary of the executed action.
   * Pass null / undefined to show nothing.
   */
  commandFeedback?: string | null
}

// ---- VoiceControls ----------------------------------------------------------

/**
 * Floating voice UI: mic button (hold-to-talk + toggle), live transcript
 * overlay, status badge, and command-feedback toast.
 *
 * Controlled presentational layer -- the parent owns useVoiceTranscript()
 * and passes state as props.
 */
export function VoiceControls({
  status,
  interim,
  final: finalText,
  error,
  onStart,
  onStop,
  commandFeedback,
}: VoiceControlsProps): React.ReactElement {
  const isListening = status === 'listening'
  const isDisabled = status === 'processing'

  // ---- Hold-to-talk / toggle hybrid ---------------------------------------

  const pointerDownAtRef = useRef<number | null>(null)
  const holdModeActiveRef = useRef(false)
  const toggleOnRef = useRef(false)

  // Incrementing counter used to trigger the hold-threshold side-effect
  const [holdTick, setHoldTick] = useState(0)

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (isDisabled) return
      e.currentTarget.setPointerCapture(e.pointerId)
      pointerDownAtRef.current = Date.now()
      holdModeActiveRef.current = false
      setHoldTick((n) => n + 1)
    },
    [isDisabled],
  )

  // After HOLD_THRESHOLD_MS, switch into push-to-talk mode
  useEffect(() => {
    if (holdTick === 0) return
    const downAt = pointerDownAtRef.current
    if (downAt === null || isDisabled) return

    const elapsed = Date.now() - downAt
    const delay = Math.max(0, HOLD_THRESHOLD_MS - elapsed)

    const id = setTimeout(() => {
      // Only activate if pointer is still held (ref is still set)
      if (pointerDownAtRef.current !== null && !toggleOnRef.current) {
        holdModeActiveRef.current = true
        onStart()
      }
    }, delay)

    return () => clearTimeout(id)
  }, [holdTick, isDisabled, onStart])

  const handlePointerUp = useCallback(() => {
    if (isDisabled) return
    const downAt = pointerDownAtRef.current
    pointerDownAtRef.current = null

    if (downAt === null) return

    const held = Date.now() - downAt

    if (holdModeActiveRef.current) {
      // Push-to-talk mode -- release stops recording
      holdModeActiveRef.current = false
      toggleOnRef.current = false
      onStop()
      return
    }

    // Short tap -- toggle
    if (held < HOLD_THRESHOLD_MS) {
      if (toggleOnRef.current) {
        toggleOnRef.current = false
        onStop()
      } else {
        toggleOnRef.current = true
        onStart()
      }
    } else {
      // Long press that completed in the timer but pointer was released late
      holdModeActiveRef.current = false
      toggleOnRef.current = false
      onStop()
    }
  }, [isDisabled, onStart, onStop])

  const handlePointerCancel = useCallback(() => {
    if (holdModeActiveRef.current || toggleOnRef.current) {
      holdModeActiveRef.current = false
      toggleOnRef.current = false
      onStop()
    }
    pointerDownAtRef.current = null
  }, [onStop])

  // ---- Keyboard support ---------------------------------------------------

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (isDisabled) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (isListening) {
          toggleOnRef.current = false
          onStop()
        } else {
          toggleOnRef.current = true
          onStart()
        }
      }
    },
    [isDisabled, isListening, onStart, onStop],
  )

  // Global Space shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (status === 'listening') {
          toggleOnRef.current = false
          onStop()
        } else if (status === 'idle') {
          toggleOnRef.current = true
          onStart()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [status, onStart, onStop])

  // Reset refs when status flips to idle/error externally
  useEffect(() => {
    if (status === 'idle' || status === 'error') {
      toggleOnRef.current = false
      holdModeActiveRef.current = false
    }
  }, [status])

  // ---- 'Done' badge -------------------------------------------------------

  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (!finalText || status !== 'idle') return
    setShowDone(true)
    const id = setTimeout(() => setShowDone(false), DONE_BADGE_MS)
    return () => clearTimeout(id)
  }, [finalText, status])

  // ---- Command feedback toast ---------------------------------------------

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastExiting, setToastExiting] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearToast = useCallback(() => {
    setToastExiting(true)
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null)
      setToastExiting(false)
    }, TOAST_EXIT_MS)
  }, [])

  useEffect(() => {
    if (!commandFeedback) return

    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }

    setToastMessage(commandFeedback)
    setToastExiting(false)

    toastTimerRef.current = setTimeout(() => {
      clearToast()
    }, TOAST_VISIBLE_MS)

    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [commandFeedback, clearToast])

  // ---- ARIA ---------------------------------------------------------------

  let ariaLabel: string
  if (status === 'error') {
    ariaLabel = 'Microphone error -- click to retry'
  } else if (isListening) {
    ariaLabel = 'Recording -- click or release to stop'
  } else if (status === 'processing') {
    ariaLabel = 'Processing voice command'
  } else {
    ariaLabel = 'Start recording -- hold for push-to-talk, tap to toggle'
  }

  let liveAnnouncement = ''
  if (status === 'error' && error) {
    liveAnnouncement = 'Error: ' + error.message
  } else if (status === 'listening') {
    liveAnnouncement = 'Listening'
  } else if (status === 'processing') {
    liveAnnouncement = 'Processing'
  } else if (showDone) {
    liveAnnouncement = 'Done'
  }

  // ---- Button class composition -------------------------------------------

  const buttonClass = [
    styles.micButton,
    isListening ? styles.micButtonListening : '',
    status === 'processing' ? styles.micButtonProcessing : '',
    status === 'error' ? styles.micButtonError : '',
  ]
    .filter(Boolean)
    .join(' ')

  // ---- Render -------------------------------------------------------------

  return (
    <div className={styles.voiceRoot}>
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </span>

      <TranscriptOverlay status={status} interim={interim} final={finalText} />

      <div className={styles.toolbar}>
        <StatusBadge status={status} showDone={showDone} error={error} />

        <button
          type="button"
          className={buttonClass}
          disabled={isDisabled}
          aria-label={ariaLabel}
          aria-pressed={isListening}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
        >
          {isListening && (
            <>
              <span className={styles.pulseRing} aria-hidden="true" />
              <span className={styles.pulseRing + ' ' + styles.pulseRing2} aria-hidden="true" />
            </>
          )}

          <MicIcon recording={isListening} />
        </button>
      </div>

      {toastMessage && <CommandToast message={toastMessage} exiting={toastExiting} />}
    </div>
  )
}
