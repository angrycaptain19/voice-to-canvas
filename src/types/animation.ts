import { z } from 'zod'

// ---------------------------------------------------------------------------
// PlaybackState
// ---------------------------------------------------------------------------

export const PlaybackStateSchema = z.enum(['idle', 'playing', 'paused', 'stopped'])

export type PlaybackState = z.infer<typeof PlaybackStateSchema>

// ---------------------------------------------------------------------------
// AnimationKeyframe
// ---------------------------------------------------------------------------

/**
 * A snapshot of one or more shape property values at a specific point in time.
 * `properties` is kept as a generic record so downstream animation modules can
 * attach whatever tldraw shape props they need without re-defining this schema.
 */
export const AnimationKeyframeSchema = z.object({
  /** Unique identifier for the keyframe (e.g. a UUID). */
  id: z.string(),
  /** The tldraw shape id this keyframe applies to. */
  shapeId: z.string(),
  /** Position in the timeline in seconds (>= 0). */
  time: z.number().nonnegative(),
  /**
   * Property snapshot.  Values intentionally typed as `unknown` so individual
   * animation modules can narrow them — avoids any `any` while remaining
   * extensible.
   */
  properties: z.record(z.string(), z.unknown()),
})

export type AnimationKeyframe = z.infer<typeof AnimationKeyframeSchema>

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const TimelineSchema = z.object({
  /** Total duration of the timeline in seconds. */
  duration: z.number().nonnegative(),
  /** All keyframes, ordered by time ascending. */
  keyframes: z.array(AnimationKeyframeSchema),
  /** Current playback position in seconds. */
  currentTime: z.number().nonnegative(),
  /** Current playback status. */
  playbackState: PlaybackStateSchema,
})

export type Timeline = z.infer<typeof TimelineSchema>

// ---------------------------------------------------------------------------
// Default / initial value helper
// ---------------------------------------------------------------------------

export const TIMELINE_INITIAL: Timeline = {
  duration: 0,
  keyframes: [],
  currentTime: 0,
  playbackState: 'idle',
}
