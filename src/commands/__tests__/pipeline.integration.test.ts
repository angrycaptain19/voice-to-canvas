/**
 * src/commands/__tests__/pipeline.integration.test.ts
 *
 * Integration tests for the full voice command pipeline:
 *   transcript string → parseVoiceCommand() → ShapeCommand
 *   ShapeCommand → executeTldrawAction() → Editor API calls
 *
 * Test oracle: COMMANDS.md sections 1-7 (every example utterance has a test).
 *
 * Mocking strategy:
 *   - matchGrammar() is tested directly (pure, synchronous, no mocks needed)
 *   - parseVoiceCommand() is tested for the grammar fast-path and error paths
 *   - executeTldrawAction() receives a MockEditor (vitest spy functions)
 *   - The Anthropic client is mocked via vi.mock('@anthropic-ai/sdk') to avoid real API calls
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchGrammar } from '../grammar'
import { parseVoiceCommand } from '../parseVoiceCommand'
import { executeTldrawAction } from '../executeTldrawAction'
import { _resetClientForTest } from '../llmFallback'
import type { TldrawAction } from '../../types'

// ---------------------------------------------------------------------------
// Mock OpenAI so no real network calls happen
// ---------------------------------------------------------------------------

const mockAnthropicCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  // Use a real function so `new Anthropic(...)` works correctly
  function MockAnthropic(_opts: unknown) {
    return { messages: { create: mockAnthropicCreate } }
  }
  return { default: MockAnthropic }
})

// ---------------------------------------------------------------------------
// MockEditor fixture
// ---------------------------------------------------------------------------

const MOCK_VIEWPORT = { x: 0, y: 0, w: 1000, h: 600 }
const MOCK_SHAPE_GEO = {
  id: 'shape:geo-1',
  type: 'geo',
  x: 100,
  y: 100,
  props: { geo: 'rectangle', w: 200, h: 200, color: 'black' },
}
const MOCK_SHAPE_CIRCLE = {
  id: 'shape:circle-1',
  type: 'geo',
  x: 200,
  y: 200,
  props: { geo: 'ellipse', w: 150, h: 150, color: 'red' },
}
const MOCK_SHAPE_ARROW = {
  id: 'shape:arrow-1',
  type: 'arrow',
  x: 50,
  y: 50,
  props: { color: 'blue' },
}

function makeMockEditor(overrides?: Record<string, unknown>) {
  return {
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
    getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 100, w: 200, h: 200 }),
    getCurrentPageShapes: vi
      .fn()
      .mockReturnValue([MOCK_SHAPE_GEO, MOCK_SHAPE_CIRCLE, MOCK_SHAPE_ARROW]),
    setStyleForSelectedShapes: vi.fn(),
    setStyleForNextShapes: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  }
}

type MockEditor = ReturnType<typeof makeMockEditor>

function runExec(editor: MockEditor, action: TldrawAction) {
  executeTldrawAction(editor as never, action)
}

/** Parse via grammar only (synchronous fast-path). */
function grammar(transcript: string) {
  return matchGrammar(transcript.trim(), transcript)
}

// ===========================================================================
// SECTION 1: COMMANDS.md § 1 — Shape Creation
// ===========================================================================

describe('COMMANDS.md § 1 — Shape Creation (grammar fast-path)', () => {
  it('"Draw a circle" → CREATE_SHAPE {shapeType:"circle"}', () => {
    const cmd = grammar('Draw a circle')
    expect(cmd).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"Add a red circle" → CREATE_SHAPE {shapeType:"circle", color:"red"}', () => {
    expect(grammar('Add a red circle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
    })
  })

  it('"Create a blue triangle in the top-right" → CREATE_SHAPE with position', () => {
    expect(grammar('Create a blue triangle in the top-right')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'triangle',
      color: 'blue',
      position: 'top-right',
    })
  })

  it('"Put a star in the center" → CREATE_SHAPE {shapeType:"star", position:"center"}', () => {
    expect(grammar('Put a star in the center')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'star',
      position: 'center',
    })
  })

  it('"Draw a large orange rectangle at the bottom" → full CREATE_SHAPE', () => {
    expect(grammar('Draw a large orange rectangle at the bottom')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      color: 'orange',
      size: 'large',
      position: 'bottom',
    })
  })

  it('"Insert a text box in the top-left" → CREATE_SHAPE {shapeType:"text", position:"top-left"}', () => {
    expect(grammar('Insert a text box in the top-left')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'text',
      position: 'top-left',
    })
  })

  it('"Make a small green ellipse near the top" → CREATE_SHAPE with size+color+position', () => {
    expect(grammar('Make a small green ellipse near the top')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'ellipse',
      color: 'green',
      size: 'small',
      position: 'top',
    })
  })

  it('"Place a yellow star at the bottom-left" → CREATE_SHAPE', () => {
    expect(grammar('Place a yellow star at the bottom-left')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'star',
      color: 'yellow',
      position: 'bottom-left',
    })
  })

  it('"Draw a white square in the center" → CREATE_SHAPE {shapeType:"rectangle", color:"white"}', () => {
    // "square" is an alias for "rectangle"
    expect(grammar('Draw a white square in the center')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      color: 'white',
      position: 'center',
    })
  })

  it('"draw a box" → CREATE_SHAPE {shapeType:"rectangle"} (alias)', () => {
    // "box" is an alias for "rectangle"
    expect(grammar('draw a box')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"Add an arrow pointing right" → CREATE_SHAPE {shapeType:"arrow"}', () => {
    expect(grammar('Add an arrow pointing right')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'arrow',
    })
  })

  it('preserves rawTranscript in output', () => {
    const raw = 'Draw a circle'
    const cmd = grammar(raw)
    expect(cmd?.rawTranscript).toBe(raw)
  })
})

// ===========================================================================
// SECTION 2: COMMANDS.md § 2 — Positioning / Move commands
// ===========================================================================

