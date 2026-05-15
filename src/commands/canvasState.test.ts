/**
 * src/commands/canvasState.test.ts
 *
 * Unit tests for `serializeCanvasState` and `formatCanvasStateForPrompt`.
 *
 * Strategy:
 *  - A minimal mock Editor is constructed for each test.  The mock exposes
 *    only the four API methods used by the serialiser:
 *      • getCurrentPageShapes()
 *      • getSelectedShapeIds()
 *      • getViewportPageBounds()
 *      • getShapePageBounds(shape)
 *  - Shapes are plain objects whose structure matches the tiny TLShape subset
 *    that the serialiser inspects.
 *  - No real tldraw canvas is instantiated.
 *
 * @module
 */

import { describe, expect, it, vi } from 'vitest'
import { serializeCanvasState, formatCanvasStateForPrompt } from './canvasState'
import type { CanvasStateSnapshot } from './canvasState'

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

interface MockShape {
  id: string
  type: string
  index: string
  opacity: number
  props: Record<string, unknown>
  meta: Record<string, unknown>
}

const DEFAULT_VIEWPORT = { x: 0, y: 0, w: 1200, h: 800 }
const DEFAULT_BOUNDS = { x: 0, y: 0, w: 200, h: 200 }

function makeMockEditor(
  shapes: MockShape[],
  options: {
    selectedIds?: string[]
    bounds?: Record<string, { x: number; y: number; w: number; h: number }>
    viewport?: { x: number; y: number; w: number; h: number }
  } = {},
) {
  const selectedIds = options.selectedIds ?? []
  const boundsMap = options.bounds ?? {}
  const vp = options.viewport ?? DEFAULT_VIEWPORT

  return {
    getCurrentPageShapes: vi.fn().mockReturnValue(shapes),
    getSelectedShapeIds: vi.fn().mockReturnValue(selectedIds),
    getViewportPageBounds: vi.fn().mockReturnValue(vp),
    getShapePageBounds: vi.fn((shape: MockShape) => boundsMap[shape.id] ?? DEFAULT_BOUNDS),
  }
}

// ---------------------------------------------------------------------------
// Shape factory helpers
// ---------------------------------------------------------------------------

let _idCounter = 0
function makeId(): string {
  return `shape:test${++_idCounter}`
}

function geoShape(
  id: string,
  geo: string,
  overrides: Partial<{
    color: string
    fill: string
    dash: string
    opacity: number
    label: string
    index: string
  }> = {},
): MockShape {
  return {
    id,
    type: 'geo',
    index: overrides.index ?? 'a1',
    opacity: overrides.opacity ?? 1,
    props: {
      geo,
      ...(overrides.color !== undefined ? { color: overrides.color } : {}),
      ...(overrides.fill !== undefined ? { fill: overrides.fill } : {}),
      ...(overrides.dash !== undefined ? { dash: overrides.dash } : {}),
    },
    meta: overrides.label !== undefined ? { label: overrides.label } : {},
  }
}

function arrowShape(id: string, color?: string): MockShape {
  return {
    id,
    type: 'arrow',
    index: 'a1',
    opacity: 1,
    props: { ...(color !== undefined ? { color } : {}) },
    meta: {},
  }
}

function textShape(id: string, color?: string): MockShape {
  return {
    id,
    type: 'text',
    index: 'a1',
    opacity: 1,
    props: { ...(color !== undefined ? { color } : {}) },
    meta: {},
  }
}

// keep makeId in use to avoid lint complaints
void makeId

// ---------------------------------------------------------------------------
// serializeCanvasState — empty canvas
// ---------------------------------------------------------------------------

