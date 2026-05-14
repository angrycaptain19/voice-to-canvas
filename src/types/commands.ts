import { z } from 'zod'
import { ShapeColorSchema, ShapePositionSchema, ShapeSizeSchema, ShapeTypeSchema } from './shapes'

// ---------------------------------------------------------------------------
// Intent -- the full set of voice command intents supported by the parser
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
// ShapeReference -- discriminator fields used by the resolver to identify which
// shape(s) a command targets (MOVE_SHAPE, DELETE_SHAPE, STYLE_SHAPE, etc.)
// ---------------------------------------------------------------------------

export const ShapeReferenceSchema = z.object({
  /** Narrow by shape type (e.g. 'circle'). */
  shapeType: ShapeTypeSchema.optional(),

  /** Narrow by fill/stroke color (e.g. 'red'). */
  color: ShapeColorSchema.optional(),

  /** Narrow by logical size bucket (e.g. 'large'). */
  size: ShapeSizeSchema.optional(),

  /**
   * Ordinal qualifier -- 'first', 'last'/'latest', or a positive integer
   * (e.g. 2 for "second", 3 for "third").
   */
  ordinal: z
    .union([z.enum(['first', 'last', 'latest']), z.number().int().positive()])
    .optional(),

  /** Narrow by a text label the shape carries. */
  label: z.string().optional(),

  /** Named canvas position used as a spatial discriminator. */
  spatial: ShapePositionSchema.optional(),

  /** When true the command targets the current editor selection. */
  useSelection: z.boolean().optional(),
})

export type ShapeReference = z.infer<typeof ShapeReferenceSchema>

// ---------------------------------------------------------------------------
// ShapeCommand -- output of the NL parser, input to the command executor
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

  /**
   * Shape-reference discriminator fields for targeting commands
   * (MOVE_SHAPE, DELETE_SHAPE, STYLE_SHAPE, ROTATE_SHAPE, RESIZE_SHAPE).
   * Carries enough information for the resolver to identify the target shape(s)
   * without requiring a concrete targetId.
   */
  shapeReference: ShapeReferenceSchema.optional(),

  /** Raw transcript string that produced this command. */
  rawTranscript: z.string(),
})

export type ShapeCommand = z.infer<typeof ShapeCommandSchema>

// ---------------------------------------------------------------------------
// ShapeCommandBatch -- ordered list of one or more commands parsed from a
// single voice utterance (e.g. "draw a red circle and a blue square" → 2 cmds)
// ---------------------------------------------------------------------------

export const ShapeCommandBatchSchema = z.array(ShapeCommandSchema).min(1)
export type ShapeCommandBatch = z.infer<typeof ShapeCommandBatchSchema>