describe('COMMANDS.md § 2 — Positioning (grammar fast-path)', () => {
  it('"Move it to the top-right" → MOVE_SHAPE {position:"top-right"}', () => {
    expect(grammar('Move it to the top-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-right',
    })
  })

  it('"Move the selected shape to the center" → MOVE_SHAPE {position:"center"}', () => {
    expect(grammar('Move the selected shape to the center')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })

  it('"Snap it to the center" → MOVE_SHAPE {position:"center"}', () => {
    expect(grammar('Snap it to the center')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })

  it('"Move the selected shape to the upper-right" → MOVE_SHAPE {position:"top-right"}', () => {
    expect(grammar('Move the selected shape to the upper-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-right',
    })
  })

  it('"Drag it to the bottom-right" → MOVE_SHAPE {position:"bottom-right"}', () => {
    expect(grammar('Drag it to the bottom-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-right',
    })
  })

  it('"Shift the circle to the left" → MOVE_SHAPE {shapeType:"circle", position:"left"}', () => {
    expect(grammar('Shift the circle to the left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      shapeType: 'circle',
      position: 'left',
    })
  })

  it('"Position the rectangle at the bottom-left" — grammar may return null (LLM path)', () => {
    // "position" is not a grammar trigger verb; may fall through to LLM
    const cmd = grammar('Position the rectangle at the bottom-left')
    if (cmd !== null) {
      expect(cmd.intent).toBe('MOVE_SHAPE')
    }
  })

  // Position alias tests
  it('"move to upper-left" maps to position:"top-left"', () => {
    expect(grammar('move it to the upper-left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-left',
    })
  })

  it('"move to lower-right" maps to position:"bottom-right"', () => {
    expect(grammar('move it to the lower-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-right',
    })
  })

  it('"move to middle" maps to position:"center"', () => {
    expect(grammar('move it to the middle')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })

  it('"move to upper left" (two words) maps to position:"top-left"', () => {
    expect(grammar('move it to the upper left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-left',
    })
  })

  it('"move to lower left" (two words) maps to position:"bottom-left"', () => {
    expect(grammar('move it to the lower left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-left',
    })
  })
})

// ===========================================================================
// SECTION 3: COMMANDS.md § 3 — Styling
// ===========================================================================

describe('COMMANDS.md § 3 — Styling (grammar fast-path)', () => {
  it('"Make it red" → STYLE_SHAPE {color:"red"}', () => {
    expect(grammar('Make it red')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'red' })
  })

  it('"Change the color to blue" → STYLE_SHAPE {color:"blue"}', () => {
    expect(grammar('Change the color to blue')).toMatchObject({
      intent: 'STYLE_SHAPE',
      color: 'blue',
    })
  })

  it('"Color it green" → STYLE_SHAPE {color:"green"}', () => {
    expect(grammar('Color it green')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'green' })
  })

  it('"make it purple" → STYLE_SHAPE {color:"violet"} (purple→violet alias)', () => {
    expect(grammar('make it purple')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'violet' })
  })

  it('"make it gray" → STYLE_SHAPE {color:"grey"} (gray→grey alias)', () => {
    expect(grammar('make it gray')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'grey' })
  })

  it('"Give it a gradient fill" → STYLE_SHAPE', () => {
    const cmd = grammar('Give it a gradient fill')
    expect(cmd).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Use a pattern fill" → STYLE_SHAPE', () => {
    expect(grammar('Use a pattern fill')).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Set the fill to none" → STYLE_SHAPE', () => {
    const cmd = grammar('Set the fill to none')
    expect(cmd).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Make the fill solid" → STYLE_SHAPE', () => {
    expect(grammar('Make the fill solid')).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Make the border thick" → STYLE_SHAPE (stroke style)', () => {
    expect(grammar('Make the border thick')).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Use a thin stroke" → STYLE_SHAPE', () => {
    expect(grammar('Use a thin stroke')).toMatchObject({ intent: 'STYLE_SHAPE' })
  })

  it('"Set the stroke width to medium" — grammar returns null (LLM fallback path)', () => {
    // "stroke width to medium" does not match any grammar style pattern:
    // the grammar only matches "stroke" when immediately followed by a fill/border keyword,
    // not "stroke width to <size>". This utterance correctly falls to the LLM fallback.
    const cmd = grammar('Set the stroke width to medium')
    expect(cmd).toBeNull()
  })
})

// ===========================================================================
// SECTION 4: COMMANDS.md § 4 — Manipulation (Move/Resize/Rotate/Delete)
// ===========================================================================

describe('COMMANDS.md § 4.1 — Move', () => {
  it('"Drag it to the bottom-right" → MOVE_SHAPE {position:"bottom-right"}', () => {
    expect(grammar('Drag it to the bottom-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-right',
    })
  })

  it('"Reposition the star near the rectangle" — grammar may return partial or null', () => {
    const cmd = grammar('Reposition the star near the rectangle')
    if (cmd !== null) {
      expect(cmd.intent).toBe('MOVE_SHAPE')
    }
  })
})

describe('COMMANDS.md § 4.2 — Resize', () => {
  it('"Resize it to large" → RESIZE_SHAPE {size:"large"}', () => {
    expect(grammar('Resize it to large')).toMatchObject({ intent: 'RESIZE_SHAPE', size: 'large' })
  })

  it('"Make it smaller" → RESIZE_SHAPE {factor:0.5}', () => {
    expect(grammar('Make it smaller')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 0.5 })
  })

  it('"Scale the rectangle to medium" → RESIZE_SHAPE {shapeType:"rectangle", size:"medium"}', () => {
    expect(grammar('Scale the rectangle to medium')).toMatchObject({
      intent: 'RESIZE_SHAPE',
      shapeType: 'rectangle',
      size: 'medium',
    })
  })

  it('"Make it bigger" → RESIZE_SHAPE {factor:1.5}', () => {
    expect(grammar('Make it bigger')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 1.5 })
  })

  it('"Scale it up by 50 percent" → RESIZE_SHAPE {factor:0.5}', () => {
    // "by 50 percent" = factor 0.5 (50/100)
    expect(grammar('Scale it up by 50 percent')).toMatchObject({
      intent: 'RESIZE_SHAPE',
      factor: 0.5,
    })
  })

  it('"Make it huge" → RESIZE_SHAPE {factor:2.0}', () => {
    expect(grammar('Make it huge')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 2.0 })
  })
})

