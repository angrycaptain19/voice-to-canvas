/**
 * src/voice/VoiceErrorToast.tsx
 *
 * Renders a contextual toast notification for voice-pipeline errors.
 *
 * Behaviour
 * ---------
 * - Auto-dismisses after 5 000 ms for all codes EXCEPT MIC_PERMISSION_DENIED
 *   and SPEECH_API_UNAVAILABLE (those require the user to act, so they are
 *   persistent until manually dismissed).
 * - Exposes a close button so the user can always dismiss manually.
 * - MIC_PERMISSION_DENIED renders an anchor-style message that the consumer
 *   can wire to the browser settings URL via the onSettingsClick prop.
 * - The toast is portalled to document.body so it is never clipped by an
 *   overflow:hidden ancestor.
 *
 * Usage
 * -----
 *   const { error, clearError } = useVoiceError()
 *
 *   return (
 *     <VoiceErrorToast
 *       error={error}
 *       onDismiss={clearError}
 *       onSettingsClick={() => window.open('chrome://settings/content/microphone')}
 *     />
 *   )
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { VoiceError } from './errors'
import { isPersistentError, resolveErrorMessage } from './errors'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration (ms) before a non-persistent toast auto-dismisses. */
const AUTO_DISMISS_MS = 5_000

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VoiceErrorToastProps {
  /** The current voice error, or null / undefined to render nothing. */
  error: VoiceError | null | undefined
  /** Called when the toast is dismissed (auto or manual). */
  onDismiss: () => void
  /**
   * Called when the user clicks the action link on a MIC_PERMISSION_DENIED
   * toast.  If omitted the link is still rendered but does nothing.
   */
  onSettingsClick?: () => void
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '1.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    background: '#1e293b',
    color: '#f8fafc',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    minWidth: '280px',
    maxWidth: '480px',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    animation: 'voiceToastIn 0.2s ease-out',
  },
  icon: {
    flexShrink: 0,
    fontSize: '1.1em',
    marginTop: '0.05em',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  message: {
    margin: 0,
  },
  actionLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#93c5fd',
    cursor: 'pointer',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    textDecoration: 'underline',
    textAlign: 'left',
    lineHeight: 'inherit',
  },
  closeButton: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.125rem',
    fontSize: '1rem',
    lineHeight: '1',
    borderRadius: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    borderRadius: '0 0 0.75rem 0.75rem',
    background: '#3b82f6',
  },
}

// ─── Keyframe injection ───────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes voiceToastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes voiceToastProgress {
  from { width: 100%; }
  to   { width: 0%; }
}
`

let keyframesInjected = false

function ensureKeyframes(): void {
  if (keyframesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
  keyframesInjected = true
}

// ─── Icon helper ──────────────────────────────────────────────────────────────

function iconForCode(code: VoiceError['code']): string {
  switch (code) {
    case 'MIC_PERMISSION_DENIED':
    case 'MIC_NOT_FOUND':
      return '\uD83C\uDF99\uFE0F'
    case 'SPEECH_API_UNAVAILABLE':
      return '\uD83C\uDF10'
    case 'NO_SPEECH_DETECTED':
      return '\uD83D\uDD07'
    case 'PARSE_FAILURE':
      return '\u2753'
    case 'LLM_FALLBACK_ERROR':
    case 'DEEPGRAM_CONNECTION_ERROR':
      return '\u26A1'
    default:
      return '\u26A0\uFE0F'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a toast for error and calls onDismiss when it should disappear.
 * Returns null when error is falsy.
 */
export function VoiceErrorToast({
  error,
  onDismiss,
  onSettingsClick,
}: VoiceErrorToastProps): React.ReactElement | null {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    ensureKeyframes()
  }, [])

  useEffect(() => {
    if (!error) {
      setVisible(false)
      return
    }

    setVisible(true)

    if (!isPersistentError(error.code)) {
      timerRef.current = setTimeout(() => {
        onDismiss()
      }, AUTO_DISMISS_MS)
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [error, onDismiss])

  const handleDismiss = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    onDismiss()
  }, [onDismiss])

  if (!error || !visible) return null

  const isPersistent = isPersistentError(error.code)
  const message = resolveErrorMessage(error)
  const icon = iconForCode(error.code)

  const toast = (
    <div role="alert" aria-live="polite" aria-atomic="true" style={styles.container}>
      {/* Auto-dismiss progress bar for timed toasts */}
      {!isPersistent && (
        <span
          aria-hidden="true"
          style={{
            ...styles.progressBar,
            animation: `voiceToastProgress ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      )}

      <span style={styles.icon} aria-hidden="true">
        {icon}
      </span>

      <span style={styles.body}>
        {error.code === 'MIC_PERMISSION_DENIED' ? (
          <>
            <span style={styles.message}>Microphone access blocked &mdash;</span>
            <button type="button" style={styles.actionLink} onClick={onSettingsClick}>
              click here to open browser settings
            </button>
          </>
        ) : (
          <span style={styles.message}>{message}</span>
        )}
      </span>

      <button
        type="button"
        style={styles.closeButton}
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        &#x2715;
      </button>
    </div>
  )

  return createPortal(toast, document.body)
}
