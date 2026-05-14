import { z } from 'zod'

// ---------------------------------------------------------------------------
// VoiceStatus
// ---------------------------------------------------------------------------

export const VoiceStatusSchema = z.enum(['idle', 'listening', 'processing', 'error'])

export type VoiceStatus = z.infer<typeof VoiceStatusSchema>

// ---------------------------------------------------------------------------
// VoiceError
// ---------------------------------------------------------------------------

export const VoiceErrorSchema = z.object({
  /** Machine-readable error code. */
  code: z.enum([
    'PERMISSION_DENIED',
    'NOT_SUPPORTED',
    'NETWORK_ERROR',
    'NO_SPEECH',
    'ABORTED',
    'UNKNOWN',
  ]),
  /** Human-readable message for display / logging. */
  message: z.string(),
})

export type VoiceError = z.infer<typeof VoiceErrorSchema>

// ---------------------------------------------------------------------------
// VoiceTranscriptState
// ---------------------------------------------------------------------------

export const VoiceTranscriptStateSchema = z.object({
  /** Current capture status. */
  status: VoiceStatusSchema,
  /** In-progress (non-final) transcript from the speech engine. */
  interimTranscript: z.string(),
  /** Confirmed, final transcript ready for parsing. */
  finalTranscript: z.string(),
  /** Non-null when status === 'error'. */
  error: VoiceErrorSchema.nullable(),
})

export type VoiceTranscriptState = z.infer<typeof VoiceTranscriptStateSchema>

// ---------------------------------------------------------------------------
// Default / initial value helper (no magic `any` casts required)
// ---------------------------------------------------------------------------

export const VOICE_TRANSCRIPT_INITIAL: VoiceTranscriptState = {
  status: 'idle',
  interimTranscript: '',
  finalTranscript: '',
  error: null,
}
