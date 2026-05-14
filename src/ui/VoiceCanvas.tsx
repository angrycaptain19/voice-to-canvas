/**
 * VoiceCanvas
 *
 * Full-viewport tldraw canvas with integrated voice capture UI.
 * Composes: MicButton + VoiceOverlay on top of a Tldraw canvas.
 */

import React, { useCallback } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { useVoiceTranscript } from '../voice/useVoiceTranscript'
import { MicButton } from './MicButton'
import { VoiceOverlay } from './VoiceOverlay'

export interface VoiceCanvasProps {
  /** Called with each committed final transcript for downstream command parsing */
  onCommand?: (transcript: string) => void
  /** Mic interaction mode: 'toggle' (default) or 'hold' */
  micMode?: 'hold' | 'toggle'
}

export const VoiceCanvas: React.FC<VoiceCanvasProps> = ({
  onCommand,
  micMode = 'toggle',
}) => {
  const handleFinal = useCallback(
    (text: string) => {
      onCommand?.(text)
    },
    [onCommand],
  )

  const [voiceState, controls] = useVoiceTranscript({
    onFinalTranscript: handleFinal,
  })

  return (
    <div className="voice-canvas">
      <div className="voice-canvas__tldraw">
        <Tldraw />
      </div>

      <div className="voice-canvas__controls">
        <MicButton
          controls={controls}
          status={voiceState.status}
          error={voiceState.error}
          mode={micMode}
        />
      </div>

      <VoiceOverlay state={voiceState} />
    </div>
  )
}

export default VoiceCanvas
