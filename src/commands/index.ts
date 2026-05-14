/**
 * src/commands/index.ts
 *
 * Public API surface for the voice command parsing layer.
 *
 * Primary usage:
 * ```ts
 * import { parseVoiceCommand } from 'src/commands'
 *
 * const action = await parseVoiceCommand('draw a red circle in the top-left')
 * ```
 *
 * Advanced usage (e.g. unit tests that only exercise the grammar):
 * ```ts
 * import { matchGrammar } from 'src/commands'
 *
 * const cmd = matchGrammar('undo', 'undo')
 * ```
 */

export { parseVoiceCommand, matchGrammar, llmFallback } from './parseVoiceCommand'
export type { ShapeCommand } from '../types'
