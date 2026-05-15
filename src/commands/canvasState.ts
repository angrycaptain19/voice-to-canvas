/**
 * src/commands/canvasState.ts
 *
 * Serialises the current tldraw canvas into a compact, LLM-friendly JSON
 * snapshot (`CanvasStateSnapshot`) and provides a formatting helper
 * (`formatCanvasStateForPrompt`) that renders the snapshot as a bulleted list
 * suitable for injection into an LLM system prompt.
 *
 * @module
 */

import type { Editor } from 'tldraw'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CanvasShapeEntry = {
  id: string
  type: string
  geo?: string
  color?: string
  fill?: string
  dash?: string
  opacity?: number
  x: number
  y: number
  w: number
  h: number
  label?: string
  selected: boolean
}

export type CanvasStateSnapshot = {
  shapeCount: number
  shapes: CanvasShapeEntry[]
  viewportCenter: { x: number; y: number }
}

// ---------------------------------------------------------------------------
// Serialiser
// ---------------------------------------------------------------------------

export function serializeCanvasState(editor: Editor): CanvasStateSnapshot {
  const shapes = editor.getCurrentPageShapes()
  const selectedIds = new Set(editor.getSelectedShapeIds())
  const vp = editor.getViewportPageBounds()

  const entries: CanvasShapeEntry[] = []

  for (const shape of shapes) {
    const bounds = editor.getShapePageBounds(shape)
    if (!bounds) continue

    const props = shape.props as Record<string, unknown>

    const entry: CanvasShapeEntry = {
      id: shape.id,
      type: shape.type,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      selected: selectedIds.has(shape.id),
    }

    if (shape.type === 'geo' && typeof props['geo'] === 'string') {
      entry.geo = props['geo']
    }

    if (typeof props['color'] === 'string') {
      entry.color = props['color']
    }
    if (typeof props['fill'] === 'string') {
      entry.fill = props['fill']
    }
    if (typeof props['dash'] === 'string') {
      entry.dash = props['dash']
    }

    if (typeof shape.opacity === 'number' && shape.opacity !== 1) {
      entry.opacity = shape.opacity
    }

    const meta = shape.meta as Record<string, unknown>
    if (typeof meta['label'] === 'string' && meta['label'].length > 0) {
      entry.label = meta['label']
    }

    entries.push(entry)
  }

  return {
    shapeCount: entries.length,
    shapes: entries,
    viewportCenter: {
      x: vp.x + vp.w / 2,
      y: vp.y + vp.h / 2,
    },
  }
}

// ---------------------------------------------------------------------------
// Prompt formatter
// ---------------------------------------------------------------------------

export function formatCanvasStateForPrompt(snapshot: CanvasStateSnapshot): string {
  if (snapshot.shapeCount === 0) {
    return 'Canvas is empty.'
  }

  const lines: string[] = [
    `Canvas has ${snapshot.shapeCount} shape${snapshot.shapeCount === 1 ? '' : 's'}:`,
  ]

  for (const shape of snapshot.shapes) {
    const parts: string[] = []

    parts.push(`id:${shape.id}`)

    if (shape.type === 'geo' && shape.geo) {
      parts.push(`geo/${shape.geo}`)
    } else {
      parts.push(shape.type)
    }

    if (shape.color) parts.push(`color:${shape.color}`)
    if (shape.fill) parts.push(`fill:${shape.fill}`)
    if (shape.dash) parts.push(`dash:${shape.dash}`)
    if (shape.opacity !== undefined) parts.push(`opacity:${shape.opacity}`)

    if (shape.label) parts.push(`label:"${shape.label}"`)

    const w = Math.round(shape.w)
    const h = Math.round(shape.h)
    const x = Math.round(shape.x)
    const y = Math.round(shape.y)
    parts.push(`${w}\u00d7${h} at (${x},${y})`)

    if (shape.selected) parts.push('[SELECTED]')

    lines.push(`- ${parts.join('  ')}`)
  }

  return lines.join('\n')
}
