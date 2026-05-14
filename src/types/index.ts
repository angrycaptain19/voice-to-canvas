/**
 * src/types/index.ts
 *
 * Single import point for every shared type and Zod schema in the voice-to-canvas
 * pipeline.  Import from here -- never from individual sub-files -- so that all
 * downstream modules stay in sync with the single source of truth.
 *
 * @example
 *   import { ShapeCommandSchema, type ShapeCommand } from '../types'
 */

// ---------------------------------------------------------------------------
// Primitive shape enums / unions
// ---------------------------------------------------------------------------
export {
  ShapeTypeSchema,
  ShapeColorSchema,
  ShapeSizeSchema,
  ShapePositionSchema,
  type ShapeType,
  type ShapeColor,
  type ShapeSize,
  type ShapePosition,
} from './shapes'

// ---------------------------------------------------------------------------
// Parser output: ShapeCommand (+ ShapeReference discriminator)
// ---------------------------------------------------------------------------
export {
  IntentSchema,
  ShapeReferenceSchema,
  ShapeCommandSchema,
  ShapeCommandBatchSchema,
  type Intent,
  type ShapeReference,
  type ShapeCommand,
  type ShapeCommandBatch,
} from './commands'

// ---------------------------------------------------------------------------
// Executor input: TldrawAction (discriminated union)
// ---------------------------------------------------------------------------
export { ActionTypeSchema, TldrawActionSchema, type ActionType, type TldrawAction } from './actions'

// ---------------------------------------------------------------------------
// Voice capture state
// ---------------------------------------------------------------------------
export {
  VoiceStatusSchema,
  VoiceErrorSchema,
  VoiceTranscriptStateSchema,
  VOICE_TRANSCRIPT_INITIAL,
  type VoiceStatus,
  type VoiceError,
  type VoiceTranscriptState,
} from './voice'

// ---------------------------------------------------------------------------
// Animation & timeline
// ---------------------------------------------------------------------------
export {
  PlaybackStateSchema,
  AnimationKeyframeSchema,
  TimelineSchema,
  TIMELINE_INITIAL,
  type PlaybackState,
  type AnimationKeyframe,
  type Timeline,
} from './animation'
