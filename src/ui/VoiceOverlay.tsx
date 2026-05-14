/**
 * VoiceOverlay
 *
 * Displays the live interim and final transcripts during a voice session.
 */

import React from 'react'
import { type VoiceTranscriptState } from '../voice/useVoiceTranscript'

export interface VoiceOverlayProps {
  state: VoiceTranscriptState
}

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ state }) => {
  const { status, interim, final, error } = state
  const visible = status !== 'idle' || !!error

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className={`voice-overlay voice-overlay--${status}`}
    >
      {error ? (
        <p className="voice-overlay__error" role="alert">
          <span aria-hidden="true">⚠️ </span>
          {error}
        </p>
      ) : (
        <>
          {interim && (
            <p className="voice-overlay__interim" aria-label="Partial transcript">
              {interim}
            </p>
          )}
          {final && (
            <p className="voice-overlay__final" aria-label="Final transcript">
              {final}
            </p>
          )}
          {status === 'listening' && !interim && !final && (
            <p className="voice-overlay__hint">Listening…</p>
          )}
          {status === 'processing' && (
            <p className="voice-overlay__hint">Processing…</p>
          )}
        </>
      )}
    </div>
  )
}

export default VoiceOverlay
