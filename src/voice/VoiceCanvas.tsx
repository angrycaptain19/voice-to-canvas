/**
 * src/voice/VoiceCanvas.tsx
 *
 * Top-level composition that wires together the full voice → shape pipeline:
 *
 *   useVoiceTranscript()
 *       │ onFinalTranscript
 *       ▼
 *   parseVoiceCommand()   ← local grammar fast path (<5 ms), LLM fallback
 *       │ ShapeCommandBatch (always an array, even for single commands)
 *       ▼
 *   commandToAction()     ← intent → type rename (per command)
 *       │ TldrawAction[]
 *       ▼
 *   editor.run(() => { executeTldrawAction(editor, action) })
 *       ← all actions in one atomic undo step
 *       │
 *       ▼
 *   commandFeedback toast + error toast (on failure)
 *
 * Error containment:
 *   - The VoiceControls subtree is wrapped in a VoiceErrorBoundary so a
 *     render crash in the UI layer never takes down the canvas.
 *   - Parse / execute errors are caught and surfaced via the toast system.
 *   - If parseVoiceCommand throws PARSE_FAILURE we show
 *     "I didn't understand that" rather than crashing.
 *
 * Latency target:
 *   Grammar fast path: transcript → shape in ~10–30 ms (no network).
 *   LLM fallback path: transcript → shape in ~200–600 ms.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Editor } from 'tldraw'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

import { useVoiceTranscript } from './useVoiceTranscript'
import { VoiceErrorToast } from './VoiceErrorToast'
import { VoiceErrorBoundary } from './VoiceErrorBoundary'
import { useVoiceError } from './useVoiceError'
import { createVoiceError, isVoiceError } from './errors'
import type { VoiceErrorCode } from './errors'
import { VoiceControls } from '../ui/VoiceControls'
import { parseVoiceCommand } from '../commands/parseVoiceCommand'
import { executeTldrawAction } from '../commands/executeTldrawAction'
import { commandToAction } from '../commands/commandToAction'
import type { ShapeCommand } from '../types'
import type { VoiceError as TypesVoiceError } from '../types'

// ---------------------------------------------------------------------------
// Error code mapping (types/voice.ts codes → voice/errors.ts codes)
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
  // ── tldraw editor ref ──────────────────────────────────────────────────────
  // The editor is handed to us via <Tldraw onMount={...}> and stored in a ref
  // so it is always current in async callbacks without triggering re-renders.
  const editorRef = useRef<Editor | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    // Return a cleanup function — tldraw calls it when the canvas unmounts.
    return () => {
      editorRef.current = null
    }
  }, [])

  // ── Voice capture ──────────────────────────────────────────────────────────
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

  // ── Pipeline: transcript → parse → execute ─────────────────────────────────
  const lastParsedTranscriptRef = useRef<string>('')
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null)

  const runPipeline = useCallback(
    async (transcript: string) => {
      // Debounce: skip if we already processed this exact transcript
      if (!transcript || transcript === lastParsedTranscriptRef.current) return
      lastParsedTranscriptRef.current = transcript

      try {
        // Step 1: parse transcript → ShapeCommandBatch (always an array)
        const cmds = await parseVoiceCommand(transcript)

        // Step 2: execute all commands on live editor in one atomic undo step
        const editor = editorRef.current
        if (editor) {
          try {
            editor.run(() => {
              for (const cmd of cmds) {
                executeTldrawAction(editor, commandToAction(cmd))
              }
            })
          } catch (execErr) {
            // Execution errors (e.g. invalid editor state) are non-fatal —
            // log and show a generic toast rather than crashing.
            console.error('[VoiceCanvas] executeTldrawAction threw:', execErr)
            setToastError(createVoiceError('UNKNOWN'))
            setCommandFeedback(null)
            return
          }
        }

        // Step 3: surface command feedback toast
        // Show count if batch has more than one shape, otherwise describe the single command
        setCommandFeedback(
          cmds.length > 1
            ? `Created ${cmds.length} shapes`
            : commandToFeedbackLabel(cmds[0]),
        )
      } catch (err) {
        // parseVoiceCommand throws VoiceError on PARSE_FAILURE or
        // LLM_FALLBACK_ERROR.  Surface the right toast copy.
        if (isVoiceError(err)) {
          if (err.code === 'PARSE_FAILURE') {
            // Show a friendly "I didn't understand that" message instead of a
            // raw error so the pipeline never silently crashes.
            setToastError(
              createVoiceError('PARSE_FAILURE', {
                rawTranscript: transcript,
                message: `I didn\u2019t understand: \u201c${transcript}\u201d \u2014 try again`,
              }),
            )
          } else {
            setToastError(err)
          }
        } else {
          setToastError(createVoiceError('UNKNOWN'))
        }
        setCommandFeedback(null)
      }
    },
    [setToastError],
  )

  // Trigger the pipeline whenever a final transcript arrives and we are idle
  useEffect(() => {
    if (status === 'idle' && finalTranscript) {
      void runPipeline(finalTranscript)
    }
  }, [status, finalTranscript, runPipeline])

  // Clear command feedback & dedup guard when user starts a new recording
  useEffect(() => {
    if (status === 'listening') {
      lastParsedTranscriptRef.current = ''
      setCommandFeedback(null)
    }
  }, [status])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={rootStyle}>
      {/*
       * The tldraw canvas fills the full viewport.  onMount hands us the
       * Editor instance required by executeTldrawAction.
       */}
      <Tldraw onMount={handleMount} />

      {/*
       * VoiceErrorBoundary isolates the voice UI subtree so a render crash
       * in VoiceControls never brings down the whole canvas.
       */}
      <VoiceErrorBoundary>
        <VoiceControls
          status={status}
          interim={interimTranscript}
          final={finalTranscript}
          error={error}
          onStart={start}
          onStop={stop}
          commandFeedback={commandFeedback}
        />
      </VoiceErrorBoundary>

      {/*
       * VoiceErrorToast is rendered outside the boundary so it can display
       * errors even when the VoiceControls subtree has crashed.
       */}
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
