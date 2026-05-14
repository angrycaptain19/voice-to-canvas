/**
 * src/commands/parseVoiceCommand.test.ts
 *
 * Unit tests for the voice command parsing layer.
 *
 * Strategy:
 *  - All tests exercise `matchGrammar` directly (pure, synchronous fast-path;
 *    no network calls, no API keys required).
 *  - A small set of integration tests exercise `parseVoiceCommand` to cover
 *    the grammar fast-path and error paths (no real LLM call needed for these).
 *
 * Coverage:
 *  Every intent from COMMANDS.md (17 intents)
 *  Color aliases (purple -> violet, gray -> grey)
 *  Position aliases (upper left, lower right, middle)
 *  Shape aliases (square, oval, box)
 *  Empty transcript -> PARSE_FAILURE
 *  Grammar null for gibberish
 *  rawTranscript preserved in output
 */

import { describe, expect, it } from 'vitest'
import { matchGrammar } from './grammar'
import { parseVoiceCommand } from './parseVoiceCommand'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Call matchGrammar with transcript as both arguments. */
function grammar(transcript: string) {
  return matchGrammar(transcript.trim(), transcript)
}

// ─── 1. CREATE_SHAPE ─────────────────────────────────────────────────────────

describe('CREATE_SHAPE', () => {
  it('draw a circle', () => {
    expect(grammar('draw a circle')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('add a red circle', () => {
    expect(grammar('add a red circle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
    })
  })

  it('create a blue triangle in the top-right', () => {
    expect(grammar('create a blue triangle in the top-right')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'triangle',
      color: 'blue',
      position: 'top-right',
    })
  })

  it('put a star in the center', () => {
    expect(grammar('put a star in the center')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'star',
      position: 'center',
    })
  })

  it('draw a large orange rectangle at the bottom', () => {
    expect(grammar('draw a large orange rectangle at the bottom')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      color: 'orange',
      size: 'large',
      position: 'bottom',
    })
  })

  it('make a small green ellipse near the top', () => {
    expect(grammar('make a small green ellipse near the top')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'ellipse',
      color: 'green',
      size: 'small',
      position: 'top',
    })
  })

  it('place a yellow star at the bottom-left', () => {
    expect(grammar('place a yellow star at the bottom-left')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'star',
      color: 'yellow',
      position: 'bottom-left',
    })
  })

  it('insert a text box in the top-left', () => {
    // "text box" normalized to shapeType:"text"
    const cmd = grammar('insert a text box in the top-left')
    expect(cmd).not.toBeNull()
    expect(cmd?.intent).toBe('CREATE_SHAPE')
    expect(cmd?.shapeType).toBe('text')
    expect(cmd?.position).toBe('top-left')
  })

  it('draw a white square in the center -- square aliases to rectangle', () => {
    expect(grammar('draw a white square in the center')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      color: 'white',
      position: 'center',
    })
  })

  it('draw a purple circle -- purple aliases to violet', () => {
    expect(grammar('draw a purple circle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'violet',
    })
  })

  it('add an oval -- oval aliases to ellipse', () => {
    expect(grammar('add an oval')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'ellipse',
    })
  })

  it('create a box -- box aliases to rectangle', () => {
    expect(grammar('create a box')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })
})

// ─── 2. MOVE_SHAPE ───────────────────────────────────────────────────────────

describe('MOVE_SHAPE', () => {
  it('move it to the top-right', () => {
    expect(grammar('move it to the top-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-right',
    })
  })

  it('drag it to the bottom-right', () => {
    expect(grammar('drag it to the bottom-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-right',
    })
  })

  it('move the selected shape to the center', () => {
    expect(grammar('move the selected shape to the center')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })

  it('shift the circle to the left', () => {
    expect(grammar('shift the circle to the left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      shapeType: 'circle',
      position: 'left',
    })
  })

  it('snap it to the center', () => {
    expect(grammar('snap it to the center')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })

  it('"upper-right" alias normalized to top-right', () => {
    expect(grammar('move the selected shape to the upper-right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-right',
    })
  })
})

// ─── 3. RESIZE_SHAPE ─────────────────────────────────────────────────────────

describe('RESIZE_SHAPE', () => {
  it('resize it to small', () => {
    expect(grammar('resize it to small')).toMatchObject({ intent: 'RESIZE_SHAPE', size: 'small' })
  })

  it('scale it to large', () => {
    expect(grammar('scale it to large')).toMatchObject({ intent: 'RESIZE_SHAPE', size: 'large' })
  })

  it('make it bigger', () => {
    expect(grammar('make it bigger')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 1.5 })
  })

  it('make it smaller', () => {
    expect(grammar('make it smaller')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 0.5 })
  })

  it('make it huge', () => {
    expect(grammar('make it huge')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 2.0 })
  })

  it('scale it by 50 percent', () => {
    expect(grammar('scale it by 50 percent')).toMatchObject({ intent: 'RESIZE_SHAPE', factor: 0.5 })
  })
})

