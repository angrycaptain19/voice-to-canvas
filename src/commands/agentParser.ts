/**
 * src/commands/agentParser.ts
 *
 * Agentic voice parser — replaces the grammar + llmFallback two-step with a
 * single Claude call that receives the full canvas state and returns
 * TldrawAction objects directly via tool use.
 *
 * @module
 */

import Anthropic from '@anthropic-ai/sdk'
import { TldrawActionSchema, type TldrawAction } from '../types/actions'
import { type CanvasStateSnapshot, formatCanvasStateForPrompt } from './canvasState'
import { createVoiceError } from '../voice/errors'

// ---------------------------------------------------------------------------
// Tool schema — mirrors TldrawActionSchema discriminated union
// ---------------------------------------------------------------------------

const SHARED_PROPS = {
  targetId: {
    type: 'string',
    description:
      'Exact id of the shape to operate on (e.g. "shape:abc123"). ' +
      'Prefer this over shapeReference when the id is known from the canvas state.',
  },
  shapeReference: {
    type: 'object',
    description: 'Identifying attributes when the exact id is not known.',
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
}

const PARSE_CANVAS_ACTIONS_TOOL = {
  name: 'parse_canvas_actions',
  description:
    'Parse a voice command transcript into one or more tldraw actions. ' +
    'Return an object with an "actions" array containing all required actions in order.',
  input_schema: {
    type: 'object' as const,
    properties: {
      actions: {
        type: 'array',
        description:
          'Ordered list of tldraw actions. Return all actions needed to fulfil the request.',
        items: {
          oneOf: [
            // CREATE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'CREATE_SHAPE' },
                shapeType: {
                  type: 'string',
                  enum: ['circle', 'ellipse', 'rectangle', 'triangle', 'arrow', 'line', 'star', 'text', 'frame'],
                },
                color: SHARED_PROPS.color,
                size: SHARED_PROPS.size,
                position: SHARED_PROPS.position,
              },
              required: ['type', 'shapeType'],
              additionalProperties: false,
            },
            // MOVE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'MOVE_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
                position: SHARED_PROPS.position,
                dx: { type: 'number', description: 'Relative horizontal delta in pixels.' },
                dy: { type: 'number', description: 'Relative vertical delta in pixels.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // RESIZE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'RESIZE_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
                size: SHARED_PROPS.size,
                factor: { type: 'number', description: 'Scale factor (e.g. 1.5 = 150%).' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // ROTATE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'ROTATE_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
                angle: { type: 'number', description: 'Rotation angle in degrees.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // DELETE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'DELETE_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
              },
              required: ['type'],
              additionalProperties: false,
            },
            // DELETE_ALL
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'DELETE_ALL' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // STYLE_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'STYLE_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
                color: SHARED_PROPS.color,
                fill: {
                  type: 'string',
                  enum: ['none', 'semi', 'solid', 'pattern'],
                  description: 'Fill style.',
                },
                dash: {
                  type: 'string',
                  enum: ['draw', 'solid', 'dashed', 'dotted'],
                  description: 'Stroke/dash style.',
                },
                opacity: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Opacity 0-1.',
                },
                labelSize: {
                  type: 'string',
                  enum: ['s', 'm', 'l', 'xl'],
                  description: 'Label/text size.',
                },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // SELECT_SHAPE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'SELECT_SHAPE' },
                targetId: SHARED_PROPS.targetId,
                shapeReference: SHARED_PROPS.shapeReference,
                shapeType: {
                  type: 'string',
                  enum: ['circle', 'ellipse', 'rectangle', 'triangle', 'arrow', 'line', 'star', 'text', 'frame'],
                },
                color: SHARED_PROPS.color,
              },
              required: ['type'],
              additionalProperties: false,
            },
            // SELECT_ALL
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'SELECT_ALL' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // DESELECT
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'DESELECT' },
                targetId: SHARED_PROPS.targetId,
              },
              required: ['type'],
              additionalProperties: false,
            },
            // UNDO
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'UNDO' },
                steps: { type: 'integer', minimum: 1, description: 'Number of undo steps.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // REDO
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'REDO' },
                steps: { type: 'integer', minimum: 1, description: 'Number of redo steps.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // RECORD_KEYFRAME
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'RECORD_KEYFRAME' },
                timestamp: { type: 'number', minimum: 0, description: 'Timeline timestamp in ms.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // PLAY
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'PLAY' },
                from: { type: 'number', minimum: 0, description: 'Start timestamp in ms.' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // PAUSE
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'PAUSE' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // STOP
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'STOP' },
              },
              required: ['type'],
              additionalProperties: false,
            },
            // SEEK
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'SEEK' },
                timestamp: { type: 'number', minimum: 0, description: 'Timeline timestamp in ms.' },
              },
              required: ['type', 'timestamp'],
              additionalProperties: false,
            },
          ],
        },
        minItems: 0,
      },
    },
    required: ['actions'],
  },
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(canvasStateFormatted: string): string {
  return `You are an agent that controls a tldraw drawing canvas.
The user will speak a command. Your job is to call parse_canvas_actions
with the exact tldraw actions needed to fulfil the request.

Current canvas state:
${canvasStateFormatted}

IMPORTANT:
- When the user refers to "the red circle", "the star", etc., use its exact id
  from the canvas state above (e.g. targetId: "shape:abc123").
- Set targetId to the shape's id string -- do not use shapeReference when you
  already know the id from the canvas state.
- For style commands like "make it solid filled", use STYLE_SHAPE with fill: "solid".
- For "make it transparent", use STYLE_SHAPE with opacity: 0.
- For "make everything 50% transparent" emit one STYLE_SHAPE per shape listed
  in the canvas state, each with opacity: 0.5.
- Multiple actions are fine -- return them all in the actions array in order.
- If the canvas is empty and the command targets an existing shape (e.g.
  "move the circle"), return an empty actions array.
- Only include fields that are relevant to the command; omit the rest.

Shape type mapping:
  "circle" -> shapeType:"circle"
  "oval"/"ellipse" -> shapeType:"ellipse"
  "square"/"box"/"rect"/"rectangle" -> shapeType:"rectangle"
  "triangle" -> shapeType:"triangle"
  "arrow" -> shapeType:"arrow"
  "line" -> shapeType:"line"
  "star" -> shapeType:"star"
  "text"/"text box" -> shapeType:"text"

Color mapping (use the canonical enum value):
  "purple" -> "violet"
  "gray" -> "grey"

Size mapping:
  "tiny"/"small" -> "small"
  "medium"/"normal" -> "medium"
  "big"/"large" -> "large"
  "huge"/"extra large" -> "xl"`
}

