/**
 * src/voice/VoiceCanvas.tsx
 *
 * Top-level composition that wires together:
 *   - tldraw canvas (full viewport)
 *   - useVoiceTranscript hook
 *   - MicButton (toggle mode by default; hold-to-talk can be enabled)
 *   - VoiceOverlay (live transcript display)
 *   - VoiceErrorToast (error feedback)
 *
 * Keyboard shortcut
 * -----------------
 *   Space (when not in a text input) toggles listening on/off.
 */

import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

import { useVoiceTranscript } from './useVoiceTranscript'
import { MicButton } from './MicButton'
import { VoiceOverlay } from './VoiceOverlay'
import { VoiceErrorToast } from './VoiceErrorToast'
import { useVoiceError } from './useVoiceError'
import { createVoiceError } from './errors'
import type { VoiceError as TypesVoiceError } from '../types'
import type { VoiceErrorCode } from './errors'

// ---------------------------------------------------------------------------
// Error code mapping
// ---------------------------------------------------------------------------

/**
 * Map from the VoiceError codes defined in src/types/voice.ts to the
 * VoiceErrorCode union in src/voice/errors.ts so the toast system can
 * display the correct copy.
 */
function mapTypesErrorCodeToToastCode(code: TypesVoiceError['code']): VoiceErrorCode {
  switch (code) {
    case 'PERMISSION_DENIED':
      return 'MIC_PERMISSION_DENIED'
    case 'NOT_SUPPORTED':
      return 'SPEECH_API_UNAVAILABLE'
    case 'NETWORK_ERROR':
      return 'DEEPGRAM_CONNECTION_ERROR'
    case 'NO_SPEECH':
      return 'NO_SPEECH_DETECTED'
    case 'ABORTED':
    case 'UNKNOWN':
    default:
      return 'UNKNOWN'
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoiceCanvasProps {
  /**
   * Interaction mode for the mic button.
   * 'toggle' (default) — click once to start, click again to stop
   * 'hold'             — hold to record, release to commit
   */
  micMode?: 'toggle' | 'hold'
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
}

const toolbarStyle: CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9500,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-viewport canvas with integrated voice capture toolbar.
 */
export function VoiceCanvas({ micMode = 'toggle' }: VoiceCanvasProps): React.ReactElement {
  const [transcriptState, { start, stop }] = useVoiceTranscript()
  const { error: toastError, setError: setToastError, clearError } = useVoiceError()

  const { status, interimTranscript, finalTranscript, error } = transcriptState

  // Sync voice errors from the hook into the toast system
  useEffect(() => {
    if (error) {
      const toastCode = mapTypesErrorCodeToToastCode(error.code)
      setToastError(createVoiceError(toastCode, { message: error.message }))
    } else {
      clearError()
    }
  }, [error, setToastError, clearError])

  // Keyboard shortcut: Space toggles listening
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (status === 'listening') {
          stop()
        } else if (status === 'idle') {
          start()
        }
      }
    },
    [status, start, stop],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div style={rootStyle}>
      <Tldraw />

      <VoiceOverlay status={status} interim={interimTranscript} final={finalTranscript} />

      <div style={toolbarStyle}>
        <MicButton status={status} onStart={start} onStop={stop} mode={micMode} />
      </div>

      <VoiceErrorToast
        error={toastError}
        onDismiss={clearError}
        onSettingsClick={() => {
          window.open('chrome://settings/content/microphone', '_blank')
        }}
      />
    </div>
  )
}
