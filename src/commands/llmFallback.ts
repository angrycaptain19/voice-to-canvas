/**
 * src/commands/llmFallback.ts
 *
 * Claude (claude-haiku-3-5) fallback for voice commands that the local grammar
 * cannot parse.
 *
 * Uses Anthropic tool use so the model is forced to return a value that
 * can be validated against ShapeCommandSchema. The response is validated through
 * Zod before being returned — the function never emits unvalidated data.
 *
 * Environment:
 *   VITE_ANTHROPIC_API_KEY — client-side key (Vite exposes VITE_* vars to the
 *                            browser bundle; use a server proxy in production)
 *
 * Error handling:
 *   • Network / API errors  -> throws createVoiceError('LLM_FALLBACK_ERROR')
 *   • Schema parse failure  -> returns null (caller falls through to PARSE_FAILURE)
 *
 * @module
 */

import Anthropic from '@anthropic-ai/sdk'
import { ShapeCommandSchema, type ShapeCommand } from '../types'
import { createVoiceError } from '../voice/errors'

// ─── JSON Schema for the tool definition ──────────────────────────────────────

const PARSE_COMMAND_FUNCTION = {
  name: 'parse_voice_command',
  description:
    'Parse a voice command transcript into a structured canvas action. ' +
    'Return an object with the correct intent and all relevant parameters.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [
          'CREATE_SHAPE',
          'MOVE_SHAPE',
          'RESIZE_SHAPE',
          'ROTATE_SHAPE',
          'DELETE_SHAPE',
          'DELETE_ALL',
          'STYLE_SHAPE',
          'SELECT_SHAPE',
          'SELECT_ALL',
          'DESELECT',
          'UNDO',
          'REDO',
          'RECORD_KEYFRAME',
          'PLAY',
          'PAUSE',
          'STOP',
          'SEEK',
        ],
        description: 'The voice command intent.',
      },
      shapeType: {
        type: 'string',
        enum: ['circle', 'ellipse', 'rectangle', 'triangle', 'arrow', 'line', 'star', 'text', 'frame'],
        description: 'Shape type for CREATE_SHAPE / SELECT_SHAPE / DELETE_SHAPE.',
      },
      color: {
        type: 'string',
        enum: ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black', 'white'],
        description: 'Shape color. Map "purple" to "violet", "gray" to "grey".',
      },
      size: {
        type: 'string',
        enum: ['small', 'medium', 'large', 'xl'],
        description: 'Logical size bucket.',
      },
      position: {
        type: 'string',
        enum: [
          'center', 'top', 'bottom', 'left', 'right',
          'top-left', 'top-right', 'bottom-left', 'bottom-right',
        ],
        description: 'Named canvas position.',
      },
      targetId: {
        type: 'string',
        description: 'ID of the shape to operate on.',
      },
      dx: { type: 'number', description: 'Relative horizontal delta in pixels.' },
      dy: { type: 'number', description: 'Relative vertical delta in pixels.' },
      angle: {
        type: 'number',
        description: 'Rotation angle in degrees (positive = clockwise, negative = counter-clockwise).',
      },
      factor: {
        type: 'number',
        description: 'Scale factor for RESIZE_SHAPE (e.g. 1.5 = 150%).',
      },
      steps: {
        type: 'number',
        description: 'Number of undo/redo steps. Default 1.',
      },
      timestamp: {
        type: 'number',
        description: 'Timeline timestamp in milliseconds for SEEK / RECORD_KEYFRAME / PLAY.',
      },
      rawTranscript: {
        type: 'string',
        description: 'Always include the original transcript verbatim.',
      },
    },
    required: ['intent', 'rawTranscript'],
  },
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a voice-command parser for a drawing canvas application.
Convert the user's voice transcript into a structured canvas command by calling
parse_voice_command.

Shape type mapping:
  "circle" -> shapeType:"circle"
  "oval" or "ellipse" -> shapeType:"ellipse"
  "square", "box", "rect" or "rectangle" -> shapeType:"rectangle"
  "triangle" -> shapeType:"triangle"
  "arrow" -> shapeType:"arrow"
  "line" -> shapeType:"line"
  "star" -> shapeType:"star"
  "text" or "text box" -> shapeType:"text"

Color mapping (use the canonical enum value):
  "purple" -> "violet"
  "gray" -> "grey"

Position mapping:
  "upper left" -> "top-left"  |  "upper right" -> "top-right"
  "lower left" -> "bottom-left" | "lower right" -> "bottom-right"
  "middle" -> "center"

Rules:
- Only include fields that are explicitly mentioned in the command.
- Always set rawTranscript to the original transcript string.
- For undo/redo: extract the number of steps if mentioned, otherwise omit steps.`

// ─── Lazy Anthropic client ────────────────────────────────────────────────────

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (_client) return _client

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createVoiceError('LLM_FALLBACK_ERROR', {
      message: 'VITE_ANTHROPIC_API_KEY is not set — cannot call the LLM fallback',
    })
  }

  _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  return _client
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call Claude (claude-haiku-3-5) with tool use to parse `transcript` into a
 * `ShapeCommand`.
 *
 * @param transcript - Normalised voice transcript.
 * @returns A Zod-validated `ShapeCommand`, or `null` when the model's response
 *          doesn't match the schema.
 * @throws {VoiceError} code `LLM_FALLBACK_ERROR` on API / network failure.
 */
export async function llmFallback(transcript: string): Promise<ShapeCommand | null> {
  const client = getClient()

  let raw: unknown
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: PARSE_COMMAND_FUNCTION.name,
          description: PARSE_COMMAND_FUNCTION.description,
          input_schema: PARSE_COMMAND_FUNCTION.parameters as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'parse_voice_command' },
      messages: [{ role: 'user', content: transcript }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    raw = (toolUse as { type: 'tool_use'; input: unknown } | undefined)?.input ?? null

    if (raw === null) return null
  } catch (err) {
    // Re-throw VoiceErrors from getClient() as-is
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'LLM_FALLBACK_ERROR'
    ) {
      throw err
    }
    throw createVoiceError('LLM_FALLBACK_ERROR', {
      message: err instanceof Error ? err.message : 'Anthropic request failed',
    })
  }

  // Validate against the shared Zod schema — never return unvalidated data.
  const result = ShapeCommandSchema.safeParse(raw)
  return result.success ? result.data : null
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Reset the cached Anthropic client. Only exported for use in test files.
 * @internal
 */
export function _resetClientForTest(): void {
  _client = null
}
