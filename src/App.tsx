import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

/**
 * Root application component.
 *
 * Renders a full-viewport tldraw canvas. Future modules (voice input, command
 * parsing, animation) will be layered on top of this baseline.
 */
export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw />
    </div>
  )
}
