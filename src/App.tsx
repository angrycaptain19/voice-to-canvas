import { VoiceCanvas } from './voice/VoiceCanvas'

/**
 * Root application component.
 *
 * Renders a full-viewport tldraw canvas with integrated voice capture controls
 * (mic button, live transcript overlay, error toasts).
 *
 * Voice modes:
 *   micMode="toggle" — click once to start, click again to stop (default)
 *   micMode="hold"   — hold the button to record, release to commit
 *
 * Keyboard shortcut: Space toggles listening when not in a text field.
 */
export default function App() {
  return <VoiceCanvas micMode="toggle" />
}
