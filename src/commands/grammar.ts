/**
 * src/commands/grammar.ts
 *
 * Local regex grammar — the fast path (<5 ms, zero network calls) for the
 * ~80 % of voice commands that follow a predictable pattern.
 *
 * Returns a ShapeCommand[] when patterns match, or null when the transcript
 * should be escalated to the LLM fallback.
 *
 * Compound utterances (e.g. "draw a red circle and a blue square") are split on
 * conjunction tokens (and, then, also, plus, comma).  All segments must parse
 * for the batch to be returned; if any segment fails, the function returns null
 * and the whole transcript falls through to the LLM.
 *
 * @module
 */

import type { ShapeColor, ShapeCommand, ShapePosition, ShapeReference, ShapeSize, ShapeType } from '../types'

// ─── Vocabulary maps ──────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, ShapeColor> = {
  red: 'red',
  blue: 'blue',
  green: 'green',
  orange: 'orange',
  yellow: 'yellow',
  violet: 'violet',
  purple: 'violet',
  grey: 'grey',
  gray: 'grey',
  black: 'black',
  white: 'white',
}

const SIZE_MAP: Record<string, ShapeSize> = {
  tiny: 'small',
  small: 'small',
  medium: 'medium',
  large: 'large',
  big: 'large',
  huge: 'xl',
  xl: 'xl',
}

const SHAPE_MAP: Record<string, ShapeType> = {
  circle: 'circle',
  ellipse: 'ellipse',
  oval: 'ellipse',
  rectangle: 'rectangle',
  rect: 'rectangle',
  square: 'rectangle',
  box: 'rectangle',
  triangle: 'triangle',
  arrow: 'arrow',
  line: 'line',
  star: 'star',
  text: 'text',
  textbox: 'text',
  frame: 'frame',
}

const POSITION_MAP: Record<string, ShapePosition> = {
  center: 'center',
  middle: 'center',
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  'top-left': 'top-left',
  'top left': 'top-left',
  'upper-left': 'top-left',
  'upper left': 'top-left',
  'top-right': 'top-right',
  'top right': 'top-right',
  'upper-right': 'top-right',
  'upper right': 'top-right',
  'bottom-left': 'bottom-left',
  'bottom left': 'bottom-left',
  'lower-left': 'bottom-left',
  'lower left': 'bottom-left',
  'bottom-right': 'bottom-right',
  'bottom right': 'bottom-right',
  'lower-right': 'bottom-right',
  'lower right': 'bottom-right',
}

// ─── Token pattern strings ────────────────────────────────────────────────────

const COLOR_PATTERN = Object.keys(COLOR_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|')

const SIZE_PATTERN = Object.keys(SIZE_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|')

const SHAPE_PATTERN = Object.keys(SHAPE_MAP)
  .map((s) => s.replace(/\s+/g, '\\s+'))
  .sort((a, b) => b.length - a.length)
  .join('|')

const POSITION_PATTERN = Object.keys(POSITION_MAP)
  .map((s) => s.replace(/[-\s]+/g, '[-\\s]+'))
  .sort((a, b) => b.length - a.length)
  .join('|')

// ─── Helper extractors ────────────────────────────────────────────────────────

function extractColor(text: string): ShapeColor | undefined {
  const re = new RegExp(`\\b(${COLOR_PATTERN})\\b`, 'i')
  const m = re.exec(text)
  return m ? COLOR_MAP[m[1].toLowerCase()] : undefined
}

function extractAllColors(text: string): ShapeColor[] {
  const re = new RegExp(`\\b(${COLOR_PATTERN})\\b`, 'gi')
  const results: ShapeColor[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const color = COLOR_MAP[m[1].toLowerCase()]
    if (color !== undefined) results.push(color)
  }
  return results
}

function extractSize(text: string): ShapeSize | undefined {
  const re = new RegExp(`\\b(${SIZE_PATTERN})\\b`, 'i')
  const m = re.exec(text)
  return m ? SIZE_MAP[m[1].toLowerCase()] : undefined
}

function extractShape(text: string): ShapeType | undefined {
  const re = new RegExp(`\\b(${SHAPE_PATTERN})\\b`, 'i')
  const m = re.exec(text)
  return m ? SHAPE_MAP[m[1].toLowerCase().replace(/\s+/g, ' ')] : undefined
}

function extractPosition(text: string): ShapePosition | undefined {
  const re = new RegExp(`\\b(${POSITION_PATTERN})\\b`, 'i')
  const m = re.exec(text)
  return m ? POSITION_MAP[m[1].toLowerCase().replace(/[-\s]+/g, ' ')] : undefined
}

function extractSteps(text: string): number {
  const numRe = /\b(\d+)\s+(?:steps?|actions?|times?)\b/i.exec(text)
  if (numRe) return parseInt(numRe[1], 10)
  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  }
  const wordRe =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:steps?|actions?|times?)\b/i.exec(
      text,
    )
  if (wordRe) return wordMap[wordRe[1].toLowerCase()] ?? 1
  return 1
}

