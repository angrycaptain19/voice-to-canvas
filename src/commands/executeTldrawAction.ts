/**
 * src/commands/executeTldrawAction.ts
 *
 * Applies a structured `TldrawAction` to a live tldraw `Editor` instance.
 *
 * ## Supported action types
 *
 * | Action type    | tldraw API calls used                                           |
 * |----------------|------------------------------------------------------------------|
 * | CREATE_SHAPE   | editor.createShapes()                                           |
 * | MOVE_SHAPE     | editor.updateShapes() — absolute position or relative delta     |
 * | RESIZE_SHAPE   | editor.updateShapes() — named size bucket or scale factor       |
 * | ROTATE_SHAPE   | editor.rotateShapesBy()                                         |
 * | DELETE_SHAPE   | editor.deleteShapes()                                           |
 * | DELETE_ALL     | editor.selectAll() + editor.deleteShapes()                      |
 * | STYLE_SHAPE    | editor.setStyleForSelectedShapes() + setStyleForNextShapes()    |
 * | SELECT_SHAPE   | editor.setSelectedShapes()                                      |
 * | SELECT_ALL     | editor.selectAll()                                              |
 * | DESELECT       | editor.setSelectedShapes([])                                    |
 * | UNDO           | editor.undo()  (repeated for multi-step)                        |
 * | REDO           | editor.redo()  (repeated for multi-step)                        |
 *
 * @module
 */

import {
  type Editor,
  type TLShapeId,
  DefaultColorStyle,
  DefaultFillStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  createShapeId,
  toRichText,
} from 'tldraw'

import type { ShapeColor, ShapePosition, ShapeSize, ShapeType, TldrawAction, ShapeReference } from '../types'
import { resolveShapeReference } from './resolveShapeReference'
import type { ShapeRef } from './resolveShapeReference'
import { createVoiceError } from '../voice/errors'
import type { VoiceError } from '../voice/errors'

// ---------------------------------------------------------------------------
// Size constants
// ---------------------------------------------------------------------------

