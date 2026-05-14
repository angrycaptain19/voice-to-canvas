/**
 * src/commands/parseVoiceCommand.ts
 *
 * Primary entry point for the voice command parsing layer.
 *
 * ## Architecture
 *
 * ```
 * transcript (string)
 *       |
 *       v
 * +---------------------------+
 * |  matchGrammar()           |  < 5 ms -- local regex fast path
 * +---------------------------+
 *       | null (unrecognised pattern)
 *       v
 * +---------------------------+
 * |  llmFallback()            |  ~200-400 ms -- GPT-4o-mini function-calling
 * +---------------------------+
 *       | null (model could not parse)
 *       v
 * throws VoiceError('PARSE_FAILURE')
 * ```
 *
 * Every result is validated against `ShapeCommandSchema` before being returned;
 * this function never emits unvalidated data.
 *
 * ## Error handling
 *
 * | Scenario                         | Outcome                                         |
 * |----------------------------------|-------------------------------------------------|
 * | Grammar matches                  | Returns ShapeCommand (no network call)          |
 * | Grammar misses, LLM succeeds     | Returns ShapeCommand (GPT-4o-mini call)         |
 * | Grammar misses, LLM API failure  | Throws VoiceError LLM_FALLBACK_ERROR            |
 * | Grammar misses, LLM can't parse  | Throws VoiceError PARSE_FAILURE                 |
 * | Empty transcript                 | Throws VoiceError PARSE_FAILURE                 |
 *
 * @module
 */

import { ShapeCommandSchema, type ShapeCommand } from '../types'
import { createVoiceError } from '../voice/errors'
import { matchGrammar } from './grammar'
import { llmFallback } from './llmFallback'

// Re-export sub-modules so callers can import everything from this file.
export { matchGrammar } from './grammar'
export { llmFallback } from './llmFallback'
export type { ShapeCommand } from '../types'

/**
 * Parse a final voice-transcription string into a structured `ShapeCommand`.
 *
 * ```ts
 * const cmd = await parseVoiceCommand('draw a red circle in the top-left')
 * // { intent: 'CREATE_SHAPE', shapeType: 'circle', color: 'red', position: 'top-left',
 * //   rawTranscript: 'draw a red circle in the top-left' }
 *
 * const cmd2 = await parseVoiceCommand('undo')
 * // { intent: 'UNDO', steps: 1, rawTranscript: 'undo' }
 * ```
 *
 * @param transcript - Raw text returned by the STT engine (final result only,
 *   not interim/partial results).
 * @returns A promise that resolves to a Zod-validated `ShapeCommand`.
 *
 * @throws {VoiceError} `PARSE_FAILURE`  -- transcript was empty or completely
 *   unrecognisable even after the LLM fallback.
 * @throws {VoiceError} `LLM_FALLBACK_ERROR` -- the OpenAI API call failed
 *   (network error, quota exceeded, misconfigured key, etc.).
 */
export async function parseVoiceCommand(transcript: string): Promise<ShapeCommand> {
  const normalised = transcript.trim()

  if (!normalised) {
    throw createVoiceError('PARSE_FAILURE', { rawTranscript: transcript })
  }

  // Fast path: local regex grammar
  const grammarResult = matchGrammar(normalised, transcript)
  if (grammarResult !== null) {
    // Defensive: validate the grammar output before returning
    const validated = ShapeCommandSchema.safeParse(grammarResult)
    if (validated.success) return validated.data
    // Grammar produced an invalid object -- fall through to LLM
  }

  // Slow path: LLM fallback (GPT-4o-mini)
  // llmFallback() throws VoiceError('LLM_FALLBACK_ERROR') on API failure.
  const llmResult = await llmFallback(normalised)

  if (llmResult !== null) {
    return llmResult
  }

  // Both layers failed to parse the transcript.
  throw createVoiceError('PARSE_FAILURE', { rawTranscript: transcript })
}
