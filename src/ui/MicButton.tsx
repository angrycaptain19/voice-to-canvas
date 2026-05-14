/**
 * MicButton
 *
 * A microphone button that supports:
 *  - hold-to-talk: records while pointer/key is held, commits on release
 *  - toggle: click to start, click again to stop
 */

import React, { useCallback, useEffect, useRef } from 'react'
import {
  type VoiceTranscriptControls,
  type TranscriptStatus,
} from '../voice/useVoiceTranscript'

export interface MicButtonProps {
  controls: VoiceTranscriptControls
  status: TranscriptStatus
  error?: string | null
  mode?: 'hold' | 'toggle'
  className?: string
}

function ariaLabel(status: TranscriptStatus, mode: 'hold' | 'toggle'): string {
  if (mode === 'hold') {
    return status === 'listening' ? 'Release to stop recording' : 'Hold to record'
  }
  return status === 'listening' ? 'Stop recording' : 'Start recording'
}

export const MicButton: React.FC<MicButtonProps> = ({
  controls,
  status,
  error,
  mode = 'toggle',
  className = '',
}) => {
  const { start, stop } = controls
  const isListening = status === 'listening' || status === 'processing'
  const holdActiveRef = useRef(false)

  // ── Hold-to-talk ──────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (mode !== 'hold') return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      holdActiveRef.current = true
      start()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [mode, start],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (mode !== 'hold') return
      if (!holdActiveRef.current) return
      holdActiveRef.current = false
      stop()
      e.currentTarget.releasePointerCapture(e.pointerId)
    },
    [mode, stop],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (mode !== 'hold') return
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (holdActiveRef.current) return
      e.preventDefault()
      holdActiveRef.current = true
      start()
    },
    [mode, start],
  )

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (mode !== 'hold') return
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (!holdActiveRef.current) return
      holdActiveRef.current = false
      stop()
    },
    [mode, stop],
  )

  // ── Toggle ────────────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (mode !== 'toggle') return
    if (isListening) { stop() } else { start() }
  }, [mode, isListening, start, stop])

  // Release hold if window loses focus
  useEffect(() => {
    if (mode !== 'hold') return
    const release = () => {
      if (holdActiveRef.current) {
        holdActiveRef.current = false
        stop()
      }
    }
    window.addEventListener('blur', release)
    return () => window.removeEventListener('blur', release)
  }, [mode, stop])

  const stateClass =
    status === 'listening'
      ? 'mic-button--listening'
      : status === 'processing'
        ? 'mic-button--processing'
        : error
          ? 'mic-button--error'
          : 'mic-button--idle'

  return (
    <button
      type="button"
      className={`mic-button ${stateClass} ${className}`.trim()}
      aria-label={ariaLabel(status, mode)}
      aria-pressed={isListening}
      title={error ?? undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={handleClick}
    >
      <MicIcon listening={isListening} />
      <span className="mic-button__label">
        {mode === 'hold'
          ? isListening
            ? 'Release'
            : 'Hold'
          : isListening
            ? 'Stop'
            : 'Speak'}
      </span>
    </button>
  )
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`mic-icon${listening ? ' mic-icon--active' : ''}`}
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

export default MicButton