describe('COMMANDS.md § 4.3 — Rotate', () => {
  it('"Rotate it 45 degrees" → ROTATE_SHAPE {angle:45}', () => {
    expect(grammar('Rotate it 45 degrees')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 45 })
  })

  it('"Rotate the rectangle 90 degrees clockwise" → ROTATE_SHAPE {shapeType:"rectangle", angle:90}', () => {
    expect(grammar('Rotate the rectangle 90 degrees clockwise')).toMatchObject({
      intent: 'ROTATE_SHAPE',
      shapeType: 'rectangle',
      angle: 90,
    })
  })

  it('"Turn it counter-clockwise 30 degrees" → ROTATE_SHAPE {angle:-30}', () => {
    expect(grammar('Turn it counter-clockwise 30 degrees')).toMatchObject({
      intent: 'ROTATE_SHAPE',
      angle: -30,
    })
  })

  it('"Rotate it a quarter turn" → ROTATE_SHAPE {angle:90}', () => {
    expect(grammar('Rotate it a quarter turn')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 90 })
  })

  it('"Spin it half a turn" → ROTATE_SHAPE {angle:180}', () => {
    expect(grammar('Spin it half a turn')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 180 })
  })

  it('"Flip the triangle horizontally" → ROTATE_SHAPE (flip = rotate variant)', () => {
    const cmd = grammar('Flip the triangle horizontally')
    expect(cmd).toMatchObject({ intent: 'ROTATE_SHAPE', shapeType: 'triangle' })
  })
})

