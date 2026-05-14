/**
 * src/voice/MicButton.tsx
 *
 * Microphone button component that supports two interaction modes:
 *
 *  1. Hold-to-talk  (default)
 *     Press and hold to record; release to commit.
 *
 *  2. Toggle mode   (mode="toggle")
 *     Click once to start recording; click again to stop.
 *
 * Usage
 * -----
 *   const [state, { start, stop }] = useVoiceTranscript()
 *
 *   <MicButton
 *     status={state.status}
 *     onStart={start}
 *     onStop={stop}
 *     mode="toggle"
 *   />
 */

import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { VoiceStatus } from '../types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MicButtonProps {
  /** Current voice capture status — drives visual state. */
  status: VoiceStatus
  /** Called when the button wants to begin recording. */
  onStart: () => void
  /** Called when the button wants to end recording. */
  onStop: () => void
  /**
   * 'hold'   — hold to record, release to commit (default)
   * 'toggle' — click once to start, click again to stop
   */
  mode?: 'hold' | 'toggle'
  /** Disable all interaction (e.g. while error state is shown). */
  disabled?: boolean
  /** Optional extra class name. */
  className?: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function buttonStyles(status: VoiceStatus, disabled: boolean): CSSProperties {
  const isListening = status === 'listening'
  const isError = status === 'error'

  let background = '#1e293b'
  let boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
  let transform = 'scale(1)'

  if (isListening) {
    background = '#dc2626'
    boxShadow = '0 0 0 4px rgba(220,38,38,0.3), 0 2px 8px rgba(0,0,0,0.3)'
    transform = 'scale(1.08)'
  } else if (isError) {
    background = '#92400e'
  }

  return {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '3.5rem',
    height: '3.5rem',
    borderRadius: '50%',
    border: 'none',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background,
    boxShadow,
    transform,
    transition: 'background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease',
    opacity: disabled ? 0.5 : 1,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
  }
}

const iconStyle: CSSProperties = {
  fontSize: '1.5rem',
  lineHeight: 1,
  pointerEvents: 'none',
  userSelect: 'none',
}

// ---------------------------------------------------------------------------
// Pulse ring keyframes
// ---------------------------------------------------------------------------

const PULSE_KEYFRAMES = `
@keyframes micPulse {
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(1.6); opacity: 0;   }
  100% { transform: scale(1.6); opacity: 0;   }
}
`

let pulseInjected = false
function ensurePulseKeyframes(): void {
  if (pulseInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = PULSE_KEYFRAMES
  document.head.appendChild(style)
  pulseInjected = true
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible microphone button with hold-to-talk and toggle modes.
 */
export function MicButton({
  status,
  onStart,
  onStop,
  mode = 'hold',
  disabled = false,
  className,
}: MicButtonProps): React.ReactElement {
  const isListening = status === 'listening'
  const isHoldMode = mode === 'hold'

  const holdActiveRef = useRef(false)

  useEffect(() => {
    ensurePulseKeyframes()
  }, [])

  // Hold-to-talk handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || !isHoldMode) return
      e.currentTarget.setPointerCapture(e.pointerId)
      holdActiveRef.current = true
      onStart()
    },
    [disabled, isHoldMode, onStart],
  )

  const handlePointerUp = useCallback(() => {
    if (!isHoldMode || !holdActiveRef.current) return
    holdActiveRef.current = false
    onStop()
  }, [isHoldMode, onStop])

  const handlePointerCancel = useCallback(() => {
    if (!isHoldMode || !holdActiveRef.current) return
    holdActiveRef.current = false
    onStop()
  }, [isHoldMode, onStop])

  // Toggle handler
  const handleClick = useCallback(() => {
    if (disabled || isHoldMode) return
    if (isListening) {
      onStop()
    } else {
      onStart()
    }
  }, [disabled, isHoldMode, isListening, onStart, onStop])

  // Keyboard support
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (isHoldMode && !holdActiveRef.current) {
          holdActiveRef.current = true
          onStart()
        } else if (!isHoldMode) {
          if (isListening) onStop()
          else onStart()
        }
      }
    },
    [disabled, isHoldMode, isListening, onStart, onStop],
  )

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled || !isHoldMode) return
      if (e.key === ' ' && holdActiveRef.current) {
        holdActiveRef.current = false
        onStop()
      }
    },
    [disabled, isHoldMode, onStop],
  )

  // Aria label
  let ariaLabel: string
  if (status === 'error') {
    ariaLabel = 'Microphone error'
  } else if (isHoldMode) {
    ariaLabel = isListening ? 'Recording — release to stop' : 'Hold to record'
  } else {
    ariaLabel = isListening ? 'Stop recording' : 'Start recording'
  }

  const icon = isListening ? '\u23F9' : '\uD83C\uDF99\uFE0F'

  return (
    <button
      type="button"
      className={className}
      style={buttonStyles(status, disabled)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={isListening}
      onPointerDown={isHoldMode ? handlePointerDown : undefined}
      onPointerUp={isHoldMode ? handlePointerUp : undefined}
      onPointerCancel={isHoldMode ? handlePointerCancel : undefined}
      onClick={!isHoldMode ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {isListening && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(220,38,38,0.5)',
            animation: 'micPulse 1.4s ease-out infinite',
          }}
        />
      )}
      <span style={iconStyle} aria-hidden="true">
        {icon}
      </span>
    </button>
  )
}
