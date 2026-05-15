/**
 * src/commands/__tests__/agentParser.test.ts
 *
 * Unit tests for agentParse() in agentParser.ts.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentParse, _resetClientForTest } from '../agentParser'
import type { CanvasStateSnapshot } from '../canvasState'

// ---------------------------------------------------------------------------
// Mock Anthropic
// ---------------------------------------------------------------------------

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic(_opts: unknown) {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

// ---------------------------------------------------------------------------
// Snapshot fixtures
// ---------------------------------------------------------------------------

const EMPTY_SNAPSHOT: CanvasStateSnapshot = {
  shapeCount: 0,
  shapes: [],
  viewportCenter: { x: 600, y: 400 },
}

const STAR_SNAPSHOT: CanvasStateSnapshot = {
  shapeCount: 1,
  shapes: [
    {
      id: 'shape:star1',
      type: 'geo',
      geo: 'star',
      color: 'yellow',
      fill: 'none',
      dash: 'draw',
      x: 100,
      y: 100,
      w: 150,
      h: 150,
      selected: false,
    },
  ],
  viewportCenter: { x: 600, y: 400 },
}

const RED_CIRCLE_SNAPSHOT: CanvasStateSnapshot = {
  shapeCount: 1,
  shapes: [
    {
      id: 'shape:circle1',
      type: 'geo',
      geo: 'ellipse',
      color: 'red',
      fill: 'none',
      dash: 'draw',
      x: 300,
      y: 200,
      w: 100,
      h: 100,
      selected: false,
    },
  ],
  viewportCenter: { x: 600, y: 400 },
}

const THREE_SHAPE_SNAPSHOT: CanvasStateSnapshot = {
  shapeCount: 3,
  shapes: [
    {
      id: 'shape:s1',
      type: 'geo',
      geo: 'rectangle',
      color: 'blue',
      fill: 'solid',
      dash: 'draw',
      x: 50,
      y: 50,
      w: 200,
      h: 100,
      selected: false,
    },
    {
      id: 'shape:s2',
      type: 'geo',
      geo: 'ellipse',
      color: 'red',
      fill: 'none',
      dash: 'draw',
      x: 300,
      y: 200,
      w: 120,
      h: 120,
      selected: false,
    },
    {
      id: 'shape:s3',
      type: 'geo',
      geo: 'star',
      color: 'yellow',
      fill: 'none',
      dash: 'draw',
      x: 500,
      y: 100,
      w: 80,
      h: 80,
      selected: false,
    },
  ],
  viewportCenter: { x: 600, y: 400 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolUseResponse(actions: unknown[]) {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'parse_canvas_actions',
        input: { actions },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentParse()', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-ant-test-mock-key')
    _resetClientForTest()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    _resetClientForTest()
  })

  // Acceptance criteria

  it('AC1: "make the star solid filled" -> STYLE_SHAPE with star id and fill:solid', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:star1', fill: 'solid' },
      ]),
    )

    const result = await agentParse('make the star solid filled', STAR_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'STYLE_SHAPE',
      targetId: 'shape:star1',
      fill: 'solid',
    })
  })

  it('AC2: "move the red circle to the top" -> MOVE_SHAPE with circle id and position:top', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'MOVE_SHAPE', targetId: 'shape:circle1', position: 'top' },
      ]),
    )

    const result = await agentParse('move the red circle to the top', RED_CIRCLE_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'MOVE_SHAPE',
      targetId: 'shape:circle1',
      position: 'top',
    })
  })

  it('AC3: "draw a big blue rectangle" -> CREATE_SHAPE with shapeType:rectangle', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'CREATE_SHAPE', shapeType: 'rectangle', color: 'blue', size: 'large' },
      ]),
    )

    const result = await agentParse('draw a big blue rectangle', EMPTY_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'CREATE_SHAPE',
      shapeType: 'rectangle',
      color: 'blue',
      size: 'large',
    })
  })

  it('AC4: "make everything 50% transparent" with 3 shapes -> 3 STYLE_SHAPE actions', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:s1', opacity: 0.5 },
        { type: 'STYLE_SHAPE', targetId: 'shape:s2', opacity: 0.5 },
        { type: 'STYLE_SHAPE', targetId: 'shape:s3', opacity: 0.5 },
      ]),
    )

    const result = await agentParse('make everything 50% transparent', THREE_SHAPE_SNAPSHOT)

    expect(result).toHaveLength(3)
    for (const action of result) {
      expect(action).toMatchObject({ type: 'STYLE_SHAPE', opacity: 0.5 })
    }
    const ids = result.map(a => (a as { targetId?: string }).targetId)
    expect(ids).toContain('shape:s1')
    expect(ids).toContain('shape:s2')
    expect(ids).toContain('shape:s3')
  })

  it('AC5: empty canvas + "move the circle" -> returns []', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([]))

    const result = await agentParse('move the circle', EMPTY_SNAPSHOT)

    expect(result).toEqual([])
  })

  // Validation / error handling

  it('partial validation failure -> drops invalid actions, keeps valid ones', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:star1', fill: 'solid' },
        { type: 'NOT_A_REAL_TYPE', targetId: 'shape:star1' },
        { type: 'DELETE_ALL' },
      ]),
    )

    const result = await agentParse('some command', STAR_SNAPSHOT)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'STYLE_SHAPE' })
    expect(result[1]).toMatchObject({ type: 'DELETE_ALL' })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[agentParser]'),
      expect.anything(),
      expect.anything(),
    )

    warnSpy.mockRestore()
  })

  it('all actions invalid -> returns []', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'TOTALLY_FAKE', targetId: 'x' },
        { type: 'ANOTHER_FAKE' },
      ]),
    )

    const result = await agentParse('gibberish', STAR_SNAPSHOT)
    expect(result).toEqual([])
  })

  it('tool use returns no tool_use block -> returns []', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    })

    const result = await agentParse('some command', EMPTY_SNAPSHOT)
    expect(result).toEqual([])
  })

  it('tool use returns empty content array -> returns []', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })

    const result = await agentParse('some command', EMPTY_SNAPSHOT)
    expect(result).toEqual([])
  })

  it('actions field is not an array -> returns []', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_canvas_actions',
          input: { actions: 'not-an-array' },
        },
      ],
    })

    const result = await agentParse('some command', EMPTY_SNAPSHOT)
    expect(result).toEqual([])
  })

  // Error handling

  it('VITE_ANTHROPIC_API_KEY not set -> throws VoiceError with LLM_FALLBACK_ERROR', async () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '')
    _resetClientForTest()

    await expect(agentParse('draw a circle', EMPTY_SNAPSHOT)).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })

  it('API network error -> throws VoiceError with LLM_FALLBACK_ERROR', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network timeout'))

    await expect(agentParse('draw a circle', EMPTY_SNAPSHOT)).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
      message: 'Network timeout',
    })
  })

  it('API throws a pre-built VoiceError -> re-throws it as-is', async () => {
    const voiceError = { code: 'LLM_FALLBACK_ERROR', message: 'Pre-built error' }
    mockCreate.mockRejectedValueOnce(voiceError)

    await expect(agentParse('draw a circle', EMPTY_SNAPSHOT)).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
      message: 'Pre-built error',
    })
  })

  // Various action types

  it('DELETE_ALL action -> returned as-is', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'DELETE_ALL' }]))

    const result = await agentParse('clear the canvas', STAR_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'DELETE_ALL' })
  })

  it('UNDO with steps -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'UNDO', steps: 3 }]))

    const result = await agentParse('undo three times', EMPTY_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'UNDO', steps: 3 })
  })

  it('SELECT_ALL -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'SELECT_ALL' }]))

    const result = await agentParse('select everything', THREE_SHAPE_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'SELECT_ALL' })
  })

  it('STYLE_SHAPE with dash field -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:star1', dash: 'dashed' },
      ]),
    )

    const result = await agentParse('make the star dashed', STAR_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'STYLE_SHAPE', targetId: 'shape:star1', dash: 'dashed' })
  })

  it('STYLE_SHAPE with opacity:0 -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:circle1', opacity: 0 },
      ]),
    )

    const result = await agentParse('make the circle transparent', RED_CIRCLE_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'STYLE_SHAPE', targetId: 'shape:circle1', opacity: 0 })
  })

  it('STYLE_SHAPE with labelSize -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'STYLE_SHAPE', targetId: 'shape:star1', labelSize: 'xl' },
      ]),
    )

    const result = await agentParse('make the star label extra large', STAR_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'STYLE_SHAPE', targetId: 'shape:star1', labelSize: 'xl' })
  })

  it('RESIZE_SHAPE with factor -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'RESIZE_SHAPE', targetId: 'shape:star1', factor: 2 },
      ]),
    )

    const result = await agentParse('double the size of the star', STAR_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'RESIZE_SHAPE', targetId: 'shape:star1', factor: 2 })
  })

  it('ROTATE_SHAPE with angle -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'ROTATE_SHAPE', targetId: 'shape:circle1', angle: 45 },
      ]),
    )

    const result = await agentParse('rotate the circle 45 degrees', RED_CIRCLE_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'ROTATE_SHAPE', targetId: 'shape:circle1', angle: 45 })
  })

  it('SEEK action with timestamp -> returned correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([{ type: 'SEEK', timestamp: 3000 }]),
    )

    const result = await agentParse('go to 3 seconds', EMPTY_SNAPSHOT)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'SEEK', timestamp: 3000 })
  })

  it('multiple actions in a batch -> all returned in order', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { type: 'CREATE_SHAPE', shapeType: 'circle', color: 'red' },
        { type: 'CREATE_SHAPE', shapeType: 'rectangle', color: 'blue' },
      ]),
    )

    const result = await agentParse('draw a red circle and a blue rectangle', EMPTY_SNAPSHOT)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'CREATE_SHAPE', shapeType: 'circle', color: 'red' })
    expect(result[1]).toMatchObject({ type: 'CREATE_SHAPE', shapeType: 'rectangle', color: 'blue' })
  })

  it('passes canvas state to Claude so it can use shape ids', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'DELETE_ALL' }]))

    await agentParse('delete everything', THREE_SHAPE_SNAPSHOT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('shape:s1')
    expect(callArgs.system).toContain('shape:s2')
    expect(callArgs.system).toContain('shape:s3')
  })

  it('sends the transcript as the user message', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'UNDO' }]))

    const transcript = 'please undo my last action'
    await agentParse(transcript, EMPTY_SNAPSHOT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0]).toMatchObject({ role: 'user', content: transcript })
  })

  it('forces tool_choice to parse_canvas_actions', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'UNDO' }]))

    await agentParse('undo', EMPTY_SNAPSHOT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.tool_choice).toMatchObject({ type: 'tool', name: 'parse_canvas_actions' })
  })

  it('uses model claude-haiku-4-5', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse([{ type: 'UNDO' }]))

    await agentParse('undo', EMPTY_SNAPSHOT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('claude-haiku-4-5')
  })
})