// ─── 4. ROTATE_SHAPE ─────────────────────────────────────────────────────────

describe('ROTATE_SHAPE', () => {
  it('rotate it 45 degrees', () => {
    expect(grammar('rotate it 45 degrees')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 45 })
  })

  it('rotate the rectangle 90 degrees clockwise', () => {
    expect(grammar('rotate the rectangle 90 degrees clockwise')).toMatchObject({
      intent: 'ROTATE_SHAPE',
      angle: 90,
      shapeType: 'rectangle',
    })
  })

  it('turn it counter-clockwise 30 degrees', () => {
    expect(grammar('turn it counter-clockwise 30 degrees')).toMatchObject({
      intent: 'ROTATE_SHAPE',
      angle: -30,
    })
  })

  it('rotate it a quarter turn', () => {
    expect(grammar('rotate it a quarter turn')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 90 })
  })

  it('rotate it half a turn', () => {
    expect(grammar('rotate it half a turn')).toMatchObject({ intent: 'ROTATE_SHAPE', angle: 180 })
  })

  it('flip the triangle', () => {
    expect(grammar('flip the triangle')).toMatchObject({
      intent: 'ROTATE_SHAPE',
      shapeType: 'triangle',
    })
  })
})

// ─── 5. DELETE_SHAPE ─────────────────────────────────────────────────────────

describe('DELETE_SHAPE', () => {
  it('delete the circle', () => {
    expect(grammar('delete the circle')).toMatchObject({
      intent: 'DELETE_SHAPE',
      shapeType: 'circle',
    })
  })

  it('remove the selected shape', () => {
    expect(grammar('remove the selected shape')).toMatchObject({ intent: 'DELETE_SHAPE' })
  })

  it('erase it', () => {
    expect(grammar('erase it')).toMatchObject({ intent: 'DELETE_SHAPE' })
  })

  it('clear the rectangle', () => {
    expect(grammar('clear the rectangle')).toMatchObject({
      intent: 'DELETE_SHAPE',
      shapeType: 'rectangle',
    })
  })
})

// ─── 6. DELETE_ALL ───────────────────────────────────────────────────────────

