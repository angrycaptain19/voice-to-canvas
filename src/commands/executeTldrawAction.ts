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
  createShapeId,
  toRichText,
} from 'tldraw'

import type { ShapeColor, ShapePosition, ShapeSize, ShapeType, TldrawAction } from '../types'

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

function resolveTargetIds(editor: Editor, targetId?: string): TLShapeId[] {
  if (targetId) return [targetId as TLShapeId]
  return editor.getSelectedShapeIds()
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export function executeTldrawAction(editor: Editor, action: TldrawAction): void {
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
      return handleDeleteAll(editor)

    case 'STYLE_SHAPE':
      return handleStyleShape(editor, action)

    case 'SELECT_SHAPE':
      return handleSelectShape(editor, action)

    case 'SELECT_ALL':
      editor.selectAll()
      return

    case 'DESELECT':
      editor.setSelectedShapes([])
      return

    case 'UNDO': {
      const steps = action.steps ?? 1
      for (let i = 0; i < steps; i++) editor.undo()
      return
    }

    case 'REDO': {
      const steps = action.steps ?? 1
      for (let i = 0; i < steps; i++) editor.redo()
      return
    }

    case 'RECORD_KEYFRAME':
    case 'PLAY':
    case 'PAUSE':
    case 'STOP':
    case 'SEEK':
      return

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
): void {
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
): void {
  const ids = resolveTargetIds(editor, action.targetId)
  if (ids.length === 0) return

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
}

function handleResizeShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'RESIZE_SHAPE' }>,
): void {
  const ids = resolveTargetIds(editor, action.targetId)
  if (ids.length === 0) return

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
}

function handleRotateShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'ROTATE_SHAPE' }>,
): void {
  const ids = resolveTargetIds(editor, action.targetId)
  if (ids.length === 0) return

  const angleDeg = action.angle ?? 90
  const angleRad = (angleDeg * Math.PI) / 180

  editor.rotateShapesBy(ids, angleRad)
}

function handleDeleteShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'DELETE_SHAPE' }>,
): void {
  const ids = resolveTargetIds(editor, action.targetId)
  if (ids.length === 0) return
  editor.deleteShapes(ids)
}

function handleDeleteAll(editor: Editor): void {
  editor.selectAll()
  const ids = editor.getSelectedShapeIds()
  if (ids.length > 0) editor.deleteShapes(ids)
}

function handleStyleShape(
  editor: Editor,
  action: Extract<TldrawAction, { type: 'STYLE_SHAPE' }>,
): void {
  if (!action.color) return

  const tldrawColor = toTldrawColor(action.color)
  const ids = resolveTargetIds(editor, action.targetId)

  if (ids.length > 0) {
    editor.setSelectedShapes(ids)
    editor.setStyleForSelectedShapes(DefaultColorStyle, tldrawColor as never)
  }

  editor.setStyleForNextShapes(DefaultColorStyle, tldrawColor as never)
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
