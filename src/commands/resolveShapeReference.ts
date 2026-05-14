/**
 * src/commands/resolveShapeReference.ts
 *
 * Maps a natural-language shape reference (extracted from a parsed voice
 * command) to one or more live tldraw `TLShapeId`s.
 *
 * This is the missing layer between the command parser and the action executor:
 * MOVE_SHAPE / DELETE_SHAPE / STYLE_SHAPE / SELECT_SHAPE all need a concrete
 * shape ID to operate on, but the parser only has descriptive attributes
 * (color, type, spatial position, ordinal, …). This module bridges that gap.
 *
 * ## Usage
 *
 * ```ts
 * import { resolveShapeReference } from './resolveShapeReference'
 *
 * const result = resolveShapeReference(editor, { shapeType: 'circle', color: 'red' })
 * if (result.kind === 'found') {
 *   editor.deleteShapes(result.ids)
 * }
 * ```
 *
 * @module
 */

import type { Editor, TLShapeId } from 'tldraw'
import type { ShapeColor, ShapePosition, ShapeSize, ShapeType } from '../types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A structured description of the shape the user is referring to.
 * All fields are optional; combine them for more precise targeting.
 */
export interface ShapeRef {
  /** Logical shape type ('circle' | 'rectangle' | …) */
  shapeType?: ShapeType

  /** Fill / stroke color ('red' | 'blue' | …) */
  color?: ShapeColor

  /** Logical size bucket ('small' | 'medium' | 'large' | 'xl') */
  size?: ShapeSize

  /**
   * Ordinal selection:
   * - `'first'`  → lowest fractional index (oldest shape)
   * - `'last'` / `'latest'` → highest fractional index (most recently created)
   * - `number` N → Nth shape by index (1-based)
   */
  ordinal?: 'first' | 'last' | 'latest' | number

  /** Match by `shape.meta.label` (case-insensitive). */
  label?: string

  /**
   * Spatial zone of the shape's center relative to the viewport.
   * Viewport is divided into a 3x3 grid; each cell corresponds to a position.
   */
  spatial?: ShapePosition

  /**
   * If `true` and ref has no other qualifying fields, return the currently
   * selected shapes directly.  If combined with other fields, adds +2 to
   * the score of shapes that are in the current selection.
   */
  useSelection?: boolean
}

/**
 * The result of a shape-reference resolution attempt.
 */
export type ResolveResult =
  | { kind: 'found'; ids: TLShapeId[] }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: TLShapeId[] }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a logical `ShapeType` to the tldraw shape type + optional geo variant.
 * Mirrors `resolveShapeKind` in `executeTldrawAction.ts`.
 */
function resolveShapeKind(shapeType: ShapeType): {
  tldrawType: 'geo' | 'arrow' | 'text' | 'frame' | 'line'
  geoVariant?: string
} {
  switch (shapeType) {
    case 'circle':
      return { tldrawType: 'geo', geoVariant: 'ellipse' }
    case 'ellipse':
      return { tldrawType: 'geo', geoVariant: 'ellipse' }
    case 'rectangle':
      return { tldrawType: 'geo', geoVariant: 'rectangle' }
    case 'triangle':
      return { tldrawType: 'geo', geoVariant: 'triangle' }
    case 'star':
      return { tldrawType: 'geo', geoVariant: 'star' }
    case 'arrow':
      return { tldrawType: 'arrow' }
    case 'line':
      return { tldrawType: 'line' }
    case 'text':
      return { tldrawType: 'text' }
    case 'frame':
      return { tldrawType: 'frame' }
    default: {
      void (shapeType as never)
      return { tldrawType: 'geo', geoVariant: 'rectangle' }
    }
  }
}

/**
 * Derives a logical size bucket from a shape's bounding-box area.
 *
 * area < 150x150 => 'small'
 * area < 300x300 => 'medium'
 * area < 500x500 => 'large'
 * else           => 'xl'
 */
function sizeBucket(w: number, h: number): ShapeSize {
  const area = w * h
  if (area < 150 * 150) return 'small'
  if (area < 300 * 300) return 'medium'
  if (area < 500 * 500) return 'large'
  return 'xl'
}

/**
 * Returns the spatial zone (ShapePosition) for a point (cx, cy) within a
 * viewport rectangle.  The viewport is split into a uniform 3x3 grid:
 *
 * top-left  |   top    | top-right
 * ----------+----------+-----------
 *   left    |  center  |   right
 * ----------+----------+-----------
 * bottom-left|  bottom  | bottom-right
 */
function spatialZone(
  cx: number,
  cy: number,
  vp: { x: number; y: number; w: number; h: number },
): ShapePosition {
  const col = Math.floor(((cx - vp.x) / vp.w) * 3) // 0 | 1 | 2
  const row = Math.floor(((cy - vp.y) / vp.h) * 3) // 0 | 1 | 2

  // Clamp to [0, 2] to handle edge cases (shape center exactly on boundary)
  const c = Math.min(2, Math.max(0, col))
  const r = Math.min(2, Math.max(0, row))

  const ZONES: ShapePosition[][] = [
    ['top-left', 'top', 'top-right'],
    ['left', 'center', 'right'],
    ['bottom-left', 'bottom', 'bottom-right'],
  ]

  return ZONES[r][c]
}

/**
 * Checks whether the given ref has at least one qualifying field set.
 * Used for the single-shape-on-canvas shortcut.
 */
