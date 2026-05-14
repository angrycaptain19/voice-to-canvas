/**
 * src/commands/__tests__/llm-fallback.test.ts
 *
 * Dedicated tests for the LLM fallback path in llmFallback().
 *
 * Strategy:
 *   - vi.mock('@anthropic-ai/sdk') provides a constructor mock whose
 *     `.messages.create` is controlled via `mockCreate`.
 *   - vi.stubEnv sets VITE_ANTHROPIC_API_KEY so getClient() succeeds.
 *   - _resetClientForTest() clears the module-level _client cache between tests
 *     WITHOUT needing vi.resetModules() (which breaks the mock registry).
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { llmFallback, _resetClientForTest } from '../llmFallback'

// ---------------------------------------------------------------------------
// Mock Anthropic — must be a proper constructor (not an arrow function)
// ---------------------------------------------------------------------------

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  // Use a real function (not arrow) so `new MockAnthropic()` works
  function MockAnthropic(_opts: unknown) {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('llmFallback()', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    // Set the API key so getClient() succeeds
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'sk-ant-test-mock-key')
    // Clear the cached _client so getClient() re-runs with the new env
    _resetClientForTest()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    _resetClientForTest()
  })

  it('successful LLM response → returns Zod-validated ShapeCommand', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'CREATE_SHAPE',
              shapeType: 'circle',
              color: 'blue',
              rawTranscript: 'please draw a wobbly blue circle',
            }],
          },
        },
      ],
    })

    const result = await llmFallback('please draw a wobbly blue circle')
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(true)
    expect(result![0]).toMatchObject({
      intent: 'CREATE_SHAPE',
      shapeType: 'circle',
      color: 'blue',
      rawTranscript: 'please draw a wobbly blue circle',
    })
  })

  it('LLM returns DELETE_ALL intent → returns ShapeCommand with correct intent', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'DELETE_ALL',
              rawTranscript: 'wipe the canvas',
            }],
          },
        },
      ],
    })

    const result = await llmFallback('wipe the canvas')
    expect(result).not.toBeNull()
    expect(result![0]).toMatchObject({ intent: 'DELETE_ALL' })
  })

  it('LLM API throws network error → throws LLM_FALLBACK_ERROR', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network timeout'))

    await expect(llmFallback('some unknown command')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })

  it('LLM response has invalid intent (Zod validation fails) → returns null', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'NOT_A_REAL_INTENT',
              rawTranscript: 'something weird',
            }],
          },
        },
      ],
    })

    const result = await llmFallback('something weird')
    expect(result).toBeNull()
  })

  it('LLM response missing required rawTranscript → returns null', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'CREATE_SHAPE',
              shapeType: 'circle',
              // rawTranscript intentionally omitted — Zod will reject
            }],
          },
        },
      ],
    })

    const result = await llmFallback('draw something')
    expect(result).toBeNull()
  })

  it('LLM returns no tool_use block → returns null', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    })

    const result = await llmFallback('hmm what')
    expect(result).toBeNull()
  })

  it('LLM returns empty content array → returns null', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })

    const result = await llmFallback('any command')
    expect(result).toBeNull()
  })

  it('LLM returns UNDO intent with steps → returns validated UNDO command', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'UNDO',
              steps: 3,
              rawTranscript: 'go back three times',
            }],
          },
        },
      ],
    })

    const result = await llmFallback('go back three times')
    expect(result).not.toBeNull()
    expect(result![0]).toMatchObject({ intent: 'UNDO', steps: 3 })
  })

  it('LLM returns STYLE_SHAPE with violet color → color field is violet', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'parse_voice_commands',
          input: {
            commands: [{
              intent: 'STYLE_SHAPE',
              color: 'violet',
              rawTranscript: 'make it purple',
            }],
          },
        },
      ],
    })

    const result = await llmFallback('make it purple')
    expect(result).not.toBeNull()
    expect(result![0]).toMatchObject({ intent: 'STYLE_SHAPE', color: 'violet' })
  })

  it('VITE_ANTHROPIC_API_KEY not set → throws LLM_FALLBACK_ERROR', async () => {
    // Override the env to be empty and reset the cached client
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '')
    _resetClientForTest()

    await expect(llmFallback('any command')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })
})

  it('client.create throws a VoiceError-like object → re-throws it as-is (line 201 branch)', async () => {
    // Simulate a VoiceError object being thrown from within client.create
    // (e.g., if the mock itself throws a pre-built VoiceError)
    const voiceError = { code: 'LLM_FALLBACK_ERROR', message: 'Pre-built error' }
    mockCreate.mockRejectedValueOnce(voiceError)

    await expect(llmFallback('some command')).rejects.toMatchObject({
      code: 'LLM_FALLBACK_ERROR',
    })
  })
