# Voice-to-Canvas — Supported Command Vocabulary

This file is the **authoritative reference** for every voice command the system
understands. It is consumed directly by:

- the LLM system-prompt / grammar rules in `src/parser/`,
- integration tests that validate utterance → intent mapping, and
- the user-facing help overlay in the canvas UI.

> **Ambiguity rule (global):** The pronouns *"it"*, *"that"*, *"the shape"*,
> *"this"*, and *"the selected one"* always resolve to the **currently-selected
> shape**. If nothing is selected the command must be rejected with
> `"No shape is currently selected."`.

---

## Table of Contents

1. [Shape Creation](#1-shape-creation)
2. [Positioning](#2-positioning)
3. [Styling](#3-styling)
4. [Manipulation](#4-manipulation)
5. [Selection](#5-selection)
6. [Undo / Redo](#6-undo--redo)
7. [Animation & Timeline](#7-animation--timeline)
8. [Grammar Quick-Reference](#8-grammar-quick-reference)

---

## 1. Shape Creation

**Intent:** `CREATE_SHAPE`

Supported shape types: `circle`, `ellipse`, `rectangle` (alias `rect`, `box`,
`square`), `triangle`, `arrow`, `line`, `star`, `polygon`, `text`, `image`.

### Canonical patterns

```
(draw | add | create | insert | put | place | make) [a|an]
  [<color>] [<size>] <shape-type>
  [in | at | near | to] [the] <position>
```

### Examples

| Utterance | Parsed intent |
|-----------|---------------|
| "Draw a circle" | `CREATE_SHAPE {type:"circle"}` |
| "Add a red circle" | `CREATE_SHAPE {type:"circle", color:"red"}` |
| "Create a blue triangle in the top-right" | `CREATE_SHAPE {type:"triangle", color:"blue", position:"top-right"}` |
| "Put a star in the center" | `CREATE_SHAPE {type:"star", position:"center"}` |
| "Draw a large orange rectangle at the bottom" | `CREATE_SHAPE {type:"rectangle", color:"orange", size:"large", position:"bottom"}` |
| "Add an arrow pointing right" | `CREATE_SHAPE {type:"arrow", direction:"right"}` |
| "Insert a text box in the top-left" | `CREATE_SHAPE {type:"text", position:"top-left"}` |
| "Make a small green ellipse near the top" | `CREATE_SHAPE {type:"ellipse", color:"green", size:"small", position:"top"}` |
| "Place a yellow star at the bottom-left" | `CREATE_SHAPE {type:"star", color:"yellow", position:"bottom-left"}` |
| "Draw a white square in the center" | `CREATE_SHAPE {type:"rectangle", color:"white", position:"center"}` |

### Notes

- "square" is an alias for `rectangle` with equal width and height.
- "box" is also an alias for `rectangle`.
- Omitted attributes take default values (color: `black`, size: `medium`,
  position: `center`).
- "Put a shape near X" — the word "near" followed by another named shape sets
  `relativeAnchor` to that shape's id.

---

## 2. Positioning

**Intent:** `POSITION_SHAPE` (also used as a sub-parameter in `CREATE_SHAPE` and
`MOVE_SHAPE`)

### Canonical position tokens

| Token | Meaning |
|-------|---------|
| `center` | Horizontal & vertical center of the canvas |
| `top` | Horizontally centered, near the top edge |
| `bottom` | Horizontally centered, near the bottom edge |
| `left` | Vertically centered, near the left edge |
| `right` | Vertically centered, near the right edge |
| `top-left` | Near the top-left corner |
| `top-right` | Near the top-right corner |
| `bottom-left` | Near the bottom-left corner |
| `bottom-right` | Near the bottom-right corner |
| `near <shape>` | Adjacent to the named / described shape |

Aliases accepted at parse time (normalized before dispatch):

- "middle" → `center`
- "upper-left" / "upper left" / "top left" → `top-left`
- "upper-right" / "upper right" / "top right" → `top-right`
- "lower-left" / "lower left" / "bottom left" → `bottom-left`
- "lower-right" / "lower right" / "bottom right" → `bottom-right`

### Examples

| Utterance | Parsed intent |
|-----------|---------------|
| "Move it to the top-right" | `MOVE_SHAPE {position:"top-right"}` |
| "Place the shape in the center" | `POSITION_SHAPE {position:"center"}` |
| "Put it near the blue circle" | `MOVE_SHAPE {relativeAnchor:"<id of blue circle>"}` |
| "Position the rectangle at the bottom-left" | `MOVE_SHAPE {target:"rectangle", position:"bottom-left"}` |
| "Move the selected shape to the upper-right" | `MOVE_SHAPE {position:"top-right"}` |
| "Snap it to the center" | `MOVE_SHAPE {position:"center"}` |

### Notes

- "near X" resolves to a pixel offset (default: 20 px gap) from X's bounding box.
- Exact pixel coordinates ("move to 200, 300") are supported via a separate
  `MOVE_SHAPE_ABS` intent and are **not** part of the NL vocabulary.

---

## 3. Styling

**Intent:** `STYLE_SHAPE`

### 3.1 Colors

Supported named colors:

`red`, `blue`, `green`, `yellow`, `black`, `white`, `orange`, `purple`,
`pink`, `brown`, `grey` (alias `gray`), `cyan`, `magenta`, `teal`.

CSS hex / RGB strings (`#ff0000`, `rgb(255,0,0)`) are also accepted but are
treated as advanced input — they should not appear in grammar rules for the
voice path.

### 3.2 Fill types

| Token | Meaning |
|-------|---------|
| `solid` | Filled with the current color |
| `none` / `empty` / `hollow` | No fill (transparent interior) |
| `pattern` | Hatched / cross-hatched fill pattern |
| `gradient` | Linear gradient using the current color |

### 3.3 Stroke / border width

| Token | Pixel width |
|-------|------------|
| `thin` | 1 px |
| `medium` | 3 px (default) |
| `thick` | 6 px |

### Examples

| Utterance | Parsed intent |
|-----------|---------------|
| "Make it red" | `STYLE_SHAPE {color:"red"}` |
| "Change the color to blue" | `STYLE_SHAPE {color:"blue"}` |
| "Color it green" | `STYLE_SHAPE {color:"green"}` |
| "Set the fill to none" | `STYLE_SHAPE {fill:"none"}` |
| "Make the fill solid" | `STYLE_SHAPE {fill:"solid"}` |
| "Use a pattern fill" | `STYLE_SHAPE {fill:"pattern"}` |
| "Make the border thick" | `STYLE_SHAPE {strokeWidth:"thick"}` |
| "Use a thin stroke" | `STYLE_SHAPE {strokeWidth:"thin"}` |
| "Set the stroke width to medium" | `STYLE_SHAPE {strokeWidth:"medium"}` |
| "Make it a hollow blue circle" | `STYLE_SHAPE {color:"blue", fill:"none"}` (+ `target` from context) |
| "Change the border color to orange" | `STYLE_SHAPE {strokeColor:"orange"}` |
| "Give it a gradient fill" | `STYLE_SHAPE {fill:"gradient"}` |

### Notes

- Multiple style properties may be voiced in one utterance:
  *"Make it a thick red circle"* → `STYLE_SHAPE {color:"red", strokeWidth:"thick"}`.
- "border" and "outline" are aliases for `stroke`.

---

## 4. Manipulation

### 4.1 Move

**Intent:** `MOVE_SHAPE`

```
(move | drag | shift | reposition) [the] [<target>]
  (to | toward | into) [the] <position>
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Move the selected shape to the center" | `MOVE_SHAPE {position:"center"}` |
| "Drag it to the bottom-right" | `MOVE_SHAPE {position:"bottom-right"}` |
| "Shift the circle to the left" | `MOVE_SHAPE {target:"circle", position:"left"}` |
| "Reposition the star near the rectangle" | `MOVE_SHAPE {target:"star", relativeAnchor:"rectangle"}` |

### 4.2 Resize

**Intent:** `RESIZE_SHAPE`

```
(resize | scale | make [it]) (bigger | larger | smaller | tiny | small | medium | large | huge)
(resize | scale) [it] to (small | medium | large)
(resize | scale) [it] by <number> [percent | %]
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Resize it to large" | `RESIZE_SHAPE {size:"large"}` |
| "Make it smaller" | `RESIZE_SHAPE {size:"smaller"}` |
| "Scale the rectangle to medium" | `RESIZE_SHAPE {target:"rectangle", size:"medium"}` |
| "Make it twice as big" | `RESIZE_SHAPE {factor:2}` |
| "Shrink the circle" | `RESIZE_SHAPE {target:"circle", size:"smaller"}` |
| "Scale it up by 50 percent" | `RESIZE_SHAPE {factor:1.5}` |

Size tokens and their canonical canvas-unit equivalents:

| Token | Short side (px) |
|-------|----------------|
| `tiny` | 32 |
| `small` | 64 |
| `medium` | 128 (default) |
| `large` | 256 |
| `huge` | 512 |

### 4.3 Rotate

**Intent:** `ROTATE_SHAPE`

```
rotate [the] [<target>] [by] <number> degrees [clockwise | counter-clockwise | left | right]
flip [the] [<target>] (horizontally | vertically)
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Rotate it 45 degrees" | `ROTATE_SHAPE {angle:45}` |
| "Rotate the rectangle 90 degrees clockwise" | `ROTATE_SHAPE {target:"rectangle", angle:90, direction:"cw"}` |
| "Turn it counter-clockwise 30 degrees" | `ROTATE_SHAPE {angle:-30}` |
| "Flip the triangle horizontally" | `ROTATE_SHAPE {target:"triangle", flip:"horizontal"}` |
| "Rotate it a quarter turn" | `ROTATE_SHAPE {angle:90}` |

### Notes

- Positive angles are **clockwise** by default (matches canvas conventions).
- "a quarter turn" = 90 deg, "half a turn" = 180 deg, "a full turn" = 360 deg.

### 4.4 Delete

**Intent:** `DELETE_SHAPE`

```
(delete | remove | erase | clear) [the] [<target>]
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Delete the circle" | `DELETE_SHAPE {target:"circle"}` |
| "Remove the selected shape" | `DELETE_SHAPE {}` (uses selection) |
| "Erase it" | `DELETE_SHAPE {}` |
| "Clear the rectangle" | `DELETE_SHAPE {target:"rectangle"}` |
| "Delete everything" | `DELETE_ALL {}` |
| "Remove all shapes" | `DELETE_ALL {}` |

### Notes

- "Delete everything" / "Remove all shapes" dispatches a distinct `DELETE_ALL`
  intent which requires confirmation before executing.

---

## 5. Selection

**Intent:** `SELECT_SHAPE` / `SELECT_ALL` / `DESELECT`

```
select (all | every shape | everything)
select [the] [<color>] [<shape-type>]
click [on] [the] [<color>] [<shape-type>]
deselect (all | it | everything)
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Select all" | `SELECT_ALL {}` |
| "Select all shapes" | `SELECT_ALL {}` |
| "Select everything" | `SELECT_ALL {}` |
| "Select the red shape" | `SELECT_SHAPE {color:"red"}` |
| "Select the blue circle" | `SELECT_SHAPE {type:"circle", color:"blue"}` |
| "Select the rectangle" | `SELECT_SHAPE {type:"rectangle"}` |
| "Deselect all" | `DESELECT {}` |
| "Click on the star" | `SELECT_SHAPE {type:"star"}` |

### Notes

- If multiple shapes match (e.g. two red circles), the system selects the one
  closest to the canvas center and emits an `AMBIGUOUS_SELECTION` warning in
  the console.
- "the selected shape" in a subsequent command keeps the same selection; no new
  `SELECT_SHAPE` intent is emitted.

---

## 6. Undo / Redo

**Intent:** `UNDO` / `REDO`

```
undo [that | the last action | the last <n> actions]
redo [that | the last action]
go back [<n> steps]
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Undo" | `UNDO {steps:1}` |
| "Undo that" | `UNDO {steps:1}` |
| "Undo the last action" | `UNDO {steps:1}` |
| "Undo the last 3 actions" | `UNDO {steps:3}` |
| "Go back 2 steps" | `UNDO {steps:2}` |
| "Redo" | `REDO {steps:1}` |
| "Redo that" | `REDO {steps:1}` |
| "Redo the last action" | `REDO {steps:1}` |

### Notes

- Maximum undo depth is **50** steps (configurable in `src/history/config.ts`).
- "Undo everything" is **not** supported; use "delete everything" if you want a
  clean canvas.

---

## 7. Animation & Timeline

> **Status:** This section is forward-declared here so the parser grammar is
> reserved. Full semantics are defined and owned by the Animation task
> (`@task:y438z242nse61sapnnhs`).

**Intents:** `RECORD_KEYFRAME`, `PLAY`, `PAUSE`, `STOP`, `SEEK`

```
record [a] keyframe [at <time>]
play [the animation | from [the] beginning]
pause [the animation]
stop [the animation]
go to [second | frame] <number>
jump to <number> [seconds | frames]
```

| Utterance | Parsed intent |
|-----------|---------------|
| "Record keyframe" | `RECORD_KEYFRAME {time:"current"}` |
| "Record a keyframe at second 2" | `RECORD_KEYFRAME {time:2000}` |
| "Play" | `PLAY {}` |
| "Play the animation" | `PLAY {}` |
| "Play from the beginning" | `PLAY {from:0}` |
| "Pause" | `PAUSE {}` |
| "Pause the animation" | `PAUSE {}` |
| "Stop" | `STOP {}` |
| "Go to second 3" | `SEEK {time:3000}` |
| "Jump to frame 10" | `SEEK {frame:10}` |
| "Go to the beginning" | `SEEK {time:0}` |
| "Go to the end" | `SEEK {time:"end"}` |

### Notes

- Times are stored internally as **milliseconds**; "second N" maps to `N * 1000 ms`.
- "frame N" maps to `N * (1000 / fps) ms` where default fps = 30.
- Playback commands are no-ops when no animation data exists; the parser emits
  a `NO_ANIMATION` warning.

---

## 8. Grammar Quick-Reference

The table below shows every top-level intent token, its trigger verbs, and the
optional / required parameters the parser must extract.

| Intent | Trigger verbs | Required params | Optional params |
|--------|---------------|-----------------|-----------------|
| `CREATE_SHAPE` | draw, add, create, insert, put, place, make | `type` | `color`, `size`, `position`, `fill`, `strokeWidth` |
| `MOVE_SHAPE` | move, drag, shift, reposition | — | `target`, `position`, `relativeAnchor` |
| `RESIZE_SHAPE` | resize, scale, make (bigger/smaller) | — | `target`, `size`, `factor` |
| `ROTATE_SHAPE` | rotate, turn, spin, flip | — | `target`, `angle`, `direction`, `flip` |
| `DELETE_SHAPE` | delete, remove, erase, clear | — | `target` |
| `DELETE_ALL` | delete/remove + "everything"/"all" | — | — |
| `STYLE_SHAPE` | make, change, color, set, use, give | — | `target`, `color`, `fill`, `strokeWidth`, `strokeColor` |
| `SELECT_SHAPE` | select, click on | — | `target`, `type`, `color` |
| `SELECT_ALL` | select + "all"/"everything" | — | — |
| `DESELECT` | deselect | — | `target` |
| `UNDO` | undo, go back | — | `steps` |
| `REDO` | redo | — | `steps` |
| `RECORD_KEYFRAME` | record keyframe | — | `time` |
| `PLAY` | play | — | `from` |
| `PAUSE` | pause | — | — |
| `STOP` | stop | — | — |
| `SEEK` | go to, jump to | `time` OR `frame` | — |

---

## Appendix A — Rejection Responses

When a command cannot be parsed or preconditions are not met, the system returns
one of the following standard error strings:

| Error token | User-visible message |
|-------------|---------------------|
| `NO_SELECTION` | "No shape is currently selected." |
| `AMBIGUOUS_TARGET` | "I found more than one matching shape — please be more specific." |
| `UNKNOWN_COMMAND` | "Sorry, I didn't understand that command." |
| `NO_ANIMATION` | "There's no animation to play." |
| `CONFIRM_DELETE_ALL` | "Are you sure you want to delete everything? Say 'yes' to confirm." |

---

## Appendix B — Reserved / Out-of-Scope Commands

The following phrases are **intentionally not supported** in v1 and must not be
added to grammar rules without a tracking task:

- Exact pixel coordinates in NL ("move to 200 by 300")
- Font styling for text shapes ("make it bold", "change the font")
- Layer / z-order commands ("bring to front", "send to back") — tracked separately
- Multi-shape group operations ("group these", "align left") — tracked separately
- Canvas-level commands ("zoom in", "pan right") — tracked separately
