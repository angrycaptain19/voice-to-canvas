/**
 * src/voice/VoiceErrorBoundary.tsx
 *
 * React error boundary that wraps the entire voice pipeline subtree.
 *
 * Why a class component?
 * React error boundaries must be class components — hooks cannot catch render
 * errors thrown by child components.  This is the only class component in the
 * voice module; everything else uses hooks.
 *
 * Usage
 * -----
 *   <VoiceErrorBoundary>
 *     <VoiceMicButton />
 *     <VoiceTranscriptOverlay />
 *   </VoiceErrorBoundary>
 *
 * Optionally supply a custom fallback prop to override the default banner:
 *   <VoiceErrorBoundary fallback={<p>Voice unavailable</p>}>
 *     ...
 *   </VoiceErrorBoundary>
 *
 * The boundary logs caught errors to console.error (non-blocking) and
 * renders a compact, accessible fallback banner rather than a blank UI.
 */

import { Component } from 'react'
import type { ErrorInfo, ReactNode, CSSProperties } from 'react'

// ─── Props & State ─────────────────────────────────────────────────────────────

export interface VoiceErrorBoundaryProps {
  /** Content to protect. */
  children: ReactNode
  /**
   * Custom fallback UI.  When omitted a built-in error banner is rendered.
   * The fallback receives the caught error so it can render contextual copy.
   */
  fallback?: ReactNode | ((error: Error) => ReactNode)
  /**
   * Optional callback invoked whenever a render error is caught.
   * Use this to integrate with an external error-reporting service.
   */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface VoiceErrorBoundaryState {
  hasError: boolean
  caughtError: Error | null
}

// ─── Default fallback banner ──────────────────────────────────────────────────

const bannerStyles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    borderRadius: '0.5rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    maxWidth: '480px',
    margin: '0.5rem',
  },
  icon: {
    flexShrink: 0,
    fontSize: '1.1em',
    lineHeight: '1',
  },
  message: {
    flex: 1,
  },
  retryButton: {
    marginLeft: 'auto',
    padding: '0.25rem 0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid #fca5a5',
    background: 'transparent',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Catches JavaScript errors thrown during rendering of any child component in
 * the voice subtree and replaces the broken UI with an error banner.
 *
 * Clicking "Try again" in the default banner resets the boundary so the
 * children are re-mounted (the voice pipeline restarts from scratch).
 */
export class VoiceErrorBoundary extends Component<
  VoiceErrorBoundaryProps,
  VoiceErrorBoundaryState
> {
  constructor(props: VoiceErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, caughtError: null }
    this.handleRetry = this.handleRetry.bind(this)
  }

  static getDerivedStateFromError(error: Error): VoiceErrorBoundaryState {
    return { hasError: true, caughtError: error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[VoiceErrorBoundary] Uncaught render error:', error, info)
    this.props.onError?.(error, info)
  }

  handleRetry(): void {
    this.setState({ hasError: false, caughtError: null })
  }

  render(): ReactNode {
    const { hasError, caughtError } = this.state
    const { children, fallback } = this.props

    if (!hasError) return children

    // ── Custom fallback ───────────────────────────────────────────────────────
    if (fallback !== undefined) {
      if (typeof fallback === 'function') {
        return caughtError ? (fallback as (e: Error) => ReactNode)(caughtError) : null
      }
      return fallback as ReactNode
    }

    // ── Default banner ────────────────────────────────────────────────────────
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={bannerStyles.wrapper}
      >
        <span style={bannerStyles.icon} aria-hidden="true">
          ⚠️
        </span>
        <span style={bannerStyles.message}>
          Voice input encountered an unexpected error.
        </span>
        <button
          style={bannerStyles.retryButton}
          onClick={this.handleRetry}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }
}
