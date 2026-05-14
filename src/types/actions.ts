import { z } from 'zod'
import { ShapeColorSchema, ShapePositionSchema, ShapeSizeSchema, ShapeTypeSchema } from './shapes'
import { ShapeReferenceSchema } from './commands'

// ---------------------------------------------------------------------------
// ActionType — mirrors Intent but represents tldraw executor operations
// ---------------------------------------------------------------------------

export const ActionTypeSchema = z.enum([
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

export type ActionType = z.infer<typeof ActionTypeSchema>

// ---------------------------------------------------------------------------
// Per-action payload schemas (discriminated union branches)
// ---------------------------------------------------------------------------

const CreateShapeActionSchema = z.object({
  type: z.literal('CREATE_SHAPE'),
  shapeType: ShapeTypeSchema,
  color: ShapeColorSchema.optional(),
  size: ShapeSizeSchema.optional(),
  position: ShapePositionSchema.optional(),
})

const MoveShapeActionSchema = z.object({
  type: z.literal('MOVE_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
  position: ShapePositionSchema.optional(),
  dx: z.number().optional(),
  dy: z.number().optional(),
})

const ResizeShapeActionSchema = z.object({
  type: z.literal('RESIZE_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
  size: ShapeSizeSchema.optional(),
  factor: z.number().optional(),
})

const RotateShapeActionSchema = z.object({
  type: z.literal('ROTATE_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
  angle: z.number().optional(),
})

const DeleteShapeActionSchema = z.object({
  type: z.literal('DELETE_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
})

const DeleteAllActionSchema = z.object({
  type: z.literal('DELETE_ALL'),
})

const StyleShapeActionSchema = z.object({
  type: z.literal('STYLE_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
  color: ShapeColorSchema.optional(),
})

const SelectShapeActionSchema = z.object({
  type: z.literal('SELECT_SHAPE'),
  targetId: z.string().optional(),
  shapeReference: ShapeReferenceSchema.optional(),
  shapeType: ShapeTypeSchema.optional(),
  color: ShapeColorSchema.optional(),
})

const SelectAllActionSchema = z.object({
  type: z.literal('SELECT_ALL'),
})

const DeselectActionSchema = z.object({
  type: z.literal('DESELECT'),
  targetId: z.string().optional(),
})

const UndoActionSchema = z.object({
  type: z.literal('UNDO'),
  steps: z.number().int().positive().optional(),
})

const RedoActionSchema = z.object({
  type: z.literal('REDO'),
  steps: z.number().int().positive().optional(),
})

const RecordKeyframeActionSchema = z.object({
  type: z.literal('RECORD_KEYFRAME'),
  timestamp: z.number().nonnegative().optional(),
})

const PlayActionSchema = z.object({
  type: z.literal('PLAY'),
  from: z.number().nonnegative().optional(),
})

const PauseActionSchema = z.object({
  type: z.literal('PAUSE'),
})

const StopActionSchema = z.object({
  type: z.literal('STOP'),
})

const SeekActionSchema = z.object({
  type: z.literal('SEEK'),
  timestamp: z.number().nonnegative(),
})

// ---------------------------------------------------------------------------
// TldrawAction — discriminated union consumed by the executor
// ---------------------------------------------------------------------------

export const TldrawActionSchema = z.discriminatedUnion('type', [
  CreateShapeActionSchema,
  MoveShapeActionSchema,
  ResizeShapeActionSchema,
  RotateShapeActionSchema,
  DeleteShapeActionSchema,
  DeleteAllActionSchema,
  StyleShapeActionSchema,
  SelectShapeActionSchema,
  SelectAllActionSchema,
  DeselectActionSchema,
  UndoActionSchema,
  RedoActionSchema,
  RecordKeyframeActionSchema,
  PlayActionSchema,
  PauseActionSchema,
  StopActionSchema,
  SeekActionSchema,
])

export type TldrawAction = z.infer<typeof TldrawActionSchema>
