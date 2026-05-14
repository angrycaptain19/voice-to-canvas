import { VoiceCanvas } from './ui/VoiceCanvas'
import './App.css'

function App() {
  return (
    <VoiceCanvas
      micMode="toggle"
      onCommand={(transcript: string) => {
        // TODO: wire to command parser (src/commands/)
        console.info('[VoiceCanvas] final transcript →', transcript)
      }}
    />
  )
}

export default App