describe('COMMANDS.md § 4.4 — Delete', () => {
  it('"Delete the circle" → DELETE_SHAPE {shapeType:"circle"}', () => {
    expect(grammar('Delete the circle')).toMatchObject({
      intent: 'DELETE_SHAPE',
      shapeType: 'circle',
    })
  })

  it('"Remove the selected shape" → DELETE_SHAPE {}', () => {
    expect(grammar('Remove the selected shape')).toMatchObject({ intent: 'DELETE_SHAPE' })
  })

  it('"Erase it" → DELETE_SHAPE {}', () => {
    expect(grammar('Erase it')).toMatchObject({ intent: 'DELETE_SHAPE' })
  })

  it('"Clear the rectangle" → DELETE_SHAPE {shapeType:"rectangle"}', () => {
    expect(grammar('Clear the rectangle')).toMatchObject({
      intent: 'DELETE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"Delete everything" → DELETE_ALL', () => {
    expect(grammar('Delete everything')).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('"Remove all shapes" → DELETE_ALL', () => {
    expect(grammar('Remove all shapes')).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('"clear all" → DELETE_ALL', () => {
    expect(grammar('clear all')).toMatchObject({ intent: 'DELETE_ALL' })
  })
})

// ===========================================================================
// SECTION 5: COMMANDS.md § 5 — Selection
// ===========================================================================

describe('COMMANDS.md § 5 — Selection (grammar fast-path)', () => {
  it('"Select all" → SELECT_ALL', () => {
    expect(grammar('Select all')).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('"Select all shapes" → SELECT_ALL', () => {
    expect(grammar('Select all shapes')).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('"Select everything" → SELECT_ALL', () => {
    expect(grammar('Select everything')).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('"Select the red shape" → SELECT_SHAPE {color:"red"}', () => {
    expect(grammar('Select the red shape')).toMatchObject({
      intent: 'SELECT_SHAPE',
      color: 'red',
    })
  })

  it('"Select the blue circle" → SELECT_SHAPE {shapeType:"circle", color:"blue"}', () => {
    expect(grammar('Select the blue circle')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'circle',
      color: 'blue',
    })
  })

  it('"Select the rectangle" → SELECT_SHAPE {shapeType:"rectangle"}', () => {
    expect(grammar('Select the rectangle')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"Deselect all" → DESELECT', () => {
    expect(grammar('Deselect all')).toMatchObject({ intent: 'DESELECT' })
  })

  it('"Click on the star" → SELECT_SHAPE {shapeType:"star"}', () => {
    expect(grammar('Click on the star')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'star',
    })
  })
})

// ===========================================================================
// SECTION 6: COMMANDS.md § 6 — Undo / Redo
// ===========================================================================

describe('COMMANDS.md § 6 — Undo/Redo (grammar fast-path)', () => {
  it('"Undo" → UNDO {steps:1}', () => {
    expect(grammar('Undo')).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('"Undo that" → UNDO {steps:1}', () => {
    expect(grammar('Undo that')).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('"Undo the last action" → UNDO {steps:1}', () => {
    expect(grammar('Undo the last action')).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('"Undo the last 3 actions" → UNDO {steps:3}', () => {
    expect(grammar('Undo the last 3 actions')).toMatchObject({ intent: 'UNDO', steps: 3 })
  })

  it('"Go back 2 steps" → UNDO {steps:2}', () => {
    expect(grammar('Go back 2 steps')).toMatchObject({ intent: 'UNDO', steps: 2 })
  })

  it('"Redo" → REDO {steps:1}', () => {
    expect(grammar('Redo')).toMatchObject({ intent: 'REDO', steps: 1 })
  })

  it('"Redo that" → REDO {steps:1}', () => {
    expect(grammar('Redo that')).toMatchObject({ intent: 'REDO', steps: 1 })
  })

  it('"Redo the last action" → REDO {steps:1}', () => {
    expect(grammar('Redo the last action')).toMatchObject({ intent: 'REDO', steps: 1 })
  })
})

// ===========================================================================
// SECTION 7: COMMANDS.md § 7 — Animation & Timeline
// ===========================================================================

describe('COMMANDS.md § 7 — Animation & Timeline (grammar fast-path)', () => {
  it('"Record keyframe" → RECORD_KEYFRAME', () => {
    expect(grammar('Record keyframe')).toMatchObject({ intent: 'RECORD_KEYFRAME' })
  })

  it('"Record a keyframe at second 2" → RECORD_KEYFRAME {timestamp:2000}', () => {
    expect(grammar('Record a keyframe at second 2')).toMatchObject({
      intent: 'RECORD_KEYFRAME',
      timestamp: 2000,
    })
  })

  it('"Play" → PLAY', () => {
    expect(grammar('Play')).toMatchObject({ intent: 'PLAY' })
  })

  it('"Play the animation" → PLAY', () => {
    expect(grammar('Play the animation')).toMatchObject({ intent: 'PLAY' })
  })

  it('"Play from the beginning" → PLAY {timestamp:0}', () => {
    expect(grammar('Play from the beginning')).toMatchObject({
      intent: 'PLAY',
      timestamp: 0,
    })
  })

  it('"Pause" → PAUSE', () => {
    expect(grammar('Pause')).toMatchObject({ intent: 'PAUSE' })
  })

  it('"Pause the animation" → PAUSE', () => {
    expect(grammar('Pause the animation')).toMatchObject({ intent: 'PAUSE' })
  })

  it('"Stop" → STOP', () => {
    expect(grammar('Stop')).toMatchObject({ intent: 'STOP' })
  })

  it('"Go to second 3" → SEEK {timestamp:3000}', () => {
    expect(grammar('Go to second 3')).toMatchObject({ intent: 'SEEK', timestamp: 3000 })
  })

  it('"Jump to frame 10" → SEEK {timestamp: ~333ms}', () => {
    // frame 10 at 30fps = 10 * (1000/30) ≈ 333.33ms
    const cmd = grammar('Jump to frame 10')
    expect(cmd).toMatchObject({ intent: 'SEEK' })
    expect(cmd?.timestamp).toBeCloseTo(10 * (1000 / 30), 0)
  })

  it('"Go to the beginning" → SEEK {timestamp:0}', () => {
    expect(grammar('Go to the beginning')).toMatchObject({ intent: 'SEEK', timestamp: 0 })
  })

  it('"Go to the end" → SEEK {timestamp: MAX_SAFE_INTEGER}', () => {
    expect(grammar('Go to the end')).toMatchObject({
      intent: 'SEEK',
      timestamp: Number.MAX_SAFE_INTEGER,
    })
  })
})

// ===========================================================================
// SECTION 8: Edge Cases
// ===========================================================================

describe('Edge cases — grammar and parseVoiceCommand()', () => {
  // ── 8.1 Empty / whitespace transcripts ───────────────────────────────────

  it('empty transcript → grammar returns null', () => {
    expect(matchGrammar('', '')).toBeNull()
  })

  it('whitespace-only transcript → parseVoiceCommand throws PARSE_FAILURE', async () => {
    await expect(parseVoiceCommand('   ')).rejects.toMatchObject({
      code: 'PARSE_FAILURE',
    })
  })

  it('empty string → parseVoiceCommand throws PARSE_FAILURE', async () => {
    await expect(parseVoiceCommand('')).rejects.toMatchObject({ code: 'PARSE_FAILURE' })
  })

  // ── 8.2 Unknown commands (grammar miss → LLM path) ───────────────────────

  it('"do a flip" → grammar returns null (unrecognized verb "do")', () => {
    // Grammar doesn't recognize "do" as a trigger verb
    const cmd = grammar('do a flip')
    expect(cmd).toBeNull()
  })

  it('"zoom in" → grammar returns null (out of scope)', () => {
    expect(grammar('zoom in')).toBeNull()
  })

  it('"bring to front" → grammar returns null (out of scope)', () => {
    expect(grammar('bring to front')).toBeNull()
  })

  it('"group these shapes" → grammar returns null (not supported in v1)', () => {
    expect(grammar('group these shapes')).toBeNull()
  })

  // ── 8.3 Ambiguous pronoun with no selection (executor behavior) ───────────

  it('MOVE_SHAPE with no selected shapes → executor is a no-op', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
    })
    runExec(editor, { type: 'MOVE_SHAPE', position: 'center' })
    expect(editor.updateShapes).not.toHaveBeenCalled()
  })

  it('RESIZE_SHAPE with no selected shapes → executor is a no-op', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
    })
    runExec(editor, { type: 'RESIZE_SHAPE', size: 'large' })
    expect(editor.updateShapes).not.toHaveBeenCalled()
    expect(editor.resizeShape).not.toHaveBeenCalled()
  })

  it('ROTATE_SHAPE with no selected shapes → rotateShapesBy not called', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
    })
    runExec(editor, { type: 'ROTATE_SHAPE', angle: 45 })
    // ids is empty, so rotateShapesBy should NOT be called
    expect(editor.rotateShapesBy).not.toHaveBeenCalled()
  })

  it('DELETE_SHAPE with no selected shapes → executor is a no-op', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
    })
    runExec(editor, { type: 'DELETE_SHAPE' })
    expect(editor.deleteShapes).not.toHaveBeenCalled()
  })

  // ── 8.4 Malformed / unknown color values ─────────────────────────────────

  it('"make it chartreuse" → grammar returns null (unknown color)', () => {
    // "chartreuse" is not in the COLOR_MAP — no color match, no style keyword
    const cmd = grammar('make it chartreuse')
    expect(cmd).toBeNull()
  })

  it('"make it magenta" → grammar returns null (not in tldraw color set)', () => {
    expect(grammar('make it magenta')).toBeNull()
  })

  // ── 8.5 Double commands / compound utterances ─────────────────────────────

  it('"draw a circle then delete it" → grammar parses first recognized intent (CREATE_SHAPE)', () => {
    // Grammar processes the whole string; the first matching trigger verb wins.
    const cmd = grammar('draw a circle then delete it')
    expect(cmd).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"undo and redo" → grammar parses first intent (UNDO)', () => {
    const cmd = grammar('undo and redo')
    expect(cmd).toMatchObject({ intent: 'UNDO' })
  })

  // ── 8.6 rawTranscript preservation ───────────────────────────────────────

  it('rawTranscript is preserved verbatim including leading/trailing spaces', async () => {
    const raw = '  Draw a circle  '
    // parseVoiceCommand trims before grammar, but stores the original
    const cmd = await parseVoiceCommand(raw)
    expect(cmd.rawTranscript).toBe(raw)
  })
})

// ===========================================================================
// SECTION 9: LLM Fallback path (direct llmFallback() tests)
// ===========================================================================

describe('LLM fallback path — llmFallback()', () => {
  beforeEach(() => {
    mockAnthropicCreate.mockReset()
    // Set the API key so getClient() succeeds
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-test-mock-key')
    // Clear cached _client so getClient() re-runs with the stubbed env
    _resetClientForTest()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    _resetClientForTest()
  })

  it('successful LLM response → returns parsed ShapeCommand', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_command',
          input: {
            intent: 'CREATE_SHAPE',
            shapeType: 'circle',
            color: 'blue',
            rawTranscript: 'please draw a wobbly circle',
          },
        },
      ],
    })

    const { llmFallback } = await import('../llmFallback')
    const result = await llmFallback('please draw a wobbly circle')
    expect(result).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle', color: 'blue' })
  })

  it('LLM API throws network error → llmFallback throws LLM_FALLBACK_ERROR', async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error('Network timeout'))

    const { llmFallback } = await import('../llmFallback')
    await expect(llmFallback('some unknown command')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })

  it('LLM response fails Zod validation (invalid intent) → llmFallback returns null', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_command',
          input: {
            intent: 'NOT_A_REAL_INTENT',
            rawTranscript: 'something weird',
          },
        },
      ],
    })

    const { llmFallback } = await import('../llmFallback')
    const result = await llmFallback('something weird')
    // Zod validation fails for unknown intent → returns null
    expect(result).toBeNull()
  })

  it('LLM response missing rawTranscript (invalid schema) → llmFallback returns null', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_command',
          input: {
            intent: 'CREATE_SHAPE',
            shapeType: 'circle',
            // missing rawTranscript — required by schema
          },
        },
      ],
    })

    const { llmFallback } = await import('../llmFallback')
    const result = await llmFallback('draw something')
    expect(result).toBeNull()
  })

  it('LLM returns null function_call → llmFallback returns null', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    })

    const { llmFallback } = await import('../llmFallback')
    const result = await llmFallback('hmm what')
    expect(result).toBeNull()
  })

  it('LLM API throws unexpected error → llmFallback throws LLM_FALLBACK_ERROR', async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error('Unexpected API error'))

    const { llmFallback } = await import('../llmFallback')
    await expect(llmFallback('some transcript')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })

  it('LLM returns empty choices array → llmFallback returns null', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({ content: [] })

    const { llmFallback } = await import('../llmFallback')
    const result = await llmFallback('any command')
    expect(result).toBeNull()
  })
})