// ---------------------------------------------------------------------------
// Lazy Anthropic client
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (_client) return _client

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createVoiceError('LLM_FALLBACK_ERROR', {
      message: 'VITE_ANTHROPIC_API_KEY is not set -- cannot call the agent parser',
    })
  }

  _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  return _client
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a voice transcript into a list of TldrawAction objects using Claude
 * with full canvas context.
 *
 * @param transcript       - Normalised voice transcript from the STT engine.
 * @param canvasSnapshot   - Canvas state snapshot from serializeCanvasState.
 * @returns Validated TldrawAction[]; empty array when nothing could be parsed.
 * @throws {VoiceError} code LLM_FALLBACK_ERROR on missing API key or API failure.
 */
export async function agentParse(
  transcript: string,
  canvasSnapshot: CanvasStateSnapshot,
): Promise<TldrawAction[]> {
  const client = getClient()

  const canvasStateFormatted = formatCanvasStateForPrompt(canvasSnapshot)
  const systemPrompt = buildSystemPrompt(canvasStateFormatted)

  let rawActions: unknown[]
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
        {
          name: PARSE_CANVAS_ACTIONS_TOOL.name,
          description: PARSE_CANVAS_ACTIONS_TOOL.description,
          input_schema: PARSE_CANVAS_ACTIONS_TOOL.input_schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'parse_canvas_actions' },
      messages: [{ role: 'user', content: transcript }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    const input = (toolUse as { type: 'tool_use'; input: unknown } | undefined)?.input ?? null

    if (input === null) return []

    const actionsRaw = (input as { actions?: unknown }).actions
    if (!Array.isArray(actionsRaw)) return []

    rawActions = actionsRaw
  } catch (err) {
    // Re-throw pre-built VoiceErrors as-is
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

  // Validate each action individually -- drop invalid ones, keep valid ones
  const validated: TldrawAction[] = []
  for (const raw of rawActions) {
    const result = TldrawActionSchema.safeParse(raw)
    if (result.success) {
      validated.push(result.data)
    } else {
      console.warn('[agentParser] Dropping invalid action:', raw, result.error.format())
    }
  }

  return validated
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset the cached Anthropic client. For use in unit tests only. */
export function _resetClientForTest(): void {
  _client = null
}