function extractAngle(text: string): number | undefined {
  const degRe = /(\d+(?:\.\d+)?)\s*(?:degrees?|°)/i.exec(text)
  if (degRe) {
    const angle = parseFloat(degRe[1])
    if (/\b(?:counter[-\s]?clockwise|ccw|anti[-\s]?clockwise)\b/i.test(text)) return -angle
    return angle
  }
  if (/\bquarter\s+(?:turn|rotation)\b/i.test(text)) return 90
  if (/\bhalf\s+(?:a\s+)?(?:turn|rotation)\b/i.test(text)) return 180
  if (/\bfull\s+(?:turn|rotation)\b/i.test(text)) return 360
  return undefined
}

function extractTimestamp(text: string): number | undefined {
  const secRe = /\b(?:at\s+)?second\s+(\d+(?:\.\d+)?)\b/i.exec(text)
  if (secRe) return parseFloat(secRe[1]) * 1000

  const frameRe = /\bframe\s+(\d+)\b/i.exec(text)
  if (frameRe) return parseInt(frameRe[1], 10) * (1000 / 30)

  const atRe = /\bat\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s\b)/i.exec(text)
  if (atRe) return parseFloat(atRe[1]) * 1000

  if (/\bthe\s+beginning\b/i.test(text)) return 0
  return undefined
}

function extractOrdinal(text: string): ShapeReference['ordinal'] {
  if (/\b(last|latest|most\s+recent)\b/i.test(text)) return 'last'
  if (/\b(first)\b/i.test(text)) return 'first'
  const m = /\b(second|third|fourth|fifth)\b/i.exec(text)
  if (m) {
    return ({ second: 2, third: 3, fourth: 4, fifth: 5 } as Record<string, number>)[
      m[1].toLowerCase()
    ]
  }
  return undefined
}

function buildShapeReference(fields: ShapeReference): ShapeReference | undefined {
  const ref: ShapeReference = {}
  if (fields.shapeType !== undefined) ref.shapeType = fields.shapeType
  if (fields.color !== undefined) ref.color = fields.color
  if (fields.size !== undefined) ref.size = fields.size
  if (fields.ordinal !== undefined) ref.ordinal = fields.ordinal
  if (fields.label !== undefined) ref.label = fields.label
  if (fields.spatial !== undefined) ref.spatial = fields.spatial
  if (fields.useSelection !== undefined) ref.useSelection = fields.useSelection
  return Object.keys(ref).length > 0 ? ref : undefined
}

// ─── Private single-command matcher ──────────────────────────────────────────

