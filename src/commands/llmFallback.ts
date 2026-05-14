/**
 * src/commands/llmFallback.ts
 *
 * Claude (claude-haiku-4-5) fallback for voice commands that the local grammar
 * cannot parse.  Returns a ShapeCommandBatch (array of one or more commands).
 *
 * Uses Anthropic tool use so the model is forced to return a value that
 * can be validated against ShapeCommandBatchSchema.
 *
 * @module
 */

import Anthropic from '@anthropic-ai/sdk'
import { ShapeCommandBatchSchema, type ShapeCommandBatch } from '../types'
import { createVoiceError } from '../voice/errors'

// ─── Command item properties (shared across tool schema) ──────────────────────

const COMMAND_ITEM_PROPERTIES = {
  intent: {
    type: 'string',
    enum: [
      'CREATE_SHAPE', 'MOVE_SHAPE', 'RESIZE_SHAPE', 'ROTATE_SHAPE',
      'DELETE_SHAPE', 'DELETE_ALL', 'STYLE_SHAPE', 'SELECT_SHAPE',
      'SELECT_ALL', 'DESELECT', 'UNDO', 'REDO', 'RECORD_KEYFRAME',
      'PLAY', 'PAUSE', 'STOP', 'SEEK',
    ],
    description: 'The voice command intent.',
  },
  shapeType: {
    type: 'string',
    enum: ['circle', 'ellipse', 'rectangle', 'triangle', 'arrow', 'line', 'star', 'text', 'frame'],
    description: 'Shape type for CREATE_SHAPE / SELECT_SHAPE.',
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
    enum: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
    description: 'Named canvas position.',
  },
  targetId: { type: 'string', description: 'ID of the shape to operate on.' },
  dx: { type: 'number', description: 'Relative horizontal delta in pixels.' },
  dy: { type: 'number', description: 'Relative vertical delta in pixels.' },
  angle: { type: 'number', description: 'Rotation angle in degrees.' },
  factor: { type: 'number', description: 'Scale factor for RESIZE_SHAPE.' },
  steps: { type: 'number', description: 'Number of undo/redo steps.' },
  timestamp: { type: 'number', description: 'Timeline timestamp in milliseconds.' },
  shapeReference: {
    type: 'object',
    description: 'Discriminator fields identifying which existing shape the command targets.',
    properties: {
      shapeType: {
        type: 'string',
        enum: ['circle', 'ellipse', 'rectangle', 'triangle', 'arrow', 'line', 'star', 'text', 'frame'],
      },
      color: {
        type: 'string',
        enum: ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black', 'white'],
      },
      size: { type: 'string', enum: ['small', 'medium', 'large', 'xl'] },
      ordinal: {
        oneOf: [
          { type: 'string', enum: ['first', 'last', 'latest'] },
          { type: 'integer', minimum: 1 },
        ],
      },
      label: { type: 'string' },
      spatial: {
        type: 'string',
        enum: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
      },
      useSelection: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  rawTranscript: {
    type: 'string',
    description: 'Always include the original transcript verbatim.',
  },
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const PARSE_COMMANDS_FUNCTION = {
  name: 'parse_voice_commands',
  description:
    'Parse a voice command transcript into one or more structured canvas actions. ' +
    'Return an object with a "commands" array containing all parsed actions in order.',
  parameters: {
    type: 'object',
    properties: {
      commands: {
        type: 'array',
        description:
          'Ordered list of canvas commands parsed from the transcript. ' +
          'Always include at least one command. ' +
          'For multi-shape utterances include one entry per shape.',
        items: {
          type: 'object',
          properties: COMMAND_ITEM_PROPERTIES,
          required: ['intent', 'rawTranscript'],
        },
        minItems: 1,
      },
    },
    required: ['commands'],
  },
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a voice-command parser for a drawing canvas application.
Convert the user's voice transcript into structured canvas commands by calling
parse_voice_commands.

If the user asks for multiple shapes or actions, return all of them in the
\`commands\` array in order. For example:
  "draw a red circle and a blue square"
    -> commands: [
         { intent: "CREATE_SHAPE", shapeType: "circle", color: "red", rawTranscript: "..." },
         { intent: "CREATE_SHAPE", shapeType: "rectangle", color: "blue", rawTranscript: "..." }
       ]
  "add three arrows"
    -> commands: [
         { intent: "CREATE_SHAPE", shapeType: "arrow", rawTranscript: "..." },
         { intent: "CREATE_SHAPE", shapeType: "arrow", rawTranscript: "..." },
         { intent: "CREATE_SHAPE", shapeType: "arrow", rawTranscript: "..." }
       ]

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

Shape reference (shapeReference) -- use for MOVE_SHAPE, DELETE_SHAPE, STYLE_SHAPE, ROTATE_SHAPE, RESIZE_SHAPE:
  When the user refers to an existing shape by its properties, populate shapeReference with
  those identifying fields so the resolver can find the right shape.

Rules:
- Only include fields that are explicitly mentioned in the command.
- Always set rawTranscript to the original transcript string (same value for every command in the batch).
- For undo/redo: extract the number of steps if mentioned, otherwise omit steps.
- "add three arrows" means three separate arrow commands in the commands array.`

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
 * Call Claude (claude-haiku-4-5) with tool use to parse `transcript` into a
 * `ShapeCommandBatch` (array of one or more commands).
 *
 * @param transcript - Normalised voice transcript.
 * @returns A Zod-validated ShapeCommandBatch, or null on schema mismatch.
 * @throws {VoiceError} code LLM_FALLBACK_ERROR on API failure.
 */
export async function llmFallback(transcript: string): Promise<ShapeCommandBatch | null> {
  const client = getClient()

  let raw: unknown
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: PARSE_COMMANDS_FUNCTION.name,
          description: PARSE_COMMANDS_FUNCTION.description,
          input_schema: PARSE_COMMANDS_FUNCTION.parameters as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'parse_voice_commands' },
      messages: [{ role: 'user', content: transcript }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    const input = (toolUse as { type: 'tool_use'; input: unknown } | undefined)?.input ?? null

    if (input === null) return null

    // Tool returns { commands: [...] } — extract the array
    raw = (input as { commands?: unknown }).commands ?? null
    if (raw === null) return null
  } catch (err) {
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

  const result = ShapeCommandBatchSchema.safeParse(raw)
  return result.success ? result.data : null
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

export function _resetClientForTest(): void {
  _client = null
}
