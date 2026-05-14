import { z } from 'zod'
import { ShapeColorSchema, ShapePositionSchema, ShapeSizeSchema, ShapeTypeSchema } from './shapes'

// ---------------------------------------------------------------------------
// Intent — the full set of voice command intents supported by the parser
// ---------------------------------------------------------------------------

export const IntentSchema = z.enum([
  'CREATE_SHAPE',
  'MOVE_SHAPE',
  'RESIZE_SHAPE',
  'ROTATE_SHAPE',
  'DELETE_SHAPE',
  'DELETE_ALL',
  'STYLE_SHAPE',
  'SELECT_SHAPE',
  'SELECT_ALL',
  'DESELECT',
  'UNDO',
  'REDO',
  'RECORD_KEYFRAME',
  'PLAY',
  'PAUSE',
  'STOP',
  'SEEK',
])

export type Intent = z.infer<typeof IntentSchema>

// ---------------------------------------------------------------------------
// ShapeCommand — output of the NL parser, input to the command executor
// ---------------------------------------------------------------------------

export const ShapeCommandSchema = z.object({
  /** The parsed voice intent. */
  intent: IntentSchema,

  /** Target shape type (for CREATE_SHAPE and filter-based SELECT_SHAPE). */
  shapeType: ShapeTypeSchema.optional(),

  /** Fill / stroke color of the shape. */
  color: ShapeColorSchema.optional(),

  /** Logical size bucket. */
  size: ShapeSizeSchema.optional(),

  /** Named canvas position. */
  position: ShapePositionSchema.optional(),

  /** ID of the shape to operate on (operate-on-selection commands). */
  targetId: z.string().optional(),

  /** Relative horizontal move delta (pixels). */
  dx: z.number().optional(),

  /** Relative vertical move delta (pixels). */
  dy: z.number().optional(),

  /** Rotation angle in degrees (for ROTATE_SHAPE). */
  angle: z.number().optional(),

  /** Scale factor (for RESIZE_SHAPE, e.g. 1.5 = 150 %). */
  factor: z.number().optional(),

  /** Number of undo/redo steps. */
  steps: z.number().int().positive().optional(),

  /** Timeline timestamp in seconds (for SEEK / RECORD_KEYFRAME). */
  timestamp: z.number().nonnegative().optional(),

  /** Raw transcript string that produced this command. */
  rawTranscript: z.string(),
})

export type ShapeCommand = z.infer<typeof ShapeCommandSchema>