function matchSingleCommand(segment: string, rawTranscript: string): ShapeCommand | null {
  const t = segment

  // 1. UNDO
  if (
    /^(?:undo|undo\s+that|undo\s+the\s+last(?:\s+\d+)?\s+actions?|go\s+back(?:\s+\d+\s+steps?)?)\b/i.test(t)
  ) {
    return { intent: 'UNDO', steps: extractSteps(t), rawTranscript }
  }

  // 2. REDO
  if (/^(?:redo|redo\s+that|redo\s+the\s+last(?:\s+\d+)?\s+actions?)\b/i.test(t)) {
    return { intent: 'REDO', steps: extractSteps(t), rawTranscript }
  }

  // 3. SELECT_ALL
  if (/\b(?:select\s+all|select\s+everything|select\s+all\s+shapes?)\b/i.test(t)) {
    return { intent: 'SELECT_ALL', rawTranscript }
  }

  // 4. DESELECT
  if (/^deselect\b/i.test(t)) {
    return { intent: 'DESELECT', rawTranscript }
  }

  // 5. DELETE_ALL
  if (/\b(?:delete|remove|clear|erase)\s+(?:everything|all(?:\s+shapes?)?)\b/i.test(t)) {
    return { intent: 'DELETE_ALL', rawTranscript }
  }

  // 6. DELETE_SHAPE
  if (/^(?:delete|remove|erase|clear)\b/i.test(t)) {
    const shapeType = extractShape(t)
    const color = extractColor(t)
    const size = extractSize(t)
    const ordinal = extractOrdinal(t)
    const shapeReference = buildShapeReference({ shapeType, color, size, ordinal })
    return {
      intent: 'DELETE_SHAPE',
      ...(shapeType !== undefined ? { shapeType } : {}),
      ...(shapeReference !== undefined ? { shapeReference } : {}),
      rawTranscript,
    }
  }

  // 7. PLAY
  if (/^play\b/i.test(t)) {
    const fromBeginning = /\bfrom\s+the\s+beginning\b/i.test(t)
    return {
      intent: 'PLAY',
      ...(fromBeginning ? { timestamp: 0 } : {}),
      rawTranscript,
    }
  }

  // 8. PAUSE
  if (/^pause\b/i.test(t)) {
    return { intent: 'PAUSE', rawTranscript }
  }

  // 9. STOP
  if (/^stop\b/i.test(t)) {
    return { intent: 'STOP', rawTranscript }
  }

  // 10. SEEK
  if (/^(?:go\s+to|jump\s+to|seek(?:\s+to)?)\b/i.test(t)) {
    const ts = extractTimestamp(t)
    if (ts !== undefined) {
      return { intent: 'SEEK', timestamp: ts, rawTranscript }
    }
    if (/\bthe\s+end\b/i.test(t)) {
      return { intent: 'SEEK', timestamp: Number.MAX_SAFE_INTEGER, rawTranscript }
    }
    if (/\bbeginning\b/i.test(t)) {
      return { intent: 'SEEK', timestamp: 0, rawTranscript }
    }
  }

  // 11. RECORD_KEYFRAME
  if (/\brecord\s+(?:a\s+)?keyframe\b/i.test(t)) {
    const ts = extractTimestamp(t)
    return {
      intent: 'RECORD_KEYFRAME',
      ...(ts !== undefined ? { timestamp: ts } : {}),
      rawTranscript,
    }
  }

  // 12. ROTATE_SHAPE
  if (/^(?:rotate|turn|spin|flip)\b/i.test(t)) {
    const angle = extractAngle(t)
    const shapeType = extractShape(t)
    const color = extractColor(t)
    const ordinal = extractOrdinal(t)
    const shapeReference = buildShapeReference({ shapeType, color, ordinal })
    return {
      intent: 'ROTATE_SHAPE',
      ...(shapeType !== undefined ? { shapeType } : {}),
      ...(angle !== undefined ? { angle } : {}),
      ...(shapeReference !== undefined ? { shapeReference } : {}),
      rawTranscript,
    }
  }

  // 13. RESIZE_SHAPE
  if (
    /^(?:resize|scale)\b/i.test(t) ||
    /\bmake\s+(?:it\s+)?(?:bigger|larger|smaller|tiny|huge)\b/i.test(t)
  ) {
    const size = extractSize(t)
    const factor = (() => {
      if (/\bbigger\b|\blarger\b/i.test(t)) return 1.5
      if (/\bsmaller\b|\btiny\b/i.test(t)) return 0.5
      if (/\bhuge\b/i.test(t)) return 2.0
      const pct = /\bby\s+(\d+(?:\.\d+)?)\s*(?:percent|%)/i.exec(t)
      if (pct) return parseFloat(pct[1]) / 100
      return undefined
    })()
    const shapeType = extractShape(t)
    const color = extractColor(t)
    const ordinal = extractOrdinal(t)
    const useSelection = /\b(?:selected|selection|current)\b/i.test(t) ? true : undefined
    const shapeReference = buildShapeReference({ shapeType, color, ordinal, useSelection })
    return {
      intent: 'RESIZE_SHAPE',
      ...(shapeType !== undefined ? { shapeType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(factor !== undefined ? { factor } : {}),
      ...(shapeReference !== undefined ? { shapeReference } : {}),
      rawTranscript,
    }
  }

  // 14. STYLE_SHAPE -- verbs: make, change, color, set, use, give
  if (/^(?:make|change|color|set|use|give)\b/i.test(t)) {
    const isCreate =
      /\b(?:a|an)\s+(?:\w+\s+)*(?:circle|ellipse|rectangle|triangle|arrow|line|star|text|frame|square|oval|box)\b/i.test(
        t,
      )
    if (!isCreate) {
      const allColors = extractAllColors(t)
      if (allColors.length >= 2) {
        const targetColor = allColors[0]
        const newColor = allColors[allColors.length - 1]
        const shapeType = extractShape(t)
        const shapeReference = buildShapeReference({ shapeType, color: targetColor })
        return {
          intent: 'STYLE_SHAPE',
          color: newColor,
          ...(shapeReference !== undefined ? { shapeReference } : {}),
          rawTranscript,
        }
      }
      const color = allColors[0]
      if (color !== undefined) {
        return { intent: 'STYLE_SHAPE', color, rawTranscript }
      }
      if (
        /\b(?:solid|none|empty|hollow|pattern|gradient|thick|thin|medium)\s+(?:fill|border|stroke|outline)\b/i.test(
          t,
        ) ||
        /\b(?:fill|border|stroke)\s+(?:to\s+)?(?:solid|none|empty|hollow|pattern|gradient|thick|thin|medium)\b/i.test(
          t,
        )
      ) {
        return { intent: 'STYLE_SHAPE', rawTranscript }
      }
    }
  }

  // 15. MOVE_SHAPE
  if (/^(?:move|drag|shift|reposition|snap|nudge)\b/i.test(t)) {
    const position = extractPosition(t)
    const shapeType = extractShape(t)
    const color = extractColor(t)
    const ordinal = extractOrdinal(t)
    const shapeReference = buildShapeReference({ shapeType, color, ordinal })

    // Directional nudge: "move right", "move it left by 50", "nudge up 100px"
    const NUDGE_BASE: Record<string, { dx?: number; dy?: number }> = {
      right: { dx: 100 }, left: { dx: -100 },
      up: { dy: -100 }, down: { dy: 100 },
    }
    const nudgeRe = /\b(right|left|up|down)\b/i.exec(t)
    // Reject matches that are part of a compound position like "top-right"
    const isCompoundPosition =
      nudgeRe !== null &&
      /\b(?:top|bottom|upper|lower)[-\s](?:right|left)\b/i.test(t)
    const nudge = nudgeRe && !isCompoundPosition
      ? NUDGE_BASE[nudgeRe[1].toLowerCase()]
      : undefined

    // Optional pixel distance: "by 50", "50px", "50 pixels"
    let nudgeDist: number | undefined
    if (nudge !== undefined) {
      const distRe = /(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:px|pixels?)?(?:\b|$)/i.exec(
        // strip the direction word so "right 50" parses correctly
        t.replace(/\b(right|left|up|down)\b/i, ''),
      )
      if (distRe) {
        const d = parseFloat(distRe[1])
        if (d > 0) nudgeDist = d
      }
    }

    // Apply distance scaling to the nudge deltas
    let dx: number | undefined
    let dy: number | undefined
    if (nudge !== undefined) {
      const scale = nudgeDist !== undefined ? nudgeDist / 100 : 1
      if (nudge.dx !== undefined) dx = nudge.dx * scale
      if (nudge.dy !== undefined) dy = nudge.dy * scale
    }

    // Emit a MOVE_SHAPE when we have at least one of: position, nudge, or shapeReference
    if (position !== undefined || dx !== undefined || dy !== undefined || shapeReference !== undefined) {
      return {
        intent: 'MOVE_SHAPE',
        ...(shapeType !== undefined ? { shapeType } : {}),
        ...(position !== undefined ? { position } : {}),
        ...(dx !== undefined ? { dx } : {}),
        ...(dy !== undefined ? { dy } : {}),
        ...(shapeReference !== undefined ? { shapeReference } : {}),
        rawTranscript,
      }
    }
  }

  // 16. SELECT_SHAPE
  if (/^(?:select|click\s+on)\b/i.test(t)) {
    const color = extractColor(t)
    const shapeType = extractShape(t)
    return {
      intent: 'SELECT_SHAPE',
      ...(color !== undefined ? { color } : {}),
      ...(shapeType !== undefined ? { shapeType } : {}),
      rawTranscript,
    }
  }

  // 17. CREATE_SHAPE -- explicit verb prefix
  if (/^(?:draw|add|create|insert|put|place|make)\b/i.test(t)) {
    const shapeType = extractShape(t)
    if (shapeType !== undefined) {
      const color = extractColor(t)
      const size = extractSize(t)
      const position = extractPosition(t)
      return {
        intent: 'CREATE_SHAPE',
        shapeType,
        ...(color !== undefined ? { color } : {}),
        ...(size !== undefined ? { size } : {}),
        ...(position !== undefined ? { position } : {}),
        rawTranscript,
      }
    }
  }

  // 18. CREATE_SHAPE -- bare noun phrase
  {
    const shapeType = extractShape(t)
    if (shapeType !== undefined) {
      const FILLER_RE = /^(\s*(a|an|the|new|another|one|please|now|here|there|ok|okay)\s*)*$/i
      const stripped = t
        .replace(new RegExp('\\b(' + SHAPE_PATTERN + ')\\b', 'i'), '')
        .replace(new RegExp('\\b(' + COLOR_PATTERN + ')\\b', 'i'), '')
        .replace(new RegExp('\\b(' + SIZE_PATTERN + ')\\b', 'i'), '')
        .trim()
      if (FILLER_RE.test(stripped)) {
        const color = extractColor(t)
        const size = extractSize(t)
        const position = extractPosition(t)
        return {
          intent: 'CREATE_SHAPE',
          shapeType,
          ...(color !== undefined ? { color } : {}),
          ...(size !== undefined ? { size } : {}),
          ...(position !== undefined ? { position } : {}),
          rawTranscript,
        }
      }
    }
  }

  return null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Try to parse `transcript` using local regex patterns.
 *
 * If the transcript contains conjunction tokens (and, then, also, plus, comma)
 * AND starts with a CREATE verb, the function splits on those delimiters and
 * attempts to parse each segment individually. Only if ALL segments parse does
 * it return the full array; if any segment fails, the whole transcript falls
 * through to the LLM (returns null).
 *
 * Single-command transcripts are wrapped in a length-1 array.
 *
 * @param transcript    - Normalised (trimmed) voice transcript.
 * @param rawTranscript - Original transcript string (stored in ShapeCommand.rawTranscript).
 * @returns An array of ShapeCommand (length >= 1) on success, or null if no
 *          pattern matched.
 */
export function matchGrammar(transcript: string, rawTranscript: string): ShapeCommand[] | null {
  const CONJUNCTION_SPLIT_RE = /(?<!\w)(?:and|then|also|plus)(?!\w)|,/i
  const CREATE_VERB_RE = /^(?:draw|add|create|insert|put|place|make)(?!\w)/i

  if (CONJUNCTION_SPLIT_RE.test(transcript) && CREATE_VERB_RE.test(transcript)) {
    const segments = transcript
      .split(CONJUNCTION_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean)

    if (segments.length > 1) {
      const cmds: ShapeCommand[] = []
      for (const seg of segments) {
        const cmd = matchSingleCommand(seg, rawTranscript)
        if (cmd === null) {
          return null
        }
        cmds.push(cmd)
      }
      return cmds
    }
  }

  const single = matchSingleCommand(transcript, rawTranscript)
  return single !== null ? [single] : null
}