const SIZE_PX: Record<ShapeSize, number> = {
  small: 100,
  medium: 200,
  large: 400,
  xl: 600,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function toTldrawColor(color: ShapeColor): string {
  return color
}

function resolvePosition(
  editor: Editor,
  position: ShapePosition,
  shapeW: number,
  shapeH: number,
): { x: number; y: number } {
  const vp = editor.getViewportPageBounds()
  const insetX = vp.w * 0.1
  const insetY = vp.h * 0.1
  const innerW = vp.w - 2 * insetX
  const innerH = vp.h - 2 * insetY

  switch (position) {
    case 'center':
      return { x: vp.x + vp.w / 2 - shapeW / 2, y: vp.y + vp.h / 2 - shapeH / 2 }
    case 'top':
      return { x: vp.x + vp.w / 2 - shapeW / 2, y: vp.y + insetY }
    case 'bottom':
      return { x: vp.x + vp.w / 2 - shapeW / 2, y: vp.y + insetY + innerH - shapeH }
    case 'left':
      return { x: vp.x + insetX, y: vp.y + vp.h / 2 - shapeH / 2 }
    case 'right':
      return { x: vp.x + insetX + innerW - shapeW, y: vp.y + vp.h / 2 - shapeH / 2 }
    case 'top-left':
      return { x: vp.x + insetX, y: vp.y + insetY }
    case 'top-right':
      return { x: vp.x + insetX + innerW - shapeW, y: vp.y + insetY }
    case 'bottom-left':
      return { x: vp.x + insetX, y: vp.y + insetY + innerH - shapeH }
    case 'bottom-right':
      return { x: vp.x + insetX + innerW - shapeW, y: vp.y + insetY + innerH - shapeH }
    default: {
      void (position as never)
      return { x: vp.x + vp.w / 2 - shapeW / 2, y: vp.y + vp.h / 2 - shapeH / 2 }
    }
  }
}

/**
 * Build a ShapeRef from an action's shapeReference field, falling back to
 * selection-based targeting when no shapeReference is present.
 *
 * When there is no shapeReference AND no explicit ID:
 *  - If something is currently selected → use the selection (existing behaviour)
 *  - If nothing is selected             → fall back to the most recently created
 *    shape (`ordinal: 'last'`) so that commands like "move to the top" with an
 *    empty selection still work on the last-drawn shape instead of silently
 *    no-oping.
 */
function buildShapeRef(
  shapeReference: ShapeReference | undefined,
  explicitTargetId: string | undefined,
  editor: Editor,
): ShapeRef {
  if (explicitTargetId) {
    // Explicit programmatic ID — we'll handle it before calling the resolver
    return {}
  }
  if (shapeReference) {
    return {
      shapeType: shapeReference.shapeType,
      color: shapeReference.color,
      size: shapeReference.size,
      ordinal: shapeReference.ordinal,
      label: shapeReference.label,
      spatial: shapeReference.spatial,
      useSelection: shapeReference.useSelection,
    }
  }
  // No shapeReference and no explicit ID — prefer the current selection, but
  // if nothing is selected fall back to the most-recently-created shape.
  const selected = editor.getSelectedShapeIds()
  if (selected.length > 0) return { useSelection: true }
  return { ordinal: 'last' }
}

/**
 * Resolve a shape action's target IDs using the resolver, with a hard
 * explicit-targetId fast path for programmatic callers.
 *
 * Returns the resolved IDs (may be empty if kind === 'none') **and** an
 * optional VoiceError to surface to the user when resolution fails or is
 * ambiguous.
 */
function resolveTargetIds(
  editor: Editor,
  shapeReference: ShapeReference | undefined,
  explicitTargetId: string | undefined,
): { ids: TLShapeId[]; error?: VoiceError } {
  // 1. Explicit ID always wins (programmatic callers)
  if (explicitTargetId) {
    return { ids: [explicitTargetId as TLShapeId] }
  }

  const ref = buildShapeRef(shapeReference, explicitTargetId, editor)
  const result = resolveShapeReference(editor, ref)

  if (result.kind === 'found') {
    return { ids: result.ids }
  }

  if (result.kind === 'ambiguous') {
    // Operate on all ambiguous candidates and surface a toast
    const error = createVoiceError('AMBIGUOUS_TARGET')
    return { ids: result.candidates, error }
  }

  // result.kind === 'none' — nothing matched
  const error = createVoiceError('NO_SHAPE_MATCH')
  return { ids: [], error }
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export function executeTldrawAction(editor: Editor, action: TldrawAction): VoiceError | undefined {
  switch (action.type) {
    case 'CREATE_SHAPE':
      return handleCreateShape(editor, action)

    case 'MOVE_SHAPE':
      return handleMoveShape(editor, action)

    case 'RESIZE_SHAPE':
      return handleResizeShape(editor, action)

    case 'ROTATE_SHAPE':
      return handleRotateShape(editor, action)

    case 'DELETE_SHAPE':
      return handleDeleteShape(editor, action)

    case 'DELETE_ALL':
      handleDeleteAll(editor)
      return undefined

    case 'STYLE_SHAPE':
      return handleStyleShape(editor, action)

    case 'SELECT_SHAPE':
      handleSelectShape(editor, action)
      return undefined

    case 'SELECT_ALL':
      editor.selectAll()
      return undefined

    case 'DESELECT':
      editor.setSelectedShapes([])
      return undefined

    case 'UNDO': {
      const steps = action.steps ?? 1
      for (let i = 0; i < steps; i++) editor.undo()
      return undefined
    }

    case 'REDO': {
      const steps = action.steps ?? 1
      for (let i = 0; i < steps; i++) editor.redo()
      return undefined
    }

    case 'RECORD_KEYFRAME':
    case 'PLAY':
    case 'PAUSE':
    case 'STOP':
    case 'SEEK':
      return undefined

    default: {
      void (action as never)
    }
  }
}

// ---------------------------------------------------------------------------
// Action handlers (private)
// ---------------------------------------------------------------------------

function handleCreateShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'CREATE_SHAPE' }>,
): undefined {
  const size = action.size ?? 'medium'
  const w = SIZE_PX[size]
  const h = SIZE_PX[size]

  const pos = action.position
    ? resolvePosition(editor, action.position, w, h)
    : resolvePosition(editor, 'center', w, h)

  const id = createShapeId()
  const { tldrawType, geoVariant } = resolveShapeKind(action.shapeType)

  if (tldrawType === 'arrow') {
    editor.createShapes([
      {
        id,
        type: 'arrow',
        x: pos.x,
        y: pos.y + h / 2,
        props: {
          start: { x: 0, y: 0 },
          end: { x: w * 2, y: 0 },
          ...(action.color ? { color: toTldrawColor(action.color) } : {}),
        },
      },
    ])
  } else if (tldrawType === 'line') {
    editor.createShapes([
      {
        id,
        type: 'line',
        x: pos.x,
        y: pos.y + h / 2,
        props: {
          points: {
            a1: { id: 'a1', index: 'a1' as const, x: 0, y: 0 },
            a2: { id: 'a2', index: 'a2' as const, x: w, y: 0 },
          },
          ...(action.color ? { color: toTldrawColor(action.color) } : {}),
        },
      },
    ])
  } else if (tldrawType === 'text') {
    editor.createShapes([
      {
        id,
        type: 'text',
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText('Text'),
          ...(action.color ? { color: toTldrawColor(action.color) } : {}),
        },
      },
    ])
  } else if (tldrawType === 'frame') {
    editor.createShapes([
      {
        id,
        type: 'frame',
        x: pos.x,
        y: pos.y,
        props: { w, h },
      },
    ])
  } else {
    // geo shapes
    editor.createShapes([
      {
        id,
        type: 'geo',
        x: pos.x,
        y: pos.y,
        props: {
          geo: geoVariant as string,
          w,
          h,
          ...(action.color ? { color: toTldrawColor(action.color) } : {}),
        },
      },
    ])
  }
}

function handleMoveShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'MOVE_SHAPE' }>,
): VoiceError | undefined {
  const { ids, error } = resolveTargetIds(editor, action.shapeReference, action.targetId)
  if (ids.length === 0) return error

  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!shape) continue

    let newX = shape.x
    let newY = shape.y

    if (action.dx !== undefined) newX += action.dx
    if (action.dy !== undefined) newY += action.dy

    if (action.position) {
      const bounds = editor.getShapePageBounds(shape)
      const shapeW = bounds?.w ?? 200
      const shapeH = bounds?.h ?? 200
      const pos = resolvePosition(editor, action.position, shapeW, shapeH)
      newX = pos.x
      newY = pos.y
    }

    editor.updateShapes([{ id, type: shape.type, x: newX, y: newY }])
  }
  return error
}

function handleResizeShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'RESIZE_SHAPE' }>,
): VoiceError | undefined {
  const { ids, error } = resolveTargetIds(editor, action.shapeReference, action.targetId)
  if (ids.length === 0) return error

  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!shape) continue

    const bounds = editor.getShapePageBounds(shape)
    if (!bounds) continue

    let newW: number
    let newH: number

    if (action.size) {
      newW = SIZE_PX[action.size]
      newH = SIZE_PX[action.size]
    } else if (action.factor !== undefined) {
      newW = bounds.w * action.factor
      newH = bounds.h * action.factor
    } else {
      continue
    }

    const props = shape.props as Record<string, unknown>
    if ('w' in props && 'h' in props) {
      editor.updateShapes([{ id, type: shape.type, props: { w: newW, h: newH } }])
    } else {
      editor.resizeShape(id, { x: newW / bounds.w, y: newH / bounds.h })
    }
  }
  return error
}

function handleRotateShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'ROTATE_SHAPE' }>,
): VoiceError | undefined {
  const { ids, error } = resolveTargetIds(editor, action.shapeReference, action.targetId)
  if (ids.length === 0) return error

  const angleDeg = action.angle ?? 90
  const angleRad = (angleDeg * Math.PI) / 180

  editor.rotateShapesBy(ids, angleRad)
  return error
}

function handleDeleteShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'DELETE_SHAPE' }>,
): VoiceError | undefined {
  const { ids, error } = resolveTargetIds(editor, action.shapeReference, action.targetId)
  if (ids.length === 0) return error
  editor.deleteShapes(ids)
  return error
}

function handleDeleteAll(editor: Editor): void {
  editor.selectAll()
  const ids = editor.getSelectedShapeIds()
  if (ids.length > 0) editor.deleteShapes(ids)
}

function handleStyleShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'STYLE_SHAPE' }>,
): VoiceError | undefined {
  const hasAnyStyle =
    action.color !== undefined ||
    action.fill !== undefined ||
    action.dash !== undefined ||
    action.opacity !== undefined ||
    action.labelSize !== undefined

  if (!hasAnyStyle) return undefined

  const { ids, error } = resolveTargetIds(editor, action.shapeReference, action.targetId)

  if (ids.length > 0) {
    editor.setSelectedShapes(ids)
  }

  if (action.color !== undefined) {
    const tldrawColor = toTldrawColor(action.color)
    if (ids.length > 0) editor.setStyleForSelectedShapes(DefaultColorStyle, tldrawColor as never)
    editor.setStyleForNextShapes(DefaultColorStyle, tldrawColor as never)
  }

  if (action.fill !== undefined) {
    if (ids.length > 0) editor.setStyleForSelectedShapes(DefaultFillStyle, action.fill as never)
    editor.setStyleForNextShapes(DefaultFillStyle, action.fill as never)
  }

  if (action.dash !== undefined) {
    if (ids.length > 0) editor.setStyleForSelectedShapes(DefaultDashStyle, action.dash as never)
    editor.setStyleForNextShapes(DefaultDashStyle, action.dash as never)
  }

  if (action.labelSize !== undefined) {
    if (ids.length > 0) editor.setStyleForSelectedShapes(DefaultSizeStyle, action.labelSize as never)
    editor.setStyleForNextShapes(DefaultSizeStyle, action.labelSize as never)
  }

  if (action.opacity !== undefined) {
    if (ids.length > 0) editor.setOpacityForSelectedShapes(action.opacity)
    editor.setOpacityForNextShapes(action.opacity)
  }

  return error
}

function handleSelectShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'SELECT_SHAPE' }>,
): void {
  if (action.targetId) {
    editor.setSelectedShapes([action.targetId as TLShapeId])
    return
  }

  const allShapes = editor.getCurrentPageShapes()
  const matches = allShapes.filter((shape) => {
    if (action.shapeType) {
      const { tldrawType, geoVariant } = resolveShapeKind(action.shapeType)
      if (tldrawType === 'geo') {
        if (shape.type !== 'geo') return false
        if (geoVariant) {
          const props = shape.props as Record<string, unknown>
          if (props['geo'] !== geoVariant) return false
        }
      } else {
        if (shape.type !== tldrawType) return false
      }
    }
    if (action.color) {
      const props = shape.props as Record<string, unknown>
      if (props['color'] !== toTldrawColor(action.color)) return false
    }
    return true
  })

  if (matches.length > 0) {
    editor.setSelectedShapes(matches.map((s) => s.id))
  }
}