describe('serializeCanvasState — empty canvas', () => {
  it('returns a zero-count snapshot with an empty shapes array', () => {
    const editor = makeMockEditor([])
    const snapshot = serializeCanvasState(editor as never)

    expect(snapshot.shapeCount).toBe(0)
    expect(snapshot.shapes).toHaveLength(0)
  })

  it('computes viewport centre correctly', () => {
    const editor = makeMockEditor([], { viewport: { x: 100, y: 200, w: 800, h: 600 } })
    const snapshot = serializeCanvasState(editor as never)

    expect(snapshot.viewportCenter).toEqual({ x: 500, y: 500 })
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — single geo shape
// ---------------------------------------------------------------------------

describe('serializeCanvasState — single geo shape', () => {
  it('captures id, type, geo, and bounding box', () => {
    const shape = geoShape('shape:abc', 'ellipse', { color: 'red' })
    const bounds = { x: 120, y: 200, w: 80, h: 80 }
    const editor = makeMockEditor([shape], { bounds: { 'shape:abc': bounds } })

    const snapshot = serializeCanvasState(editor as never)

    expect(snapshot.shapeCount).toBe(1)
    const entry = snapshot.shapes[0]
    expect(entry.id).toBe('shape:abc')
    expect(entry.type).toBe('geo')
    expect(entry.geo).toBe('ellipse')
    expect(entry.x).toBe(120)
    expect(entry.y).toBe(200)
    expect(entry.w).toBe(80)
    expect(entry.h).toBe(80)
  })

  it('captures color, fill, and dash props', () => {
    const shape = geoShape('shape:s1', 'rectangle', {
      color: 'blue',
      fill: 'solid',
      dash: 'dashed',
    })
    const editor = makeMockEditor([shape])

    const snapshot = serializeCanvasState(editor as never)
    const entry = snapshot.shapes[0]

    expect(entry.color).toBe('blue')
    expect(entry.fill).toBe('solid')
    expect(entry.dash).toBe('dashed')
  })

  it('omits color/fill/dash when not present on props', () => {
    const shape: MockShape = {
      id: 'shape:bare',
      type: 'geo',
      index: 'a1',
      opacity: 1,
      props: { geo: 'triangle' },
      meta: {},
    }
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry).not.toHaveProperty('color')
    expect(entry).not.toHaveProperty('fill')
    expect(entry).not.toHaveProperty('dash')
  })

  it('omits geo for non-geo shapes', () => {
    const shape = arrowShape('shape:arr', 'green')
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry.type).toBe('arrow')
    expect(entry).not.toHaveProperty('geo')
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — opacity
// ---------------------------------------------------------------------------

describe('serializeCanvasState — opacity', () => {
  it('omits opacity when it equals 1 (the default)', () => {
    const shape = geoShape('shape:o1', 'rectangle', { opacity: 1 })
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry).not.toHaveProperty('opacity')
  })

  it('includes opacity when it differs from 1', () => {
    const shape = geoShape('shape:o2', 'rectangle', { opacity: 0.5 })
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry.opacity).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — label
// ---------------------------------------------------------------------------

describe('serializeCanvasState — label', () => {
  it('includes label when shape.meta.label is a non-empty string', () => {
    const shape = geoShape('shape:lbl', 'star', { label: 'header' })
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry.label).toBe('header')
  })

  it('omits label when shape.meta.label is empty string', () => {
    const shape: MockShape = {
      id: 'shape:nolbl',
      type: 'geo',
      index: 'a1',
      opacity: 1,
      props: { geo: 'rectangle' },
      meta: { label: '' },
    }
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry).not.toHaveProperty('label')
  })

  it('omits label when shape.meta.label is absent', () => {
    const shape = geoShape('shape:nolbl2', 'rectangle')
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry).not.toHaveProperty('label')
  })

  it('omits label when shape.meta.label is not a string', () => {
    const shape: MockShape = {
      id: 'shape:badlbl',
      type: 'geo',
      index: 'a1',
      opacity: 1,
      props: { geo: 'rectangle' },
      meta: { label: 42 },
    }
    const editor = makeMockEditor([shape])
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry).not.toHaveProperty('label')
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — selection
// ---------------------------------------------------------------------------

describe('serializeCanvasState — selection', () => {
  it('marks selected shapes as selected:true', () => {
    const s1 = geoShape('shape:s1', 'ellipse')
    const s2 = geoShape('shape:s2', 'rectangle')
    const editor = makeMockEditor([s1, s2], { selectedIds: ['shape:s1'] })

    const snapshot = serializeCanvasState(editor as never)
    const e1 = snapshot.shapes.find((e) => e.id === 'shape:s1')!
    const e2 = snapshot.shapes.find((e) => e.id === 'shape:s2')!

    expect(e1.selected).toBe(true)
    expect(e2.selected).toBe(false)
  })

  it('marks all shapes as not selected when selection is empty', () => {
    const s1 = geoShape('shape:ns', 'triangle')
    const editor = makeMockEditor([s1], { selectedIds: [] })
    const entry = serializeCanvasState(editor as never).shapes[0]

    expect(entry.selected).toBe(false)
  })

  it('supports multiple selected shapes', () => {
    const shapes = [
      geoShape('shape:a', 'ellipse'),
      geoShape('shape:b', 'rectangle'),
      geoShape('shape:c', 'star'),
    ]
    const editor = makeMockEditor(shapes, { selectedIds: ['shape:a', 'shape:c'] })

    const snapshot = serializeCanvasState(editor as never)
    const entries = Object.fromEntries(snapshot.shapes.map((e) => [e.id, e.selected]))

    expect(entries['shape:a']).toBe(true)
    expect(entries['shape:b']).toBe(false)
    expect(entries['shape:c']).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — ordering
// ---------------------------------------------------------------------------

describe('serializeCanvasState — shape ordering', () => {
  it('preserves the order returned by getCurrentPageShapes() (creation-first)', () => {
    const id1 = 'shape:first'
    const id2 = 'shape:second'
    const id3 = 'shape:third'
    const shapes = [geoShape(id1, 'ellipse'), geoShape(id2, 'rectangle'), geoShape(id3, 'star')]
    const editor = makeMockEditor(shapes)

    const snapshot = serializeCanvasState(editor as never)

    expect(snapshot.shapes.map((e) => e.id)).toEqual([id1, id2, id3])
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — viewport centre
// ---------------------------------------------------------------------------

describe('serializeCanvasState — viewport centre', () => {
  it('correctly computes viewport centre from bounds', () => {
    const editor = makeMockEditor([], { viewport: { x: 0, y: 0, w: 1000, h: 600 } })
    const snapshot = serializeCanvasState(editor as never)
    expect(snapshot.viewportCenter).toEqual({ x: 500, y: 300 })
  })

  it('handles non-zero viewport origin', () => {
    const editor = makeMockEditor([], { viewport: { x: -400, y: -200, w: 1200, h: 800 } })
    const snapshot = serializeCanvasState(editor as never)
    expect(snapshot.viewportCenter).toEqual({ x: 200, y: 200 })
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — shapes with no bounds are skipped
// ---------------------------------------------------------------------------

describe('serializeCanvasState — shapes without bounds', () => {
  it('skips shapes for which getShapePageBounds returns null', () => {
    const s1 = geoShape('shape:good', 'ellipse')
    const s2 = geoShape('shape:bad', 'rectangle')

    const editor = {
      getCurrentPageShapes: vi.fn().mockReturnValue([s1, s2]),
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
      getViewportPageBounds: vi.fn().mockReturnValue(DEFAULT_VIEWPORT),
      getShapePageBounds: vi.fn((shape: MockShape) =>
        shape.id === 'shape:bad' ? null : DEFAULT_BOUNDS,
      ),
    }

    const snapshot = serializeCanvasState(editor as never)
    expect(snapshot.shapeCount).toBe(1)
    expect(snapshot.shapes[0].id).toBe('shape:good')
  })
})

// ---------------------------------------------------------------------------
// serializeCanvasState — mixed shape types
// ---------------------------------------------------------------------------

describe('serializeCanvasState — mixed shape types', () => {
  it('serialises geo, arrow, and text shapes in one snapshot', () => {
    const shapes = [
      geoShape('shape:g', 'ellipse', { color: 'red', fill: 'solid' }),
      arrowShape('shape:a', 'blue'),
      textShape('shape:t', 'black'),
    ]
    const editor = makeMockEditor(shapes, {
      bounds: {
        'shape:g': { x: 10, y: 20, w: 100, h: 100 },
        'shape:a': { x: 200, y: 50, w: 300, h: 10 },
        'shape:t': { x: 50, y: 300, w: 120, h: 30 },
      },
    })

    const snapshot = serializeCanvasState(editor as never)
    expect(snapshot.shapeCount).toBe(3)
    expect(snapshot.shapes[0].type).toBe('geo')
    expect(snapshot.shapes[1].type).toBe('arrow')
    expect(snapshot.shapes[2].type).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// formatCanvasStateForPrompt — empty canvas
// ---------------------------------------------------------------------------

describe('formatCanvasStateForPrompt — empty canvas', () => {
  it('returns "Canvas is empty." for a zero-shape snapshot', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 0,
      shapes: [],
      viewportCenter: { x: 600, y: 400 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).toBe('Canvas is empty.')
  })
})

// ---------------------------------------------------------------------------
// formatCanvasStateForPrompt — single shape
// ---------------------------------------------------------------------------

describe('formatCanvasStateForPrompt — single shape', () => {
  it('uses singular "shape" in the header for one shape', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        {
          id: 'shape:abc',
          type: 'geo',
          geo: 'ellipse',
          color: 'red',
          fill: 'solid',
          x: 120,
          y: 200,
          w: 80,
          h: 80,
          selected: false,
        },
      ],
      viewportCenter: { x: 600, y: 400 },
    }

    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('Canvas has 1 shape:')
  })

  it('includes geo/variant notation', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        {
          id: 'shape:abc',
          type: 'geo',
          geo: 'ellipse',
          color: 'red',
          fill: 'solid',
          x: 120,
          y: 200,
          w: 80,
          h: 80,
          selected: false,
        },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('geo/ellipse')
  })

  it('formats dimensions and position correctly', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        {
          id: 'shape:abc',
          type: 'geo',
          geo: 'ellipse',
          color: 'red',
          x: 120,
          y: 200,
          w: 80,
          h: 80,
          selected: false,
        },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('at (120,200)')
  })

  it('does NOT append [SELECTED] for unselected shapes', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:x', type: 'geo', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100, selected: false },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).not.toContain('[SELECTED]')
  })

  it('appends [SELECTED] for selected shapes', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:sel', type: 'geo', geo: 'rectangle', x: 0, y: 0, w: 100, h: 100, selected: true },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).toContain('[SELECTED]')
  })
})

// ---------------------------------------------------------------------------
// formatCanvasStateForPrompt — multiple shapes
// ---------------------------------------------------------------------------

describe('formatCanvasStateForPrompt — multiple shapes', () => {
  it('uses plural "shapes" in the header', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 2,
      shapes: [
        { id: 'shape:a', type: 'geo', geo: 'ellipse', x: 0, y: 0, w: 80, h: 80, selected: false },
        { id: 'shape:b', type: 'geo', geo: 'rectangle', x: 100, y: 100, w: 200, h: 100, selected: false },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).toContain('Canvas has 2 shapes:')
  })

  it('includes a bullet line for each shape', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 3,
      shapes: [
        { id: 'shape:abc', type: 'geo', geo: 'ellipse', color: 'red', fill: 'solid', x: 120, y: 200, w: 80, h: 80, selected: true },
        { id: 'shape:def', type: 'geo', geo: 'rectangle', color: 'blue', x: 400, y: 150, w: 200, h: 100, selected: false },
        { id: 'shape:ghi', type: 'geo', geo: 'star', x: 300, y: 300, w: 60, h: 60, selected: false, label: 'header' },
      ],
      viewportCenter: { x: 600, y: 400 },
    }

    const output = formatCanvasStateForPrompt(snapshot)
    const lines = output.split('\n')

    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Canvas has 3 shapes:')
    expect(lines[1]).toContain('id:shape:abc')
    expect(lines[1]).toContain('geo/ellipse')
    expect(lines[1]).toContain('color:red')
    expect(lines[1]).toContain('fill:solid')
    expect(lines[1]).toContain('[SELECTED]')
    expect(lines[2]).toContain('id:shape:def')
    expect(lines[2]).toContain('geo/rectangle')
    expect(lines[2]).toContain('color:blue')
    expect(lines[2]).not.toContain('[SELECTED]')
    expect(lines[3]).toContain('id:shape:ghi')
    expect(lines[3]).toContain('geo/star')
    expect(lines[3]).toContain('label:"header"')
  })
})

// ---------------------------------------------------------------------------
// formatCanvasStateForPrompt — non-geo shapes
// ---------------------------------------------------------------------------

describe('formatCanvasStateForPrompt — non-geo shapes', () => {
  it('formats arrow type without geo/ prefix', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:arr', type: 'arrow', color: 'green', x: 0, y: 0, w: 200, h: 10, selected: false },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('arrow')
    expect(output).not.toContain('geo/')
  })

  it('formats text type without geo/ prefix', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:txt', type: 'text', x: 0, y: 0, w: 100, h: 30, selected: false },
      ],
      viewportCenter: { x: 600, y: 400 },
    }
    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('text')
    expect(output).not.toContain('geo/')
  })
})

// ---------------------------------------------------------------------------
// formatCanvasStateForPrompt — opacity and dash
// ---------------------------------------------------------------------------

describe('formatCanvasStateForPrompt — optional style fields', () => {
  it('includes opacity when present', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:op', type: 'geo', geo: 'rectangle', opacity: 0.5, x: 0, y: 0, w: 100, h: 100, selected: false },
      ],
      viewportCenter: { x: 0, y: 0 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).toContain('opacity:0.5')
  })

  it('includes dash when present', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:da', type: 'geo', geo: 'rectangle', dash: 'dotted', x: 0, y: 0, w: 100, h: 100, selected: false },
      ],
      viewportCenter: { x: 0, y: 0 },
    }
    expect(formatCanvasStateForPrompt(snapshot)).toContain('dash:dotted')
  })

  it('rounds fractional dimensions and positions', () => {
    const snapshot: CanvasStateSnapshot = {
      shapeCount: 1,
      shapes: [
        { id: 'shape:fr', type: 'geo', geo: 'rectangle', x: 10.6, y: 20.4, w: 80.7, h: 80.3, selected: false },
      ],
      viewportCenter: { x: 0, y: 0 },
    }
    const output = formatCanvasStateForPrompt(snapshot)
    expect(output).toContain('at (11,20)')
  })
})