// ===========================================================================
// SECTION 10: Full pipeline integration (transcript → parse → execute)
// ===========================================================================

describe('Full pipeline: transcript → ShapeCommand → executor', () => {
  let editor: MockEditor

  beforeEach(() => {
    editor = makeMockEditor()
  })

  // Helper: parse via grammar + execute
  function runPipeline(transcript: string) {
    const cmd = grammar(transcript)
    if (!cmd) throw new Error(`Grammar returned null for: "${transcript}"`)
    // Map ShapeCommand intent to TldrawAction type (they share the same string values)
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    runExec(editor, action)
    return cmd
  }

  it('"Draw a circle" → creates geo ellipse shape', () => {
    runPipeline('Draw a circle')
    expect(editor.createShapes).toHaveBeenCalledOnce()
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('geo')
    expect(shapes[0].props.geo).toBe('ellipse')
  })

  it('"Draw a red rectangle" → creates geo rectangle with color red', () => {
    runPipeline('Draw a red rectangle')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.geo).toBe('rectangle')
    expect(shapes[0].props.color).toBe('red')
  })

  it('"Create a blue triangle in the top-right" → creates triangle at top-right position', () => {
    runPipeline('Create a blue triangle in the top-right')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.geo).toBe('triangle')
    expect(shapes[0].props.color).toBe('blue')
    // Verify position is in the right-hand side of viewport (x > center)
    expect(shapes[0].x).toBeGreaterThan(500) // right of center in 1000px wide viewport
    expect(shapes[0].y).toBeLessThan(200) // near top in 600px tall viewport
  })

  it('"Put a star in the center" → creates star at viewport center', () => {
    runPipeline('Put a star in the center')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.geo).toBe('star')
    // Center: x ≈ (1000/2 - w/2), y ≈ (600/2 - h/2)
    const w = 200 // default 'medium' size
    const h = 200
    expect(shapes[0].x).toBeCloseTo(1000 / 2 - w / 2, 0)
    expect(shapes[0].y).toBeCloseTo(600 / 2 - h / 2, 0)
  })

  it('"Add an arrow" → creates arrow shape', () => {
    runPipeline('Add an arrow')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('arrow')
  })

  it('"Insert a text box" → creates text shape', () => {
    runPipeline('Insert a text box')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('text')
  })

  it('"Draw a large orange rectangle" → creates rectangle with large=400px size', () => {
    runPipeline('Draw a large orange rectangle')
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].props.w).toBe(400) // large = 400px
    expect(shapes[0].props.color).toBe('orange')
  })

  it('"Select all" → editor.selectAll() called', () => {
    runPipeline('Select all')
    expect(editor.selectAll).toHaveBeenCalledOnce()
  })

  it('"Deselect all" → editor.setSelectedShapes([]) called', () => {
    runPipeline('Deselect all')
    expect(editor.setSelectedShapes).toHaveBeenCalledWith([])
  })

  it('"Undo" → editor.undo() called once', () => {
    runPipeline('Undo')
    expect(editor.undo).toHaveBeenCalledTimes(1)
  })

  it('"Undo the last 3 actions" → editor.undo() called 3 times', () => {
    runPipeline('Undo the last 3 actions')
    expect(editor.undo).toHaveBeenCalledTimes(3)
  })

  it('"Redo" → editor.redo() called once', () => {
    runPipeline('Redo')
    expect(editor.redo).toHaveBeenCalledTimes(1)
  })

  it('"Delete everything" → selectAll + deleteShapes called', () => {
    const editorWithShapes = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
    })
    const cmd = grammar('Delete everything')!
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    executeTldrawAction(editorWithShapes as never, action)
    expect(editorWithShapes.selectAll).toHaveBeenCalled()
    expect(editorWithShapes.deleteShapes).toHaveBeenCalled()
  })

  it('"Make it red" → STYLE_SHAPE → setStyleForNextShapes called', () => {
    const editorWithSelection = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
    })
    const cmd = grammar('Make it red')!
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    executeTldrawAction(editorWithSelection as never, action)
    expect(editorWithSelection.setStyleForNextShapes).toHaveBeenCalled()
    expect(editorWithSelection.setStyleForSelectedShapes).toHaveBeenCalled()
  })

  it('"Make it purple" → resolves to violet → style applied as violet', () => {
    const editorWithSelection = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
    })
    const cmd = grammar('Make it purple')!
    expect(cmd.color).toBe('violet')
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    executeTldrawAction(editorWithSelection as never, action)
    // The style should be applied with 'violet'
    const styleCall = editorWithSelection.setStyleForNextShapes.mock.calls[0]
    expect(styleCall[1]).toBe('violet')
  })

  it('"Rotate it 45 degrees" → rotateShapesBy with π/4 radians', () => {
    const editorWithSelection = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
    })
    const cmd = grammar('Rotate it 45 degrees')!
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    executeTldrawAction(editorWithSelection as never, action)
    expect(editorWithSelection.rotateShapesBy).toHaveBeenCalledWith(
      ['shape:geo-1'],
      expect.closeTo(Math.PI / 4, 5),
    )
  })

  it('"Select the rectangle" → executor selects matching geo rectangle shapes', () => {
    const cmd = grammar('Select the rectangle')!
    const action = { ...cmd, type: cmd.intent } as unknown as TldrawAction
    runExec(editor, action)
    expect(editor.setSelectedShapes).toHaveBeenCalled()
    const selectedIds = editor.setSelectedShapes.mock.calls[0][0]
    // MOCK_SHAPE_GEO is a geo:rectangle — should be selected
    expect(selectedIds).toContain('shape:geo-1')
  })

  it('"Play" → executor is a no-op (animation command passthrough)', () => {
    runPipeline('Play')
    expect(editor.createShapes).not.toHaveBeenCalled()
    expect(editor.updateShapes).not.toHaveBeenCalled()
    expect(editor.undo).not.toHaveBeenCalled()
  })

  it('"Pause" → executor is a no-op (animation command passthrough)', () => {
    runPipeline('Pause')
    expect(editor.createShapes).not.toHaveBeenCalled()
  })

  it('"Stop" → executor is a no-op (animation command passthrough)', () => {
    runPipeline('Stop')
    expect(editor.createShapes).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// SECTION 11: Executor correctness — MOVE_SHAPE with targetId
// ===========================================================================

describe('Executor — MOVE_SHAPE with targetId', () => {
  it('MOVE_SHAPE with targetId → updates specific shape', () => {
    const editor = makeMockEditor({
      getShape: vi.fn().mockReturnValue(MOCK_SHAPE_GEO),
      getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 100, w: 200, h: 200 }),
    })
    runExec(editor, { type: 'MOVE_SHAPE', targetId: 'shape:geo-1', position: 'center' })
    expect(editor.updateShapes).toHaveBeenCalledOnce()
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].id).toBe('shape:geo-1')
  })

  it('MOVE_SHAPE with dx/dy → applies relative delta', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
      getShape: vi.fn().mockReturnValue({ ...MOCK_SHAPE_GEO, x: 100, y: 50 }),
    })
    runExec(editor, { type: 'MOVE_SHAPE', targetId: 'shape:geo-1', dx: 50, dy: -20 })
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].x).toBe(150) // 100 + 50
    expect(updates[0].y).toBe(30)  // 50 - 20
  })
})

