/**
 * src/commands/executeTldrawAction.test.ts
 *
 * Unit tests for `executeTldrawAction`.
 *
 * Strategy:
 *  - The tldraw `Editor` is replaced by a minimal mock object whose methods
 *    are vitest spy functions.  No real tldraw canvas is created.
 *  - The mock satisfies only the subset of the Editor API used by the
 *    executor, making each test fast and deterministic.
 *  - Tests assert:
 *      the correct editor method was called
 *      it was called with the right arguments (shape type, props, IDs, ...)
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TLShapeId } from 'tldraw'
import { executeTldrawAction } from './executeTldrawAction'
import type { TldrawAction } from '../types'

// ---------------------------------------------------------------------------
// Mock resolveShapeReference so executor tests are isolated from the resolver
// ---------------------------------------------------------------------------

vi.mock('./resolveShapeReference', () => ({
  resolveShapeReference: vi.fn(),
}))

import { resolveShapeReference } from './resolveShapeReference'
const mockResolveShapeReference = vi.mocked(resolveShapeReference)

// ---------------------------------------------------------------------------
// Editor mock
// ---------------------------------------------------------------------------

const MOCK_VIEWPORT = { x: 0, y: 0, w: 1000, h: 600 }

const MOCK_SHAPE_GEO = {
  id: 'shape:test-geo',
  type: 'geo',
  x: 50,
  y: 50,
  props: { geo: 'rectangle', w: 200, h: 200, color: 'black' },
}

const MOCK_SHAPE_ARROW = {
  id: 'shape:test-arrow',
  type: 'arrow',
  x: 100,
  y: 100,
  props: { color: 'blue' },
}

function makeMockEditor(overrides?: Record<string, unknown>) {
  const mock = {
    createShapes: vi.fn(),
    updateShapes: vi.fn(),
    deleteShapes: vi.fn(),
    rotateShapesBy: vi.fn(),
    resizeShape: vi.fn(),
    selectAll: vi.fn(),
    setSelectedShapes: vi.fn(),
    getSelectedShapeIds: vi.fn().mockReturnValue([]),
    getViewportPageBounds: vi.fn().mockReturnValue(MOCK_VIEWPORT),
    getShape: vi.fn().mockReturnValue(MOCK_SHAPE_GEO),
    getShapePageBounds: vi.fn().mockReturnValue({ x: 50, y: 50, w: 200, h: 200 }),
    getCurrentPageShapes: vi.fn().mockReturnValue([MOCK_SHAPE_GEO, MOCK_SHAPE_ARROW]),
    setStyleForSelectedShapes: vi.fn(),
    setStyleForNextShapes: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  }
  return mock
}

type MockEditor = ReturnType<typeof makeMockEditor>

function run(editor: MockEditor, action: TldrawAction) {
  return executeTldrawAction(editor as never, action)
}

// ---------------------------------------------------------------------------
// CREATE_SHAPE
// ---------------------------------------------------------------------------

describe('CREATE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('creates a geo rectangle at center by default', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle' })

    expect(editor.createShapes).toHaveBeenCalledOnce()
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes).toHaveLength(1)
    expect(shapes[0].type).toBe('geo')
    expect(shapes[0].props.geo).toBe('rectangle')
  })

  it('creates a geo ellipse for shapeType "ellipse"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'ellipse' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('geo')
    expect(shapes[0].props.geo).toBe('ellipse')
  })

  it('creates a geo ellipse for shapeType "circle"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'circle' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('geo')
    expect(shapes[0].props.geo).toBe('ellipse')
  })

  it('creates a geo triangle', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'triangle' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.geo).toBe('triangle')
  })

  it('creates a geo star', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'star' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.geo).toBe('star')
  })

  it('creates an arrow shape for shapeType "arrow"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'arrow' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('arrow')
  })

  it('creates a line shape for shapeType "line"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'line' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('line')
  })

  it('creates a text shape for shapeType "text"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'text' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('text')
  })

  it('creates a frame shape for shapeType "frame"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'frame' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('frame')
  })

  it('forwards color to geo props', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', color: 'red' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.color).toBe('red')
  })

  it('forwards color to arrow props', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'arrow', color: 'blue' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.color).toBe('blue')
  })

  it('uses small size (100 px) for size:"small"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', size: 'small' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(100)
    expect(shapes[0].props.h).toBe(100)
  })

  it('uses medium size (200 px) for size:"medium"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(200)
    expect(shapes[0].props.h).toBe(200)
  })

  it('uses large size (400 px) for size:"large"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'ellipse', size: 'large' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(400)
  })

  it('uses xl size (600 px) for size:"xl"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'ellipse', size: 'xl' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(600)
  })

  it('defaults to medium (200 px) when size is omitted', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(200)
  })

  it('places shape in center of viewport for position:"center"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'center', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    // center of 1000x600 viewport, shape 200x200: x = 500-100 = 400, y = 300-100 = 200
    expect(shapes[0].x).toBe(400)
    expect(shapes[0].y).toBe(200)
  })

  it('places shape in top-left of viewport for position:"top-left"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'top-left', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    // 10% inset: x = 100, y = 60
    expect(shapes[0].x).toBe(100)
    expect(shapes[0].y).toBe(60)
  })

  it('places shape in bottom-right of viewport for position:"bottom-right"', () => {
    run(editor, {
      type: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      position: 'bottom-right',
      size: 'medium',
    })

    const [shapes] = editor.createShapes.mock.calls[0]
    // insetX=100, innerW=800, w=200 -> x=700; insetY=60, innerH=480, h=200 -> y=340
    expect(shapes[0].x).toBe(700)
    expect(shapes[0].y).toBe(340)
  })

  it('places shape at top center for position:"top"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'top', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(400)
    expect(shapes[0].y).toBe(60)
  })

  it('places shape at bottom center for position:"bottom"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'bottom', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(400)
    expect(shapes[0].y).toBe(340)
  })

  it('places shape at left center for position:"left"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'left', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(100)
    expect(shapes[0].y).toBe(200)
  })

  it('places shape at right center for position:"right"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'right', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(700)
    expect(shapes[0].y).toBe(200)
  })

  it('places shape at top-right for position:"top-right"', () => {
    run(editor, { type: 'CREATE_SHAPE', shapeType: 'rectangle', position: 'top-right', size: 'medium' })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(700)
    expect(shapes[0].y).toBe(60)
  })

  it('places shape at bottom-left for position:"bottom-left"', () => {
    run(editor, {
      type: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      position: 'bottom-left',
      size: 'medium',
    })

    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].x).toBe(100)
    expect(shapes[0].y).toBe(340)
  })
})

// ---------------------------------------------------------------------------
// MOVE_SHAPE
// ---------------------------------------------------------------------------

describe('MOVE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue(['shape:test-geo'])
    editor.getShape.mockReturnValue(MOCK_SHAPE_GEO)
    // Default: resolver returns the selected shape
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
  })

  it('applies dx/dy relative to current position', () => {
    run(editor, { type: 'MOVE_SHAPE', dx: 50, dy: -30 })

    expect(editor.updateShapes).toHaveBeenCalledOnce()
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].x).toBe(100) // 50 + 50
    expect(updates[0].y).toBe(20)  // 50 - 30
  })

  it('applies dx only when dy is absent', () => {
    run(editor, { type: 'MOVE_SHAPE', dx: 100 })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].x).toBe(150)
    expect(updates[0].y).toBe(50)
  })

  it('moves to absolute position when position is given', () => {
    run(editor, { type: 'MOVE_SHAPE', position: 'center' })

    const [updates] = editor.updateShapes.mock.calls[0]
    // center of 1000x600 viewport, shape 200x200 -> (400, 200)
    expect(updates[0].x).toBe(400)
    expect(updates[0].y).toBe(200)
  })

  it('uses targetId over selected shapes', () => {
    editor.getShape.mockReturnValue({ ...MOCK_SHAPE_GEO, id: 'shape:specific', x: 0, y: 0 })
    run(editor, { type: 'MOVE_SHAPE', targetId: 'shape:specific', dx: 10, dy: 10 })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].id).toBe('shape:specific')
  })

  it('does nothing when resolver returns none (no matching shape)', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    run(editor, { type: 'MOVE_SHAPE', dx: 50 })

    expect(editor.updateShapes).not.toHaveBeenCalled()
  })

  it('calls resolver with useSelection:true when no shapeReference provided', () => {
    run(editor, { type: 'MOVE_SHAPE', dx: 10 })

    expect(mockResolveShapeReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ useSelection: true }),
    )
  })

  it('calls resolver with shapeReference fields when provided', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
    run(editor, {
      type: 'MOVE_SHAPE',
      dx: 20,
      shapeReference: { shapeType: 'circle', color: 'red' },
    })

    expect(mockResolveShapeReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shapeType: 'circle', color: 'red' }),
    )
    expect(editor.updateShapes).toHaveBeenCalledOnce()
  })

  it('returns NO_SHAPE_MATCH error when resolver returns none', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    const result = run(editor, { type: 'MOVE_SHAPE', dx: 10 })

    expect(result?.code).toBe('NO_SHAPE_MATCH')
    expect(editor.updateShapes).not.toHaveBeenCalled()
  })

  it('moves all candidates and returns AMBIGUOUS_TARGET when resolver is ambiguous', () => {
    const candidateId1 = 'shape:candidate-1'
    const candidateId2 = 'shape:candidate-2'
    mockResolveShapeReference.mockReturnValue({
      kind: 'ambiguous',
      candidates: [candidateId1 as TLShapeId, candidateId2 as TLShapeId],
    })
    editor.getShape.mockImplementation((id: string) => ({
      ...MOCK_SHAPE_GEO,
      id,
      x: 10,
      y: 10,
    }))
    const result = run(editor, { type: 'MOVE_SHAPE', dx: 5 })

    expect(result?.code).toBe('AMBIGUOUS_TARGET')
    expect(editor.updateShapes).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// RESIZE_SHAPE
// ---------------------------------------------------------------------------

describe('RESIZE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue(['shape:test-geo'])
    editor.getShape.mockReturnValue(MOCK_SHAPE_GEO)
    editor.getShapePageBounds.mockReturnValue({ x: 50, y: 50, w: 200, h: 200 })
    // Default: resolver returns the selected shape
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
  })

  it('resizes to named size bucket (large = 400 px)', () => {
    run(editor, { type: 'RESIZE_SHAPE', size: 'large' })

    expect(editor.updateShapes).toHaveBeenCalledOnce()
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(400)
    expect(updates[0].props.h).toBe(400)
  })

  it('resizes to small (100 px)', () => {
    run(editor, { type: 'RESIZE_SHAPE', size: 'small' })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(100)
  })

  it('resizes to medium (200 px)', () => {
    run(editor, { type: 'RESIZE_SHAPE', size: 'medium' })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(200)
  })

  it('resizes by scale factor', () => {
    run(editor, { type: 'RESIZE_SHAPE', factor: 1.5 })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(300) // 200 * 1.5
    expect(updates[0].props.h).toBe(300)
  })

  it('shrinks by scale factor < 1', () => {
    run(editor, { type: 'RESIZE_SHAPE', factor: 0.5 })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(100)
  })

  it('does nothing when neither size nor factor is given', () => {
    run(editor, { type: 'RESIZE_SHAPE' })

    expect(editor.updateShapes).not.toHaveBeenCalled()
    expect(editor.resizeShape).not.toHaveBeenCalled()
  })

  it('falls back to resizeShape() for shapes without w/h props', () => {
    editor.getShape.mockReturnValue({ ...MOCK_SHAPE_ARROW, props: { color: 'blue' } })
    editor.getShapePageBounds.mockReturnValue({ x: 0, y: 0, w: 100, h: 10 })
    run(editor, { type: 'RESIZE_SHAPE', factor: 2 })

    expect(editor.resizeShape).toHaveBeenCalledOnce()
  })

  it('uses targetId over selection', () => {
    editor.getShape.mockReturnValue({ ...MOCK_SHAPE_GEO, id: 'shape:explicit' })
    run(editor, { type: 'RESIZE_SHAPE', targetId: 'shape:explicit', size: 'large' })

    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].id).toBe('shape:explicit')
  })

  it('does nothing when resolver returns none (no matching shape)', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    run(editor, { type: 'RESIZE_SHAPE', size: 'large' })

    expect(editor.updateShapes).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ROTATE_SHAPE
// ---------------------------------------------------------------------------

describe('ROTATE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue(['shape:test-geo'])
    // Default: resolver returns the selected shape
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
  })

  it('rotates by given angle in degrees (converted to radians)', () => {
    run(editor, { type: 'ROTATE_SHAPE', angle: 90 })

    expect(editor.rotateShapesBy).toHaveBeenCalledOnce()
    const [, angleRad] = editor.rotateShapesBy.mock.calls[0]
    expect(angleRad).toBeCloseTo(Math.PI / 2)
  })

  it('defaults to 90 degrees when angle is omitted', () => {
    run(editor, { type: 'ROTATE_SHAPE' })

    const [, angleRad] = editor.rotateShapesBy.mock.calls[0]
    expect(angleRad).toBeCloseTo(Math.PI / 2)
  })

  it('passes the correct shape IDs', () => {
    run(editor, { type: 'ROTATE_SHAPE', targetId: 'shape:abc', angle: 45 })

    const [ids] = editor.rotateShapesBy.mock.calls[0]
    expect(ids).toContain('shape:abc')
  })

  it('does nothing when resolver returns none (no matching shape)', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    run(editor, { type: 'ROTATE_SHAPE', angle: 90 })

    expect(editor.rotateShapesBy).not.toHaveBeenCalled()
  })

  it('calls resolver with shapeReference when provided', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
    run(editor, {
      type: 'ROTATE_SHAPE',
      angle: 45,
      shapeReference: { shapeType: 'rectangle' },
    })

    expect(mockResolveShapeReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shapeType: 'rectangle' }),
    )
    expect(editor.rotateShapesBy).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// DELETE_SHAPE
// ---------------------------------------------------------------------------

describe('DELETE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue(['shape:test-geo'])
    // Default: resolver returns the selected shape
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
  })

  it('deletes the currently selected shapes', () => {
    run(editor, { type: 'DELETE_SHAPE' })

    expect(editor.deleteShapes).toHaveBeenCalledOnce()
    const [ids] = editor.deleteShapes.mock.calls[0]
    expect(ids).toContain('shape:test-geo')
  })

  it('deletes a specific shape by targetId', () => {
    run(editor, { type: 'DELETE_SHAPE', targetId: 'shape:specific' })

    const [ids] = editor.deleteShapes.mock.calls[0]
    expect(ids).toEqual(['shape:specific'])
  })

  it('does nothing when resolver returns none (no matching shape)', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    run(editor, { type: 'DELETE_SHAPE' })

    expect(editor.deleteShapes).not.toHaveBeenCalled()
  })

  it('calls resolver with shapeReference when provided', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
    run(editor, {
      type: 'DELETE_SHAPE',
      shapeReference: { shapeType: 'star' },
    })

    expect(mockResolveShapeReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shapeType: 'star' }),
    )
    expect(editor.deleteShapes).toHaveBeenCalledOnce()
  })

  it('returns NO_SHAPE_MATCH error when resolver returns none', () => {
    mockResolveShapeReference.mockReturnValue({ kind: 'none' })
    const result = run(editor, { type: 'DELETE_SHAPE' })

    expect(result?.code).toBe('NO_SHAPE_MATCH')
  })
})

// ---------------------------------------------------------------------------
// DELETE_ALL
// ---------------------------------------------------------------------------

describe('DELETE_ALL', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue([])
  })

  it('calls selectAll then deleteShapes', () => {
    editor.selectAll.mockImplementation(() => {
      editor.getSelectedShapeIds.mockReturnValue(['shape:a', 'shape:b'])
    })

    run(editor, { type: 'DELETE_ALL' })

    expect(editor.selectAll).toHaveBeenCalledOnce()
    expect(editor.deleteShapes).toHaveBeenCalledOnce()
    const [ids] = editor.deleteShapes.mock.calls[0]
    expect(ids).toEqual(['shape:a', 'shape:b'])
  })

  it('does not call deleteShapes when canvas is already empty', () => {
    // selectAll leaves selection empty
    editor.selectAll.mockImplementation(() => {})
    editor.getSelectedShapeIds.mockReturnValue([])

    run(editor, { type: 'DELETE_ALL' })

    expect(editor.deleteShapes).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// STYLE_SHAPE
// ---------------------------------------------------------------------------

describe('STYLE_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getSelectedShapeIds.mockReturnValue(['shape:test-geo'])
    // Default: resolver returns the selected shape
    mockResolveShapeReference.mockReturnValue({ kind: 'found', ids: ['shape:test-geo' as TLShapeId] })
  })

  it('sets color on selected shapes', () => {
    run(editor, { type: 'STYLE_SHAPE', color: 'red' })

    expect(editor.setStyleForSelectedShapes).toHaveBeenCalledOnce()
    const [, colorValue] = editor.setStyleForSelectedShapes.mock.calls[0]
    expect(colorValue).toBe('red')
  })

  it('also sets color for next shapes', () => {
    run(editor, { type: 'STYLE_SHAPE', color: 'blue' })

    expect(editor.setStyleForNextShapes).toHaveBeenCalledOnce()
    const [, colorValue] = editor.setStyleForNextShapes.mock.calls[0]
    expect(colorValue).toBe('blue')
  })

  it('selects targetId before applying style', () => {
    run(editor, { type: 'STYLE_SHAPE', targetId: 'shape:other', color: 'green' })

    expect(editor.setSelectedShapes).toHaveBeenCalledWith(['shape:other'])
  })

  it('does nothing when color is omitted', () => {
    run(editor, { type: 'STYLE_SHAPE' })

    expect(editor.setStyleForSelectedShapes).not.toHaveBeenCalled()
    expect(editor.setStyleForNextShapes).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SELECT_SHAPE
// ---------------------------------------------------------------------------

describe('SELECT_SHAPE', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
    editor.getCurrentPageShapes.mockReturnValue([MOCK_SHAPE_GEO, MOCK_SHAPE_ARROW])
  })

  it('selects a specific shape by targetId', () => {
    run(editor, { type: 'SELECT_SHAPE', targetId: 'shape:test-geo' })

    expect(editor.setSelectedShapes).toHaveBeenCalledWith(['shape:test-geo'])
  })

  it('selects shapes by type filter (arrow)', () => {
    run(editor, { type: 'SELECT_SHAPE', shapeType: 'arrow' })

    const [ids] = editor.setSelectedShapes.mock.calls[0]
    expect(ids).toContain('shape:test-arrow')
    expect(ids).not.toContain('shape:test-geo')
  })

  it('selects shapes by color filter', () => {
    run(editor, { type: 'SELECT_SHAPE', color: 'blue' })

    const [ids] = editor.setSelectedShapes.mock.calls[0]
    expect(ids).toContain('shape:test-arrow')
    expect(ids).not.toContain('shape:test-geo')
  })

  it('selects shapes matching both type and color filters', () => {
    const blueArrow = { id: 'shape:blue-arrow', type: 'arrow', x: 0, y: 0, props: { color: 'blue' } }
    const redArrow = { id: 'shape:red-arrow', type: 'arrow', x: 0, y: 0, props: { color: 'red' } }
    editor.getCurrentPageShapes.mockReturnValue([blueArrow, redArrow])

    run(editor, { type: 'SELECT_SHAPE', shapeType: 'arrow', color: 'blue' })

    const [ids] = editor.setSelectedShapes.mock.calls[0]
    expect(ids).toContain('shape:blue-arrow')
    expect(ids).not.toContain('shape:red-arrow')
  })

  it('selects shapes by geo type filter (rectangle)', () => {
    run(editor, { type: 'SELECT_SHAPE', shapeType: 'rectangle' })

    const [ids] = editor.setSelectedShapes.mock.calls[0]
    expect(ids).toContain('shape:test-geo')
    expect(ids).not.toContain('shape:test-arrow')
  })

  it('does not call setSelectedShapes when no match is found', () => {
    run(editor, { type: 'SELECT_SHAPE', shapeType: 'text' })

    expect(editor.setSelectedShapes).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SELECT_ALL
// ---------------------------------------------------------------------------

describe('SELECT_ALL', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('calls editor.selectAll()', () => {
    run(editor, { type: 'SELECT_ALL' })

    expect(editor.selectAll).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// DESELECT
// ---------------------------------------------------------------------------

describe('DESELECT', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('calls setSelectedShapes with empty array', () => {
    run(editor, { type: 'DESELECT' })

    expect(editor.setSelectedShapes).toHaveBeenCalledWith([])
  })
})

// ---------------------------------------------------------------------------
// UNDO
// ---------------------------------------------------------------------------

describe('UNDO', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('calls editor.undo() once by default', () => {
    run(editor, { type: 'UNDO' })

    expect(editor.undo).toHaveBeenCalledOnce()
  })

  it('calls editor.undo() N times for steps:N', () => {
    run(editor, { type: 'UNDO', steps: 3 })

    expect(editor.undo).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// REDO
// ---------------------------------------------------------------------------

describe('REDO', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('calls editor.redo() once by default', () => {
    run(editor, { type: 'REDO' })

    expect(editor.redo).toHaveBeenCalledOnce()
  })

  it('calls editor.redo() N times for steps:N', () => {
    run(editor, { type: 'REDO', steps: 2 })

    expect(editor.redo).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Animation-layer passthrough (should be no-ops)
// ---------------------------------------------------------------------------

describe('Animation-layer passthrough actions', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  it('RECORD_KEYFRAME is a no-op', () => {
    expect(() => run(editor, { type: 'RECORD_KEYFRAME' })).not.toThrow()
    expect(editor.createShapes).not.toHaveBeenCalled()
  })

  it('PLAY is a no-op', () => {
    expect(() => run(editor, { type: 'PLAY' })).not.toThrow()
  })

  it('PAUSE is a no-op', () => {
    expect(() => run(editor, { type: 'PAUSE' })).not.toThrow()
  })

  it('STOP is a no-op', () => {
    expect(() => run(editor, { type: 'STOP' })).not.toThrow()
  })

  it('SEEK is a no-op', () => {
    expect(() => run(editor, { type: 'SEEK', timestamp: 0 })).not.toThrow()
  })
})