describe('DELETE_ALL', () => {
  it('delete everything', () => {
    expect(grammar('delete everything')).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('remove all shapes', () => {
    expect(grammar('remove all shapes')).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('clear all', () => {
    expect(grammar('clear all')).toMatchObject({ intent: 'DELETE_ALL' })
  })
})

// ─── 7. STYLE_SHAPE ──────────────────────────────────────────────────────────

describe('STYLE_SHAPE', () => {
  it('make it red', () => {
    expect(grammar('make it red')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'red' })
  })

  it('change the color to blue', () => {
    expect(grammar('change the color to blue')).toMatchObject({
      intent: 'STYLE_SHAPE',
      color: 'blue',
    })
  })

  it('color it green', () => {
    expect(grammar('color it green')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'green' })
  })

  it('make it gray -- gray aliases to grey', () => {
    expect(grammar('make it gray')).toMatchObject({ intent: 'STYLE_SHAPE', color: 'grey' })
  })
})

// ─── 8. SELECT_SHAPE ─────────────────────────────────────────────────────────

describe('SELECT_SHAPE', () => {
  it('select the red shape', () => {
    expect(grammar('select the red shape')).toMatchObject({ intent: 'SELECT_SHAPE', color: 'red' })
  })

  it('select the blue circle', () => {
    expect(grammar('select the blue circle')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'circle',
      color: 'blue',
    })
  })

  it('select the rectangle', () => {
    expect(grammar('select the rectangle')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('click on the star', () => {
    expect(grammar('click on the star')).toMatchObject({
      intent: 'SELECT_SHAPE',
      shapeType: 'star',
    })
  })
})

// ─── 9. SELECT_ALL ───────────────────────────────────────────────────────────

describe('SELECT_ALL', () => {
  it('select all', () => {
    expect(grammar('select all')).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('select all shapes', () => {
    expect(grammar('select all shapes')).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('select everything', () => {
    expect(grammar('select everything')).toMatchObject({ intent: 'SELECT_ALL' })
  })
})

// ─── 10. DESELECT ────────────────────────────────────────────────────────────

describe('DESELECT', () => {
  it('deselect all', () => {
    expect(grammar('deselect all')).toMatchObject({ intent: 'DESELECT' })
  })

  it('deselect it', () => {
    expect(grammar('deselect it')).toMatchObject({ intent: 'DESELECT' })
  })
})

// ─── 11. UNDO ────────────────────────────────────────────────────────────────

describe('UNDO', () => {
  it('undo', () => {
    expect(grammar('undo')).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('undo that', () => {
    expect(grammar('undo that')).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('undo the last 3 actions', () => {
    expect(grammar('undo the last 3 actions')).toMatchObject({ intent: 'UNDO', steps: 3 })
  })

  it('go back 2 steps', () => {
    expect(grammar('go back 2 steps')).toMatchObject({ intent: 'UNDO', steps: 2 })
  })
})

// ─── 12. REDO ────────────────────────────────────────────────────────────────

describe('REDO', () => {
  it('redo', () => {
    expect(grammar('redo')).toMatchObject({ intent: 'REDO', steps: 1 })
  })

  it('redo that', () => {
    expect(grammar('redo that')).toMatchObject({ intent: 'REDO', steps: 1 })
  })

  it('redo the last action', () => {
    expect(grammar('redo the last action')).toMatchObject({ intent: 'REDO', steps: 1 })
  })
})

// ─── 13. RECORD_KEYFRAME ─────────────────────────────────────────────────────

describe('RECORD_KEYFRAME', () => {
  it('record keyframe', () => {
    expect(grammar('record keyframe')).toMatchObject({ intent: 'RECORD_KEYFRAME' })
  })

  it('record a keyframe', () => {
    expect(grammar('record a keyframe')).toMatchObject({ intent: 'RECORD_KEYFRAME' })
  })

  it('record a keyframe at second 2', () => {
    expect(grammar('record a keyframe at second 2')).toMatchObject({
      intent: 'RECORD_KEYFRAME',
      timestamp: 2000,
    })
  })
})

// ─── 14. PLAY ────────────────────────────────────────────────────────────────

describe('PLAY', () => {
  it('play', () => {
    expect(grammar('play')).toMatchObject({ intent: 'PLAY' })
  })

  it('play the animation', () => {
    expect(grammar('play the animation')).toMatchObject({ intent: 'PLAY' })
  })

  it('play from the beginning', () => {
    expect(grammar('play from the beginning')).toMatchObject({ intent: 'PLAY', timestamp: 0 })
  })
})

// ─── 15. PAUSE ───────────────────────────────────────────────────────────────

describe('PAUSE', () => {
  it('pause', () => {
    expect(grammar('pause')).toMatchObject({ intent: 'PAUSE' })
  })

  it('pause the animation', () => {
    expect(grammar('pause the animation')).toMatchObject({ intent: 'PAUSE' })
  })
})

// ─── 16. STOP ────────────────────────────────────────────────────────────────

describe('STOP', () => {
  it('stop', () => {
    expect(grammar('stop')).toMatchObject({ intent: 'STOP' })
  })

  it('stop the animation', () => {
    expect(grammar('stop the animation')).toMatchObject({ intent: 'STOP' })
  })
})

// ─── 17. SEEK ────────────────────────────────────────────────────────────────

describe('SEEK', () => {
  it('go to second 3', () => {
    expect(grammar('go to second 3')).toMatchObject({ intent: 'SEEK', timestamp: 3000 })
  })

  it('jump to frame 10', () => {
    const cmd = grammar('jump to frame 10')
    expect(cmd?.intent).toBe('SEEK')
    expect(cmd?.timestamp).toBeCloseTo(10 * (1000 / 30), 1)
  })

  it('go to the beginning', () => {
    expect(grammar('go to the beginning')).toMatchObject({ intent: 'SEEK', timestamp: 0 })
  })

  it('go to the end', () => {
    expect(grammar('go to the end')).toMatchObject({
      intent: 'SEEK',
      timestamp: Number.MAX_SAFE_INTEGER,
    })
  })
})

// ─── 18. Position alias normalisation ────────────────────────────────────────

describe('Position alias normalisation', () => {
  it('"upper left" normalised to top-left', () => {
    expect(grammar('move it to the upper left')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'top-left',
    })
  })

  it('"lower right" normalised to bottom-right', () => {
    expect(grammar('move it to the lower right')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'bottom-right',
    })
  })

  it('"middle" normalised to center', () => {
    expect(grammar('move it to the middle')).toMatchObject({
      intent: 'MOVE_SHAPE',
      position: 'center',
    })
  })
})

// ─── 19. Grammar returns null for unrecognised input ─────────────────────────

describe('grammar returns null for unknown patterns', () => {
  it('returns null for gibberish', () => {
    expect(grammar('xyzzy flibbertigibbet')).toBeNull()
  })

  it('returns null for whitespace-only after trim', () => {
    expect(matchGrammar('', '   ')).toBeNull()
  })
})

// ─── 20. parseVoiceCommand -- synchronous grammar paths ──────────────────────

describe('parseVoiceCommand -- grammar fast-path (no network)', () => {
  it('throws PARSE_FAILURE for empty transcript', async () => {
    await expect(parseVoiceCommand('')).rejects.toMatchObject({ code: 'PARSE_FAILURE' })
  })

  it('throws PARSE_FAILURE for whitespace-only transcript', async () => {
    await expect(parseVoiceCommand('   ')).rejects.toMatchObject({ code: 'PARSE_FAILURE' })
  })

  it('resolves to UNDO via grammar without network call', async () => {
    const cmd = await parseVoiceCommand('undo')
    expect(cmd).toMatchObject({ intent: 'UNDO', steps: 1 })
  })

  it('resolves complex CREATE_SHAPE via grammar without network call', async () => {
    const cmd = await parseVoiceCommand('draw a red circle in the top-left')
    expect(cmd).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
      position: 'top-left',
    })
  })

  it('rawTranscript is the original string (not trimmed)', async () => {
    const raw = '  draw a blue star  '
    const cmd = await parseVoiceCommand(raw)
    expect(cmd.rawTranscript).toBe(raw)
  })

  it('resolves SELECT_ALL via grammar', async () => {
    const cmd = await parseVoiceCommand('select all')
    expect(cmd).toMatchObject({ intent: 'SELECT_ALL' })
  })

  it('resolves DELETE_ALL via grammar', async () => {
    const cmd = await parseVoiceCommand('delete everything')
    expect(cmd).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('resolves STYLE_SHAPE color via grammar', async () => {
    const cmd = await parseVoiceCommand('make it orange')
    expect(cmd).toMatchObject({ intent: 'STYLE_SHAPE', color: 'orange' })
  })
})

// ─── 21. CREATE_SHAPE bare-noun fast path ─────────────────────────────────────

describe('CREATE_SHAPE bare-noun fast path', () => {
  it('"circle" → CREATE_SHAPE { shapeType: "circle" }', () => {
    expect(grammar('circle')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"a circle" → CREATE_SHAPE { shapeType: "circle" }', () => {
    expect(grammar('a circle')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"red circle" → CREATE_SHAPE { shapeType: "circle", color: "red" }', () => {
    expect(grammar('red circle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
    })
  })

  it('"circle please" → CREATE_SHAPE { shapeType: "circle" }', () => {
    expect(grammar('circle please')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"new rectangle" → CREATE_SHAPE { shapeType: "rectangle" }', () => {
    expect(grammar('new rectangle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"another star" → CREATE_SHAPE { shapeType: "star" }', () => {
    expect(grammar('another star')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'star' })
  })

  it('"large blue triangle" → CREATE_SHAPE with color and size', () => {
    expect(grammar('large blue triangle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'triangle',
      color: 'blue',
      size: 'large',
    })
  })

  it('"the circle" → CREATE_SHAPE { shapeType: "circle" }', () => {
    expect(grammar('the circle')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })

  it('"one rectangle" → CREATE_SHAPE { shapeType: "rectangle" }', () => {
    expect(grammar('one rectangle')).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'rectangle',
    })
  })

  it('"ok circle" → CREATE_SHAPE { shapeType: "circle" }', () => {
    expect(grammar('ok circle')).toMatchObject({ intent: 'CREATE_SHAPE', shapeType: 'circle' })
  })
})
