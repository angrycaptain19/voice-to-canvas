/**
 * src/commands/commandToAction.test.ts
 *
 * Verifies the ShapeCommand → TldrawAction adapter converts the `intent`
 * discriminant to `type` and propagates all optional payload fields.
 */

import { describe, expect, it } from 'vitest'
import { commandToAction } from './commandToAction'
import type { ShapeCommand } from '../types'

describe('commandToAction', () => {
  it('maps intent → type for CREATE_SHAPE with all payload fields', () => {
    const cmd: ShapeCommand = {
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
      size: 'large',
      position: 'center',
      rawTranscript: 'draw a large red circle in the center',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({
      type: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'red',
      size: 'large',
      position: 'center',
    })
  })

  it('maps UNDO with steps', () => {
    const cmd: ShapeCommand = {
      intent: 'UNDO',
      steps: 3,
      rawTranscript: 'undo three times',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'UNDO', steps: 3 })
  })

  it('maps REDO without steps', () => {
    const cmd: ShapeCommand = {
      intent: 'REDO',
      rawTranscript: 'redo',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'REDO' })
  })

  it('maps DELETE_ALL', () => {
    const cmd: ShapeCommand = {
      intent: 'DELETE_ALL',
      rawTranscript: 'clear the canvas',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'DELETE_ALL' })
  })

  it('maps MOVE_SHAPE with dx/dy', () => {
    const cmd: ShapeCommand = {
      intent: 'MOVE_SHAPE',
      dx: 100,
      dy: -50,
      rawTranscript: 'move it right and up',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'MOVE_SHAPE', dx: 100, dy: -50 })
  })

  it('maps MOVE_SHAPE with named position', () => {
    const cmd: ShapeCommand = {
      intent: 'MOVE_SHAPE',
      position: 'top-left',
      rawTranscript: 'move to the top left',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'MOVE_SHAPE', position: 'top-left' })
  })

  it('maps RESIZE_SHAPE with factor', () => {
    const cmd: ShapeCommand = {
      intent: 'RESIZE_SHAPE',
      factor: 1.5,
      rawTranscript: 'make it one and a half times bigger',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'RESIZE_SHAPE', factor: 1.5 })
  })

  it('maps ROTATE_SHAPE with angle', () => {
    const cmd: ShapeCommand = {
      intent: 'ROTATE_SHAPE',
      angle: 45,
      rawTranscript: 'rotate 45 degrees',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'ROTATE_SHAPE', angle: 45 })
  })

  it('maps SELECT_SHAPE with shapeType and color filters', () => {
    const cmd: ShapeCommand = {
      intent: 'SELECT_SHAPE',
      shapeType: 'rectangle',
      color: 'blue',
      rawTranscript: 'select the blue rectangles',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'SELECT_SHAPE', shapeType: 'rectangle', color: 'blue' })
  })

  it('maps STYLE_SHAPE with targetId', () => {
    const cmd: ShapeCommand = {
      intent: 'STYLE_SHAPE',
      color: 'green',
      targetId: 'shape:abc123',
      rawTranscript: 'make it green',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'STYLE_SHAPE', color: 'green', targetId: 'shape:abc123' })
  })

  it('maps SELECT_ALL', () => {
    const cmd: ShapeCommand = {
      intent: 'SELECT_ALL',
      rawTranscript: 'select everything',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'SELECT_ALL' })
  })

  it('maps DESELECT', () => {
    const cmd: ShapeCommand = {
      intent: 'DESELECT',
      rawTranscript: 'deselect',
    }
    const action = commandToAction(cmd)
    expect(action).toEqual({ type: 'DESELECT' })
  })

  it('does not include rawTranscript in the output', () => {
    const cmd: ShapeCommand = {
      intent: 'UNDO',
      rawTranscript: 'undo',
    }
    const action = commandToAction(cmd)
    expect(action).not.toHaveProperty('rawTranscript')
  })

  it('does not include undefined optional fields in the output', () => {
    const cmd: ShapeCommand = {
      intent: 'CREATE_SHAPE',
      shapeType: 'star',
      rawTranscript: 'draw a star',
    }
    const action = commandToAction(cmd)
    // Only type and shapeType should be present; no undefined keys
    expect(Object.keys(action).sort()).toEqual(['shapeType', 'type'])
  })
})
