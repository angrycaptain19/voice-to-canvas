/**
 * src/commands/parseVoiceCommand.ts
 *
 * Primary entry point for the voice command parsing layer.
 * Returns ShapeCommandBatch (always an array of >= 1 commands).
 *
 * @module
 */

import { ShapeCommandBatchSchema, type ShapeCommandBatch } from '../types'
import { createVoiceError } from '../voice/errors'
import { matchGrammar } from './grammar'
import { llmFallback } from './llmFallback'

export { matchGrammar } from './grammar'
export { llmFallback } from './llmFallback'
export type { ShapeCommand, ShapeCommandBatch } from '../types'

/**
 * Parse a final voice-transcription string into a ShapeCommandBatch.
 */
export async function parseVoiceCommand(transcript: string): Promise<ShapeCommandBatch> {
  const normalised = transcript.trim()

  if (!normalised) {
    throw createVoiceError('PARSE_FAILURE', { rawTranscript: transcript })
  }

  // Fast path: local regex grammar (returns ShapeCommand[] | null)
  const grammarResult = matchGrammar(normalised, transcript)
  if (grammarResult !== null) {
    const validated = ShapeCommandBatchSchema.safeParse(grammarResult)
    if (validated.success) return validated.data
    // Grammar produced invalid object -- fall through to LLM
  }

  // Slow path: LLM fallback
  const llmResult = await llmFallback(normalised)

  if (llmResult !== null) {
    return llmResult
  }

  throw createVoiceError('PARSE_FAILURE', { rawTranscript: transcript })
}
