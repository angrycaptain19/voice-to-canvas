/**
 * src/commands/resolveShapeReference.test.ts
 *
 * Unit tests for `resolveShapeReference`.
 *
 * Strategy:
 *  - The tldraw `Editor` is replaced by a minimal mock whose methods are
 *    vitest spy functions.  No real tldraw canvas is required.
 *  - Shapes are represented as plain objects that satisfy the tiny subset of
 *    the `TLShape` interface accessed by the resolver.
 *  - `getShapePageBounds` is configured per-shape in each test that needs it.
 *
 * @module
 */

import { describe, expect, it, vi } from 'vitest'
import { resolveShapeReference } from './resolveShapeReference'
import type { ShapeRef } from './resolveShapeReference'

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

interface MockShape {
  id: string
  type: string
  index: string
  props: Record<string, unknown>
  meta: Record<string, unknown>
}

const MOCK_VIEWPORT = { x: 0, y: 0, w: 900, h: 600 }

function makeMockEditor(
  shapes: MockShape[],
  options: {
    selectedIds?: string[]
    bounds?: Record<string, { x: number; y: number; w: number; h: number }>
    viewport?: { x: number; y: number; w: number; h: number }
  } = {},
) {
  const selectedIds = options.selectedIds ?? []
  const bounds = options.bounds ?? {}
  const vp = options.viewport ?? MOCK_VIEWPORT

  function getBounds(shape: MockShape) {
    return bounds[shape.id] ?? { x: 0, y: 0, w: 200, h: 200 }
  }

  const editor = {
    getCurrentPageShapes: vi.fn().mockReturnValue(shapes),
    getSelectedShapeIds: vi.fn().mockReturnValue(selectedIds),
    getViewportPageBounds: vi.fn().mockReturnValue(vp),
    getShapePageBounds: vi.fn((shape: MockShape) => getBounds(shape)),
  }

  return editor
}

type MockEditor = ReturnType<typeof makeMockEditor>

function resolve(editor: MockEditor, ref: ShapeRef) {
  return resolveShapeReference(editor as never, ref)
}

// ---------------------------------------------------------------------------
// Shape factory helpers
// ---------------------------------------------------------------------------

function geoShape(
  id: string,
  geo: string,
  color: string = 'black',
  index: string = 'a1',
  meta: Record<string, unknown> = {},
): MockShape {
  return { id, type: 'geo', index, props: { geo, color }, meta }
}

function arrowShape(
  id: string,
  color: string = 'black',
  index: string = 'a1',
): MockShape {
  return { id, type: 'arrow', index, props: { color }, meta: {} }
}

// ---------------------------------------------------------------------------
// Empty canvas
// ---------------------------------------------------------------------------

describe('empty canvas', () => {
  it('returns none when no shapes exist', () => {
    const editor = makeMockEditor([])
    expect(resolve(editor, { shapeType: 'circle' })).toEqual({ kind: 'none' })
  })
})

// ---------------------------------------------------------------------------
// useSelection passthrough
// ---------------------------------------------------------------------------

describe('useSelection passthrough', () => {
  it('returns selected IDs when useSelection is the only qualifier', () => {
    const shapes = [geoShape('s1', 'ellipse'), geoShape('s2', 'rectangle')]
    const editor = makeMockEditor(shapes, { selectedIds: ['s1'] })

    const result = resolve(editor, { useSelection: true })
    expect(result).toEqual({ kind: 'found', ids: ['s1'] })
  })

  it('returns none when useSelection=true but nothing is selected', () => {
    const shapes = [geoShape('s1', 'ellipse')]
    const editor = makeMockEditor(shapes, { selectedIds: [] })

    expect(resolve(editor, { useSelection: true })).toEqual({ kind: 'none' })
  })

  it('does NOT take the passthrough when useSelection is combined with shapeType', () => {
    const circle = geoShape('s1', 'ellipse', 'red', 'a1')
    const rect = geoShape('s2', 'rectangle', 'blue', 'a2')
    const editor = makeMockEditor([circle, rect], { selectedIds: ['s2'] })

    // useSelection=true + shapeType='circle' -> scoring, not pure passthrough
    const result = resolve(editor, { useSelection: true, shapeType: 'circle' })
    // circle matches shapeType (+3); rect IS selected (+2)
    // circle score = 3, rect score = 2 -> circle wins
    expect(result).toEqual({ kind: 'found', ids: ['s1'] })
  })
})