function refHasQualifier(ref: ShapeRef): boolean {
  return (
    ref.shapeType !== undefined ||
    ref.color !== undefined ||
    ref.size !== undefined ||
    ref.ordinal !== undefined ||
    ref.label !== undefined ||
    ref.spatial !== undefined ||
    ref.useSelection === true
  )
}

/**
 * Compares two tldraw fractional-index strings lexicographically.
 * tldraw uses a system where higher string value = more recently created.
 */
function compareIndex(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a `ShapeRef` against the shapes currently on the tldraw canvas and
 * returns the matching shape ID(s).
 *
 * Special-case fast paths (bypass scoring):
 * 1. `ref.useSelection === true` with no other qualifiers -> return selected IDs
 * 2. `ref.ordinal === 'last'` / `'latest'` -> shape with highest `index`
 * 3. `ref.ordinal === 'first'`               -> shape with lowest `index`
 * 4. `ref.ordinal` is a number N             -> Nth shape by index (1-based)
 * 5. Only 1 shape on canvas + any qualifier  -> return it directly
 *
 * Scoring (when no fast path applies):
 * Each shape receives a score:
 * +3 if shape.type / shape.props.geo matches ref.shapeType
 * +3 if shape.props.color matches ref.color
 * +2 if shape is in the current selection AND ref.useSelection === true
 * +2 if shape.meta.label matches ref.label (case-insensitive)
 * +1 if size bucket (from bounds) matches ref.size
 * +1 if shape's spatial zone matches ref.spatial
 *
 * Shapes with score 0 are excluded.  If 2+ shapes tie at the top score,
 * `{ kind: 'ambiguous', candidates: [...] }` is returned.
 */
export function resolveShapeReference(editor: Editor, ref: ShapeRef): ResolveResult {
  const allShapes = editor.getCurrentPageShapes()

  // -- Fast path 1: pure selection passthrough --
  if (ref.useSelection === true && !refHasQualifier({ ...ref, useSelection: false })) {
    const selectedIds = editor.getSelectedShapeIds()
    if (selectedIds.length === 0) return { kind: 'none' }
    return { kind: 'found', ids: selectedIds }
  }

  if (allShapes.length === 0) return { kind: 'none' }

  // -- Fast path 2 / 3: ordinal 'last' / 'latest' / 'first' --
  if (ref.ordinal === 'last' || ref.ordinal === 'latest') {
    const sorted = [...allShapes].sort((a, b) => compareIndex(a.index, b.index))
    const target = sorted[sorted.length - 1]
    return { kind: 'found', ids: [target.id] }
  }

  if (ref.ordinal === 'first') {
    const sorted = [...allShapes].sort((a, b) => compareIndex(a.index, b.index))
    return { kind: 'found', ids: [sorted[0].id] }
  }

  // -- Fast path 4: numeric ordinal (1-based) --
  if (typeof ref.ordinal === 'number') {
    const sorted = [...allShapes].sort((a, b) => compareIndex(a.index, b.index))
    const n = ref.ordinal
    if (n < 1 || n > sorted.length) return { kind: 'none' }
    return { kind: 'found', ids: [sorted[n - 1].id] }
  }

  // -- Fast path 5: single shape on canvas --
  if (allShapes.length === 1 && refHasQualifier(ref)) {
    return { kind: 'found', ids: [allShapes[0].id] }
  }

  // -- Scoring --
  const selectedIdSet = new Set(editor.getSelectedShapeIds())
  const vp = editor.getViewportPageBounds()

  const scored: Array<{ id: TLShapeId; score: number }> = []

  for (const shape of allShapes) {
    let score = 0
    const props = shape.props as Record<string, unknown>

    // +3 shape type
    if (ref.shapeType !== undefined) {
      const { tldrawType, geoVariant } = resolveShapeKind(ref.shapeType)
      if (tldrawType === 'geo') {
        if (shape.type === 'geo' && props['geo'] === geoVariant) score += 3
      } else {
        if (shape.type === tldrawType) score += 3
      }
    }

    // +3 color
    if (ref.color !== undefined) {
      if (props['color'] === ref.color) score += 3
    }

    // +2 selection
    if (ref.useSelection === true) {
      if (selectedIdSet.has(shape.id)) score += 2
    }

    // +2 label (case-insensitive)
    if (ref.label !== undefined) {
      const meta = shape.meta as Record<string, unknown>
      const label = typeof meta['label'] === 'string' ? meta['label'] : ''
      if (label.toLowerCase() === ref.label.toLowerCase()) score += 2
    }

    // +1 size bucket
    if (ref.size !== undefined) {
      const bounds = editor.getShapePageBounds(shape)
      if (bounds) {
        if (sizeBucket(bounds.w, bounds.h) === ref.size) score += 1
      }
    }

    // +1 spatial zone
    if (ref.spatial !== undefined) {
      const bounds = editor.getShapePageBounds(shape)
      if (bounds) {
        const cx = bounds.x + bounds.w / 2
        const cy = bounds.y + bounds.h / 2
        if (spatialZone(cx, cy, vp) === ref.spatial) score += 1
      }
    }

    if (score > 0) {
      scored.push({ id: shape.id, score })
    }
  }

  if (scored.length === 0) return { kind: 'none' }

  const maxScore = Math.max(...scored.map((s) => s.score))
  const top = scored.filter((s) => s.score === maxScore)

  if (top.length === 1) {
    return { kind: 'found', ids: [top[0].id] }
  }

  // 2+ equal-scoring shapes => ambiguous
  return { kind: 'ambiguous', candidates: top.map((s) => s.id) }
}
