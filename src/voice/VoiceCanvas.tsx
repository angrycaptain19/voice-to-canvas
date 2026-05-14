/**
 * src/voice/VoiceCanvas.tsx
 *
 * Top-level composition that wires together:
 *   - tldraw canvas (full viewport)
 *   - useVoiceTranscript hook
 *   - VoiceControls (mic button, transcript overlay, status badge, feedback toast)
 *   - VoiceErrorToast (error feedback)
 *   - parseVoiceCommand (parser) -- invoked when a final transcript arrives
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

import { useVoiceTranscript } from './useVoiceTranscript'
import { VoiceErrorToast } from './VoiceErrorToast'
import { useVoiceError } from './useVoiceError'
import { createVoiceError, isVoiceError } from './errors'
import type { VoiceErrorCode } from './errors'
import { VoiceControls } from '../ui/VoiceControls'
import { parseVoiceCommand } from '../commands/parseVoiceCommand'
import type { ShapeCommand } from '../types'
import type { VoiceError as TypesVoiceError } from '../types'

// ---------------------------------------------------------------------------
// Error code mapping
// ---------------------------------------------------------------------------

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
// Human-readable command feedback
// ---------------------------------------------------------------------------

function commandToFeedbackLabel(cmd: ShapeCommand): string {
  const color = cmd.color ? cmd.color + ' ' : ''
  const shape = cmd.shapeType ?? 'shape'

  switch (cmd.intent) {
    case 'CREATE_SHAPE':
      return 'Created ' + color + shape
    case 'DELETE_SHAPE':
      return 'Deleted selection'
    case 'DELETE_ALL':
      return 'Cleared canvas'
    case 'MOVE_SHAPE':
      return 'Moved shape'
    case 'RESIZE_SHAPE':
      return 'Resized shape'
    case 'ROTATE_SHAPE':
      return 'Rotated shape'
    case 'STYLE_SHAPE':
      return 'Styled ' + color + shape
    case 'SELECT_SHAPE':
      return 'Selected ' + color + shape
    case 'SELECT_ALL':
      return 'Selected all'
    case 'DESELECT':
      return 'Deselected'
    case 'UNDO':
      return 'Undo'
    case 'REDO':
      return 'Redo'
    case 'RECORD_KEYFRAME':
      return 'Recorded keyframe'
    case 'PLAY':
      return 'Play'
    case 'PAUSE':
      return 'Pause'
    case 'STOP':
      return 'Stop'
    case 'SEEK':
      return cmd.timestamp !== undefined ? 'Seek to ' + cmd.timestamp + 's' : 'Seek'
    default:
      return cmd.rawTranscript
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** @deprecated -- pass nothing; the hybrid hold/toggle gesture is internal. */
export interface VoiceCanvasProps {
  micMode?: 'toggle' | 'hold'
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceCanvas(): React.ReactElement {
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

  // Parse final transcript and generate command feedback
  const lastParsedTranscriptRef = useRef<string>('')
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null)

  const runParser = useCallback(
    async (transcript: string) => {
      if (!transcript || transcript === lastParsedTranscriptRef.current) return
      lastParsedTranscriptRef.current = transcript

      try {
        const cmd = await parseVoiceCommand(transcript)
        setCommandFeedback(commandToFeedbackLabel(cmd))
      } catch (err) {
        if (isVoiceError(err)) {
          setToastError(err)
        } else {
          setToastError(createVoiceError('UNKNOWN'))
        }
        setCommandFeedback(null)
      }
    },
    [setToastError],
  )

  useEffect(() => {
    if (status === 'idle' && finalTranscript) {
      void runParser(finalTranscript)
    }
  }, [status, finalTranscript, runParser])

  // Clear command feedback when user starts a new recording
  useEffect(() => {
    if (status === 'listening') {
      lastParsedTranscriptRef.current = ''
      setCommandFeedback(null)
    }
  }, [status])

  return (
    <div style={rootStyle}>
      <Tldraw />

      <VoiceControls
        status={status}
        interim={interimTranscript}
        final={finalTranscript}
        error={error}
        onStart={start}
        onStop={stop}
        commandFeedback={commandFeedback}
      />

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