// ---------------------------------------------------------------------------
// Ordinal: last / latest
// ---------------------------------------------------------------------------

describe('ordinal: last / latest', () => {
  const shapes = [
    geoShape('oldest', 'rectangle', 'black', 'a1'),
    geoShape('middle', 'ellipse', 'red', 'a2'),
    geoShape('newest', 'triangle', 'blue', 'a9'),
  ]

  it('returns the most recently created shape for ordinal "last"', () => {
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { ordinal: 'last' })
    expect(result).toEqual({ kind: 'found', ids: ['newest'] })
  })

  it('returns the most recently created shape for ordinal "latest"', () => {
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { ordinal: 'latest' })
    expect(result).toEqual({ kind: 'found', ids: ['newest'] })
  })
})

// ---------------------------------------------------------------------------
// Ordinal: first
// ---------------------------------------------------------------------------

describe('ordinal: first', () => {
  const shapes = [
    geoShape('newest', 'triangle', 'blue', 'a9'),
    geoShape('oldest', 'rectangle', 'black', 'a1'),
    geoShape('middle', 'ellipse', 'red', 'a2'),
  ]

  it('returns the oldest shape for ordinal "first"', () => {
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { ordinal: 'first' })
    expect(result).toEqual({ kind: 'found', ids: ['oldest'] })
  })
})

// ---------------------------------------------------------------------------
// Ordinal: numeric (1-based)
// ---------------------------------------------------------------------------

describe('ordinal: numeric', () => {
  const shapes = [
    geoShape('s3', 'triangle', 'blue', 'a9'),
    geoShape('s1', 'rectangle', 'black', 'a1'),
    geoShape('s2', 'ellipse', 'red', 'a2'),
  ]
  // sorted by index: s1 (a1), s2 (a2), s3 (a9)

  it('returns the 1st shape (ordinal=1)', () => {
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { ordinal: 1 })).toEqual({ kind: 'found', ids: ['s1'] })
  })

  it('returns the 2nd shape (ordinal=2)', () => {
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { ordinal: 2 })).toEqual({ kind: 'found', ids: ['s2'] })
  })

  it('returns the 3rd shape (ordinal=3)', () => {
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { ordinal: 3 })).toEqual({ kind: 'found', ids: ['s3'] })
  })

  it('returns none for ordinal out of range', () => {
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { ordinal: 0 })).toEqual({ kind: 'none' })
    expect(resolve(editor, { ordinal: 4 })).toEqual({ kind: 'none' })
  })
})

// ---------------------------------------------------------------------------
// Single-shape shortcut
// ---------------------------------------------------------------------------

describe('single-shape shortcut', () => {
  it('returns the only shape when any qualifier is set', () => {
    const shapes = [geoShape('only', 'ellipse', 'green', 'a1')]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { shapeType: 'circle' })).toEqual({ kind: 'found', ids: ['only'] })
  })

  it('returns the only shape when color qualifier is set', () => {
    const shapes = [geoShape('only', 'rectangle', 'blue', 'a1')]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { color: 'red' })).toEqual({ kind: 'found', ids: ['only'] })
  })

  it('returns the only shape with spatial qualifier', () => {
    const shapes = [geoShape('only', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { spatial: 'top-left' })).toEqual({ kind: 'found', ids: ['only'] })
  })
})

// ---------------------------------------------------------------------------
// Type matching (scoring +3)
// ---------------------------------------------------------------------------

describe('shapeType scoring', () => {
  it('finds a circle (ellipse) by shapeType', () => {
    const shapes = [
      geoShape('circle', 'ellipse', 'black', 'a1'),
      geoShape('rect', 'rectangle', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'circle' })
    expect(result).toEqual({ kind: 'found', ids: ['circle'] })
  })

  it('finds a rectangle by shapeType', () => {
    const shapes = [
      geoShape('circle', 'ellipse', 'black', 'a1'),
      geoShape('rect', 'rectangle', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'rectangle' })
    expect(result).toEqual({ kind: 'found', ids: ['rect'] })
  })

  it('finds an arrow shape by shapeType', () => {
    const shapes = [
      geoShape('circle', 'ellipse', 'black', 'a1'),
      arrowShape('arrow1', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'arrow' })
    expect(result).toEqual({ kind: 'found', ids: ['arrow1'] })
  })
})

// ---------------------------------------------------------------------------
// Color matching (scoring +3)
// ---------------------------------------------------------------------------

