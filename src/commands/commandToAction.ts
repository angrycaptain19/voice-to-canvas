/**
 * src/commands/commandToAction.ts
 *
 * Adapter that converts the parser's `ShapeCommand` (which uses `intent` as
 * the discriminant) into the executor's `TldrawAction` (which uses `type`).
 *
 * Both types share the same enum values and optional payload fields, so the
 * mapping is a straightforward rename of `intent` → `type`.
 *
 * @module
 */

import type { ShapeCommand, TldrawAction } from '../types'

/**
 * Convert a parsed `ShapeCommand` into a `TldrawAction` that
 * `executeTldrawAction` can consume.
 *
 * @param cmd - Validated ShapeCommand returned by `parseVoiceCommand`.
 * @returns A TldrawAction with the same payload fields.
 *
 * @example
 * ```ts
 * const cmd  = await parseVoiceCommand('draw a red circle')
 * const act  = commandToAction(cmd)
 * executeTldrawAction(editor, act)
 * ```
 */
export function commandToAction(cmd: ShapeCommand): TldrawAction {
  // `intent` and `type` use the same discriminant values; spread the rest of
  // the (optional) payload fields directly.
  return {
    type: cmd.intent,
    // Spread all optional payload fields — the discriminated-union schemas on
    // TldrawAction allow the extra optional keys to be present.
    ...(cmd.shapeType !== undefined && { shapeType: cmd.shapeType }),
    ...(cmd.color !== undefined && { color: cmd.color }),
    ...(cmd.size !== undefined && { size: cmd.size }),
    ...(cmd.position !== undefined && { position: cmd.position }),
    ...(cmd.targetId !== undefined && { targetId: cmd.targetId }),
    ...(cmd.dx !== undefined && { dx: cmd.dx }),
    ...(cmd.dy !== undefined && { dy: cmd.dy }),
    ...(cmd.angle !== undefined && { angle: cmd.angle }),
    ...(cmd.factor !== undefined && { factor: cmd.factor }),
    ...(cmd.steps !== undefined && { steps: cmd.steps }),
    ...(cmd.timestamp !== undefined && { timestamp: cmd.timestamp }),
    ...(cmd.shapeReference !== undefined && { shapeReference: cmd.shapeReference }),
  } as TldrawAction
}