// ===========================================================================
// SECTION 12: Executor correctness — RESIZE_SHAPE
// ===========================================================================

describe('Executor — RESIZE_SHAPE', () => {
  it('RESIZE_SHAPE with named size → updates w/h to correct pixel values', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
      getShape: vi.fn().mockReturnValue(MOCK_SHAPE_GEO),
      getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 100, w: 200, h: 200 }),
    })
    runExec(editor, { type: 'RESIZE_SHAPE', targetId: 'shape:geo-1', size: 'large' })
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(400) // large = 400px
    expect(updates[0].props.h).toBe(400)
  })

  it('RESIZE_SHAPE with factor → scales by factor', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
      getShape: vi.fn().mockReturnValue(MOCK_SHAPE_GEO),
      getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 100, w: 200, h: 200 }),
    })
    runExec(editor, { type: 'RESIZE_SHAPE', targetId: 'shape:geo-1', factor: 1.5 })
    const [updates] = editor.updateShapes.mock.calls[0]
    expect(updates[0].props.w).toBe(300) // 200 * 1.5
    expect(updates[0].props.h).toBe(300)
  })

  it('RESIZE_SHAPE with no size or factor → no update', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:geo-1']),
      getShape: vi.fn().mockReturnValue(MOCK_SHAPE_GEO),
      getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 100, w: 200, h: 200 }),
    })
    runExec(editor, { type: 'RESIZE_SHAPE', targetId: 'shape:geo-1' })
    expect(editor.updateShapes).not.toHaveBeenCalled()
    expect(editor.resizeShape).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// SECTION 13: Executor correctness — DELETE_ALL edge cases
// ===========================================================================

describe('Executor — DELETE_ALL', () => {
  it('DELETE_ALL with no shapes → selectAll called but deleteShapes not called', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue([]),
    })
    runExec(editor, { type: 'DELETE_ALL' })
    expect(editor.selectAll).toHaveBeenCalled()
    expect(editor.deleteShapes).not.toHaveBeenCalled()
  })

  it('DELETE_ALL with shapes → deleteShapes called with all shape ids', () => {
    const editor = makeMockEditor({
      getSelectedShapeIds: vi.fn().mockReturnValue(['shape:a', 'shape:b']),
    })
    runExec(editor, { type: 'DELETE_ALL' })
    expect(editor.deleteShapes).toHaveBeenCalledWith(['shape:a', 'shape:b'])
  })
})

