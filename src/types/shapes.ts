import { z } from 'zod'

// ---------------------------------------------------------------------------
// ShapeType
// ---------------------------------------------------------------------------

export const ShapeTypeSchema = z.enum([
  'circle',
  'ellipse',
  'rectangle',
  'triangle',
  'arrow',
  'line',
  'star',
  'text',
  'frame',
])

export type ShapeType = z.infer<typeof ShapeTypeSchema>

// ---------------------------------------------------------------------------
// ShapeColor
// ---------------------------------------------------------------------------

export const ShapeColorSchema = z.enum([
  'red',
  'blue',
  'green',
  'orange',
  'yellow',
  'violet',
  'grey',
  'black',
  'white',
])

export type ShapeColor = z.infer<typeof ShapeColorSchema>

// ---------------------------------------------------------------------------
// ShapeSize
// ---------------------------------------------------------------------------

export const ShapeSizeSchema = z.enum(['small', 'medium', 'large', 'xl'])

export type ShapeSize = z.infer<typeof ShapeSizeSchema>

// ---------------------------------------------------------------------------
// ShapePosition
// ---------------------------------------------------------------------------

export const ShapePositionSchema = z.enum([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])

export type ShapePosition = z.infer<typeof ShapePositionSchema>
