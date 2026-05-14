/**
 * src/voice/VoiceOverlay.tsx
 *
 * Live transcript overlay — shows interim (greyed) and final (white) text
 * while the user is speaking.  Fades out when idle.
 *
 * Usage
 * -----
 *   const [state] = useVoiceTranscript()
 *
 *   <VoiceOverlay
 *     status={state.status}
 *     interim={state.interimTranscript}
 *     final={state.finalTranscript}
 *   />
 */

import type { CSSProperties } from 'react'
import type { VoiceStatus } from '../types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoiceOverlayProps {
  status: VoiceStatus
  /** Live partial transcript — shown in muted colour. */
  interim: string
  /** Committed transcript — shown prominently. */
  final: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  position: 'fixed',
  bottom: '6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9000,
  maxWidth: '600px',
  width: '90vw',
  padding: '0.75rem 1.25rem',
  borderRadius: '0.75rem',
  background: 'rgba(0, 0, 0, 0.65)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  color: '#f8fafc',
  fontSize: '1.125rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  textAlign: 'center',
  pointerEvents: 'none',
  transition: 'opacity 0.2s ease',
}

const interimStyle: CSSProperties = {
  color: '#94a3b8',
  fontStyle: 'italic',
}

const finalStyle: CSSProperties = {
  color: '#f8fafc',
  fontWeight: 500,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a frosted-glass overlay with the live transcript.
 * Returns null when there is nothing to display.
 */
export function VoiceOverlay({
  status,
  interim,
  final: finalText,
}: VoiceOverlayProps): React.ReactElement | null {
  const hasContent = Boolean(interim || finalText)
  const isRelevant = status === 'listening' || status === 'processing'

  if (!hasContent) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      style={{
        ...containerStyle,
        opacity: isRelevant ? 1 : 0.6,
      }}
    >
      {finalText && <span style={finalStyle}>{finalText}</span>}
      {finalText && interim && <span style={{ color: '#475569' }}> </span>}
      {interim && <span style={interimStyle}>{interim}</span>}
    </div>
  )
}