describe('color scoring', () => {
  it('finds the red shape among differently-colored shapes', () => {
    const shapes = [
      geoShape('red', 'ellipse', 'red', 'a1'),
      geoShape('blue', 'ellipse', 'blue', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { color: 'red' })
    expect(result).toEqual({ kind: 'found', ids: ['red'] })
  })

  it('returns none when no shape has the requested color', () => {
    const shapes = [
      geoShape('s1', 'ellipse', 'black', 'a1'),
      geoShape('s2', 'rectangle', 'red', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { color: 'green' })).toEqual({ kind: 'none' })
  })
})

// ---------------------------------------------------------------------------
// Color + type combo (acceptance criterion)
// ---------------------------------------------------------------------------

describe('color + type combo', () => {
  it('finds the red circle when one exists alongside other shapes', () => {
    const shapes = [
      geoShape('red-circle', 'ellipse', 'red', 'a1'),
      geoShape('blue-circle', 'ellipse', 'blue', 'a2'),
      geoShape('red-rect', 'rectangle', 'red', 'a3'),
    ]
    const editor = makeMockEditor(shapes)

    const result = resolve(editor, { shapeType: 'circle', color: 'red' })
    // red-circle: +3 (type) + 3 (color) = 6
    // blue-circle: +3 (type) = 3
    // red-rect: +3 (color) = 3
    expect(result).toEqual({ kind: 'found', ids: ['red-circle'] })
  })

  it('returns ambiguous when two red circles exist', () => {
    const shapes = [
      geoShape('rc1', 'ellipse', 'red', 'a1'),
      geoShape('rc2', 'ellipse', 'red', 'a2'),
    ]
    const editor = makeMockEditor(shapes)

    const result = resolve(editor, { shapeType: 'circle', color: 'red' })
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toContain('rc1')
      expect(result.candidates).toContain('rc2')
    }
  })
})

// ---------------------------------------------------------------------------
// Label matching (scoring +2)
// ---------------------------------------------------------------------------

describe('label matching', () => {
  it('matches a shape by exact label (case-insensitive)', () => {
    const shapes = [
      { ...geoShape('s1', 'rectangle', 'black', 'a1'), meta: { label: 'header box' } },
      { ...geoShape('s2', 'rectangle', 'black', 'a2'), meta: { label: 'footer' } },
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { label: 'header box' })
    expect(result).toEqual({ kind: 'found', ids: ['s1'] })
  })

  it('is case-insensitive for label matching', () => {
    const shapes = [
      { ...geoShape('s1', 'ellipse', 'blue', 'a1'), meta: { label: 'Logo Circle' } },
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { label: 'logo circle' })
    expect(result).toEqual({ kind: 'found', ids: ['s1'] })
  })

  it('returns none when no shape has the given label', () => {
    const shapes = [
      { ...geoShape('s1', 'rectangle', 'black', 'a1'), meta: { label: 'header' } },
      { ...geoShape('s2', 'ellipse', 'blue', 'a2'), meta: { label: 'footer' } },
    ]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { label: 'nonexistent' })).toEqual({ kind: 'none' })
  })
})

// ---------------------------------------------------------------------------
// Size bucket matching (scoring +1)
// ---------------------------------------------------------------------------