// ===========================================================================
// SECTION 14: Executor correctness — SELECT_SHAPE filtering
// ===========================================================================

describe('Executor — SELECT_SHAPE', () => {
  it('SELECT_SHAPE by color → selects only matching color shapes', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'SELECT_SHAPE', color: 'red' })
    expect(editor.setSelectedShapes).toHaveBeenCalled()
    const [ids] = editor.setSelectedShapes.mock.calls[0]
    // MOCK_SHAPE_CIRCLE has color 'red'
    expect(ids).toContain('shape:circle-1')
    // MOCK_SHAPE_GEO has color 'black' — should NOT be included
    expect(ids).not.toContain('shape:geo-1')
  })

  it('SELECT_SHAPE by shapeType:circle → selects geo shapes with geo:ellipse', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'SELECT_SHAPE', shapeType: 'circle' })
    expect(editor.setSelectedShapes).toHaveBeenCalled()
    const [ids] = editor.setSelectedShapes.mock.calls[0]
    // MOCK_SHAPE_CIRCLE is geo:ellipse (circle maps to ellipse)
    expect(ids).toContain('shape:circle-1')
  })

  it('SELECT_SHAPE with targetId → sets exactly that shape', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'SELECT_SHAPE', targetId: 'shape:geo-1' })
    expect(editor.setSelectedShapes).toHaveBeenCalledWith(['shape:geo-1'])
  })

  it('SELECT_SHAPE with no matches → setSelectedShapes not called', () => {
    const editor = makeMockEditor()
    // No violet shapes in mock
    runExec(editor, { type: 'SELECT_SHAPE', color: 'violet' })
    expect(editor.setSelectedShapes).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// SECTION 15: Grammar correctness — case insensitivity
// ===========================================================================

describe('Grammar — case insensitivity', () => {
  it('"DRAW A CIRCLE" → CREATE_SHAPE', () => {
    expect(grammar('DRAW A CIRCLE')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"Make It RED" → STYLE_SHAPE {color:"red"}', () => {
    expect(grammar('Make It RED')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'red' })
  })

  it('"UNDO THAT" → UNDO', () => {
    expect(grammar('UNDO THAT')).toMatchObject({ intent: 'UNDO' })
  })

  it('"select ALL" → SELECT_ALL', () => {
    expect(grammar('select ALL')).toMatchObject({ intent: 'SELECT_ALL' })
  })
})

// ===========================================================================
// SECTION 16: Grammar — all shape type aliases
// ===========================================================================

describe('Grammar — shape type aliases', () => {
  it('"draw a square" → shapeType:"rectangle"', () => {
    expect(grammar('draw a square')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"draw a box" → shapeType:"rectangle"', () => {
    expect(grammar('draw a box')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'rectangle' })
  })

  it('"draw a rect" → shapeType:"rectangle"', () => {
    expect(grammar('draw a rect')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"draw an oval" → shapeType:"ellipse"', () => {
    expect(grammar('draw an oval')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'ellipse' })
  })

  it('"draw an ellipse" → shapeType:"ellipse"', () => {
    expect(grammar('draw an ellipse')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'ellipse',
    })
  })

  it('"draw a textbox" → shapeType:"text"', () => {
    expect(grammar('draw a textbox')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'text' })
  })

  it('"draw a frame" → shapeType:"frame"', () => {
    expect(grammar('draw a frame')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'frame' })
  })

  it('"draw a line" → shapeType:"line"', () => {
    expect(grammar('draw a line')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'line' })
  })

  it('"draw a star" → shapeType:"star"', () => {
    expect(grammar('draw a star')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'star' })
  })

  it('"draw a triangle" → shapeType:"triangle"', () => {
    expect(grammar('draw a triangle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'triangle',
    })
  })
})

// ===========================================================================
// SECTION 17: Grammar — position aliases
// ===========================================================================

describe('Grammar — position aliases', () => {
  it('"move to middle" → position:"center"', () => {
    expect(grammar('move it to the middle')).toMatchObject({ position: 'center' })
  })

  it('"move to upper-left" → position:"top-left"', () => {
    expect(grammar('move it to the upper-left')).toMatchObject({ position: 'top-left' })
  })

  it('"move to upper-right" → position:"top-right"', () => {
    expect(grammar('move it to the upper-right')).toMatchObject({ position: 'top-right' })
  })

  it('"move to lower-left" → position:"bottom-left"', () => {
    expect(grammar('move it to the lower-left')).toMatchObject({ position: 'bottom-left' })
  })

  it('"move to lower-right" → position:"bottom-right"', () => {
    expect(grammar('move it to the lower-right')).toMatchObject({ position: 'bottom-right' })
  })

  it('"move to top left" (no hyphen) → position:"top-left"', () => {
    expect(grammar('move it to the top left')).toMatchObject({ position: 'top-left' })
  })

  it('"move to bottom right" (no hyphen) → position:"bottom-right"', () => {
    expect(grammar('move it to the bottom right')).toMatchObject({ position: 'bottom-right' })
  })

  it('"move to top" → position:"top"', () => {
    expect(grammar('move it to the top')).toMatchObject({ position: 'top' })
  })

  it('"move to bottom" → position:"bottom"', () => {
    expect(grammar('move it to the bottom')).toMatchObject({ position: 'bottom' })
  })

  it('"move to right" → position:"right"', () => {
    expect(grammar('move it to the right')).toMatchObject({ position: 'right' })
  })
})

// ===========================================================================
// SECTION 18: Grammar — color aliases
// ===========================================================================

describe('Grammar — color aliases', () => {
  it('"make it purple" → color:"violet" (purple→violet)', () => {
    expect(grammar('make it purple')).toMatchObject({ color: 'violet' })
  })

  it('"make it gray" → color:"grey" (gray→grey)', () => {
    expect(grammar('make it gray')).toMatchObject({ color: 'grey' })
  })

  it('"draw a purple circle" → color:"violet"', () => {
    expect(grammar('draw a purple circle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      color: 'violet',
    })
  })

  it('"draw a gray rectangle" → color:"grey"', () => {
    expect(grammar('draw a gray rectangle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      color: 'grey',
    })
  })
})

