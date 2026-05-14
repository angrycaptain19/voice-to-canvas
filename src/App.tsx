import { VoiceCanvas } from './voice/VoiceCanvas'
import { VoiceErrorBoundary } from './voice/VoiceErrorBoundary'

/**
 * Root application component.
 *
 * Renders a full-viewport tldraw canvas with integrated voice capture controls.
 *
 * ## Pipeline (end-to-end)
 *
 *   useVoiceTranscript()
 *       │  final transcript (Space key or mic button)
 *       ▼
 *   parseVoiceCommand()   ← local regex grammar (<5 ms) + GPT-4o-mini fallback
 *       │  ShapeCommand
 *       ▼
 *   commandToAction()     ← intent → type rename
 *       │  TldrawAction
 *       ▼
 *   executeTldrawAction(editor, action)
 *       │
 *       ▼
 *   shape appears on canvas + feedback toast
 *
 * ## Keyboard shortcut
 *   Space toggles listening when not in a text field.
 *
 * ## Error containment
 *   A top-level VoiceErrorBoundary ensures a render crash in the voice
 *   pipeline subtree never takes down the whole canvas — a "Reload" fallback
 *   is shown instead.
 */
export default function App() {
  return (
    <VoiceErrorBoundary
      fallback={
        <div
          role="alert"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'sans-serif',
            fontSize: '1rem',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '2rem' }}>&#x26A0;&#xFE0F;</span>
          <p style={{ margin: 0 }}>
            The voice canvas encountered an unexpected error. Please reload the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reload
          </button>
        </div>
      }
    >
      <VoiceCanvas />
    </VoiceErrorBoundary>
  )
}