describe('size bucket scoring', () => {
  it('prefers the small shape when size is "small"', () => {
    const shapes = [
      geoShape('small', 'rectangle', 'black', 'a1'),
      geoShape('large', 'rectangle', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes, {
      bounds: {
        small: { x: 0, y: 0, w: 100, h: 100 },
        large: { x: 0, y: 0, w: 400, h: 400 },
      },
    })

    const result = resolve(editor, { shapeType: 'rectangle', size: 'small' })
    // small: +3 (type) + 1 (size) = 4
    // large: +3 (type) = 3
    expect(result).toEqual({ kind: 'found', ids: ['small'] })
  })

  it('sizeBucket: area < 150*150 is small', () => {
    const shapes = [geoShape('s', 'ellipse', 'black', 'a1')]
    const editor = makeMockEditor(shapes, { bounds: { s: { x: 0, y: 0, w: 100, h: 100 } } })
    expect(resolve(editor, { size: 'small' })).toEqual({ kind: 'found', ids: ['s'] })
  })

  it('sizeBucket: area < 300*300 is medium', () => {
    const shapes = [geoShape('s', 'ellipse', 'black', 'a1')]
    const editor = makeMockEditor(shapes, { bounds: { s: { x: 0, y: 0, w: 200, h: 200 } } })
    expect(resolve(editor, { size: 'medium' })).toEqual({ kind: 'found', ids: ['s'] })
  })

  it('sizeBucket: area < 500*500 is large', () => {
    const shapes = [geoShape('s', 'ellipse', 'black', 'a1')]
    const editor = makeMockEditor(shapes, { bounds: { s: { x: 0, y: 0, w: 350, h: 350 } } })
    expect(resolve(editor, { size: 'large' })).toEqual({ kind: 'found', ids: ['s'] })
  })

  it('sizeBucket: area >= 500*500 is xl', () => {
    const shapes = [geoShape('s', 'ellipse', 'black', 'a1')]
    const editor = makeMockEditor(shapes, { bounds: { s: { x: 0, y: 0, w: 600, h: 600 } } })
    expect(resolve(editor, { size: 'xl' })).toEqual({ kind: 'found', ids: ['s'] })
  })
})

// ---------------------------------------------------------------------------
// Spatial zone matching (scoring +1)
// ---------------------------------------------------------------------------

describe('spatial zone scoring', () => {
  // Viewport: 900 x 600
  // Cell boundaries: cols 0-300, 300-600, 600-900 | rows 0-200, 200-400, 400-600

  it('prefers the top-left shape when spatial is "top-left"', () => {
    const shapes = [
      geoShape('top-left', 'rectangle', 'black', 'a1'),
      geoShape('center', 'rectangle', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes, {
      bounds: {
        'top-left': { x: 0, y: 0, w: 100, h: 100 },     // center (50,50) -> top-left
        center: { x: 400, y: 250, w: 100, h: 100 },       // center (450,300) -> center
      },
    })
    const result = resolve(editor, { shapeType: 'rectangle', spatial: 'top-left' })
    // top-left: +3 (type) + 1 (spatial) = 4; center: +3 (type) = 3
    expect(result).toEqual({ kind: 'found', ids: ['top-left'] })
  })

  it('prefers the bottom-right shape when spatial is "bottom-right"', () => {
    const shapes = [
      geoShape('br', 'ellipse', 'black', 'a1'),
      geoShape('tl', 'ellipse', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes, {
      bounds: {
        br: { x: 750, y: 450, w: 100, h: 100 }, // center (800,500) -> bottom-right
        tl: { x: 0, y: 0, w: 100, h: 100 },     // center (50,50) -> top-left
      },
    })
    const result = resolve(editor, { shapeType: 'circle', spatial: 'bottom-right' })
    expect(result).toEqual({ kind: 'found', ids: ['br'] })
  })

  it('returns none when no shape is in the requested spatial zone', () => {
    const shapes = [
      geoShape('s1', 'ellipse', 'black', 'a1'),
      geoShape('s2', 'rectangle', 'red', 'a2'),
    ]
    const editor = makeMockEditor(shapes, {
      bounds: {
        s1: { x: 0, y: 0, w: 100, h: 100 },    // center (50,50) -> top-left
        s2: { x: 350, y: 0, w: 100, h: 100 },   // center (400,50) -> top
      },
    })
    // Asking for bottom-right, both shapes are in top area -> score=0 -> none
    expect(resolve(editor, { spatial: 'bottom-right' })).toEqual({ kind: 'none' })
  })

  it('matches the center zone correctly', () => {
    const shapes = [geoShape('c', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { c: { x: 350, y: 200, w: 200, h: 200 } }, // center (450,300) -> center
    })
    expect(resolve(editor, { spatial: 'center' })).toEqual({ kind: 'found', ids: ['c'] })
  })

  it('matches "top" zone (middle column, top row)', () => {
    const shapes = [geoShape('t', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { t: { x: 350, y: 0, w: 200, h: 100 } }, // center (450,50) -> top
    })
    expect(resolve(editor, { spatial: 'top' })).toEqual({ kind: 'found', ids: ['t'] })
  })

  it('matches "left" zone (left column, middle row)', () => {
    const shapes = [geoShape('l', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { l: { x: 0, y: 200, w: 100, h: 200 } }, // center (50,300) -> left
    })
    expect(resolve(editor, { spatial: 'left' })).toEqual({ kind: 'found', ids: ['l'] })
  })

  it('matches "right" zone (right column, middle row)', () => {
    const shapes = [geoShape('r', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { r: { x: 700, y: 200, w: 100, h: 200 } }, // center (750,300) -> right
    })
    expect(resolve(editor, { spatial: 'right' })).toEqual({ kind: 'found', ids: ['r'] })
  })

  it('matches "bottom" zone', () => {
    const shapes = [geoShape('b', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { b: { x: 350, y: 480, w: 200, h: 100 } }, // center (450,530) -> bottom
    })
    expect(resolve(editor, { spatial: 'bottom' })).toEqual({ kind: 'found', ids: ['b'] })
  })

  it('matches "top-right" zone', () => {
    const shapes = [geoShape('tr', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { tr: { x: 700, y: 0, w: 100, h: 100 } }, // center (750,50) -> top-right
    })
    expect(resolve(editor, { spatial: 'top-right' })).toEqual({ kind: 'found', ids: ['tr'] })
  })

  it('matches "bottom-left" zone', () => {
    const shapes = [geoShape('bl', 'rectangle', 'black', 'a1')]
    const editor = makeMockEditor(shapes, {
      bounds: { bl: { x: 0, y: 480, w: 100, h: 100 } }, // center (50,530) -> bottom-left
    })
    expect(resolve(editor, { spatial: 'bottom-left' })).toEqual({ kind: 'found', ids: ['bl'] })
  })
})

// ---------------------------------------------------------------------------
// Combined scoring (multiple attributes)
// ---------------------------------------------------------------------------

describe('combined scoring', () => {
  it('highest combined scorer wins over partial matches', () => {
    const shapes = [
      geoShape('red-circle', 'ellipse', 'red', 'a1'),   // type+color -> 6
      geoShape('red-rect', 'rectangle', 'red', 'a2'),    // color only -> 3
      geoShape('blue-circle', 'ellipse', 'blue', 'a3'),  // type only  -> 3
      geoShape('blue-rect', 'rectangle', 'blue', 'a4'),  // no match   -> 0
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'circle', color: 'red' })
    expect(result).toEqual({ kind: 'found', ids: ['red-circle'] })
  })

  it('shapes with score 0 are excluded from results', () => {
    const shapes = [
      geoShape('circle', 'ellipse', 'black', 'a1'),     // matches type -> 3
      geoShape('blue-rect', 'rectangle', 'blue', 'a2'), // no match -> 0
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'circle' })
    expect(result).toEqual({ kind: 'found', ids: ['circle'] })
  })

  it('selection bonus breaks tie correctly', () => {
    const shapes = [
      geoShape('s1', 'ellipse', 'red', 'a1'), // color +3, selected +2 = 5
      geoShape('s2', 'ellipse', 'red', 'a2'), // color +3 = 3
    ]
    const editor = makeMockEditor(shapes, { selectedIds: ['s1'] })
    const result = resolve(editor, { color: 'red', useSelection: true })
    expect(result).toEqual({ kind: 'found', ids: ['s1'] })
  })
})

// ---------------------------------------------------------------------------
// Ambiguous result
// ---------------------------------------------------------------------------

describe('ambiguous result', () => {
  it('returns ambiguous when two shapes tie at the top score', () => {
    const shapes = [
      geoShape('s1', 'ellipse', 'red', 'a1'),
      geoShape('s2', 'ellipse', 'red', 'a2'),
      geoShape('s3', 'rectangle', 'black', 'a3'), // score 0
    ]
    const editor = makeMockEditor(shapes)
    const result = resolve(editor, { shapeType: 'circle', color: 'red' })
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2)
      expect(result.candidates).toContain('s1')
      expect(result.candidates).toContain('s2')
    }
  })
})

// ---------------------------------------------------------------------------
// No-match cases
// ---------------------------------------------------------------------------

describe('no-match (none)', () => {
  it('returns none when no shapes match the qualifier', () => {
    const shapes = [
      geoShape('s1', 'rectangle', 'blue', 'a1'),
      geoShape('s2', 'triangle', 'black', 'a2'),
    ]
    const editor = makeMockEditor(shapes)
    expect(resolve(editor, { shapeType: 'circle', color: 'red' })).toEqual({ kind: 'none' })
  })

  it('returns none on empty canvas regardless of ref', () => {
    const editor = makeMockEditor([])
    expect(resolve(editor, { ordinal: 'last' })).toEqual({ kind: 'none' })
    expect(resolve(editor, { shapeType: 'circle' })).toEqual({ kind: 'none' })
  })
})