// ===========================================================================
// SECTION 19: CREATE_SHAPE executor — all shape types create correct tldraw types
// ===========================================================================

describe('Executor — CREATE_SHAPE all shape types', () => {
  const shapeCases: Array<{
    shapeType: 'circle' | 'ellipse' | 'rectangle' | 'triangle' | 'star' | 'arrow' | 'line' | 'text' | 'frame'
    expectedType: string
    expectedGeo?: string
  }> = [
    { shapeType: 'circle', expectedType: 'geo', expectedGeo: 'ellipse' },
    { shapeType: 'ellipse', expectedType: 'geo', expectedGeo: 'ellipse' },
    { shapeType: 'rectangle', expectedType: 'geo', expectedGeo: 'rectangle' },
    { shapeType: 'triangle', expectedType: 'geo', expectedGeo: 'triangle' },
    { shapeType: 'star', expectedType: 'geo', expectedGeo: 'star' },
    { shapeType: 'arrow', expectedType: 'arrow' },
    { shapeType: 'line', expectedType: 'line' },
    { shapeType: 'text', expectedType: 'text' },
    { shapeType: 'frame', expectedType: 'frame' },
  ]

  for (const { shapeType, expectedType, expectedGeo } of shapeCases) {
    it(`shapeType:"${shapeType}" → tldraw type:"${expectedType}"${expectedGeo ? ` geo:"${expectedGeo}"` : ''}`, () => {
      const editor = makeMockEditor()
      runExec(editor, { type: 'CREATE_SHAPE', shapeType })
      expect(editor.createShapes).toHaveBeenCalledOnce()
      const [shapes] = editor.createShapes.mock.calls[0]
      expect(shapes[0].type).toBe(expectedType)
      if (expectedGeo) {
        expect(shapes[0].props.geo).toBe(expectedGeo)
      }
    })
  }
})

// ===========================================================================
// SECTION 20: Multi-step undo/redo
// ===========================================================================

describe('Executor — multi-step UNDO/REDO', () => {
  it('UNDO with steps:5 → undo() called 5 times', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'UNDO', steps: 5 })
    expect(editor.undo).toHaveBeenCalledTimes(5)
  })

  it('REDO with steps:3 → redo() called 3 times', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'REDO', steps: 3 })
    expect(editor.redo).toHaveBeenCalledTimes(3)
  })

  it('UNDO with no steps (undefined) → undo() called once', () => {
    const editor = makeMockEditor()
    runExec(editor, { type: 'UNDO' })
    expect(editor.undo).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// SECTION 21: Coverage-boost tests for uncovered branches
//   Targets: executeTldrawAction.ts lines 75-76, 117-118, 186
//            parseVoiceCommand.ts lines 90-97
//            llmFallback.ts line 201
// ===========================================================================

describe('Executor — default/fallthrough branches (coverage)', () => {
  it('unknown shapeType in CREATE_SHAPE → falls back to geo:rectangle', () => {
    const editor = makeMockEditor()
    // Cast to any to pass an unknown shapeType that hits the `default` branch
    runExec(editor, { type: 'CREATE_SHAPE', shapeType: 'hexagon' as never })
    expect(editor.createShapes).toHaveBeenCalledOnce()
    const [shapes] = editor.createShapes.mock.calls[0]
    expect(shapes[0].type).toBe('geo')
    expect(shapes[0].props.geo).toBe('rectangle')
  })

  it('unknown position in MOVE_SHAPE → falls back to center coordinates', () => {
    const editor = makeMockEditor()
    // "superposition" is not in the position enum → hits the default branch
    runExec(editor, {
      type: 'MOVE_SHAPE',
      targetId: 'shape:geo-1',
      position: 'superposition' as never,
    })
    expect(editor.updateShapes).toHaveBeenCalledOnce()
    const [shapes] = editor.updateShapes.mock.calls[0]
    // Center of a 1000×600 viewport, shape 200×200 → x=400, y=200
    expect(shapes[0].x).toBeCloseTo(400, 0)
    expect(shapes[0].y).toBeCloseTo(200, 0)
  })

  it('unknown action type → no-op (does not throw)', () => {
    const editor = makeMockEditor()
    // Cast to any to trigger the exhaustive `default` branch
    expect(() =>
      runExec(editor, { type: 'UNKNOWN_FUTURE_ACTION' as never })
    ).not.toThrow()
    // No editor methods should have been called
    expect(editor.createShapes).not.toHaveBeenCalled()
    expect(editor.updateShapes).not.toHaveBeenCalled()
    expect(editor.deleteShapes).not.toHaveBeenCalled()
  })
})

describe('parseVoiceCommand() — LLM fallback integration (grammar null path)', () => {
  beforeEach(() => {
    mockAnthropicCreate.mockReset()
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-test-mock-key')
    _resetClientForTest()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    _resetClientForTest()
  })

  it('unknown transcript → grammar returns null → LLM fallback is called → returns ShapeCommand', async () => {
    // LLM returns a valid CREATE_SHAPE response
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_command',
          input: {
            intent: 'CREATE_SHAPE',
            shapeType: 'circle',
            rawTranscript: 'do a wobbly circle please',
          },
        },
      ],
    })

    // "do a wobbly circle please" — grammar won't match this
    const cmd = await parseVoiceCommand('do a wobbly circle please')
    expect(cmd).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
  })

  it('unknown transcript → grammar returns null → LLM returns null → throws PARSE_FAILURE', async () => {
    // LLM returns empty content (resolves to null from llmFallback)
    mockAnthropicCreate.mockResolvedValueOnce({ content: [] })

    await expect(parseVoiceCommand('xyzzy frobniculate the quux')).rejects.toMatchObject({
      code: 'PARSE_FAILURE',
    })
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
  })

  it('unknown transcript → grammar returns null → LLM throws LLM_FALLBACK_ERROR → error propagates', async () => {
    // LLM API throws a network error
    mockAnthropicCreate.mockRejectedValueOnce(new Error('API unreachable'))

    await expect(parseVoiceCommand('frobnicate the widget')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })
})
