import { Button } from '@usva-ui/react/primitives/button'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import { SpeakerIcon, StopIcon } from './icons'
import { speak, stop, useSpeech, useSpeechReady } from './speech'

export function ListenButton({ text, className = '' }: { text?: string; className?: string }) {
  const spoken = text?.trim() ?? ''
  const state = useSpeech(spoken)
  const ready = useSpeechReady()
  if (!ready || !spoken) return null
  const active = state.status === 'loading' || state.status === 'playing'
  const label = state.status === 'error' ? `Couldn't play: ${state.message}` : active ? 'Stop' : `Listen: ${spoken}`
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="pill"
      iconOnly
      onClick={() => (active ? stop() : speak(spoken))}
      aria-label={label}
      title={label}
      className={`listen-button ${state.status === 'error' ? 'is-error' : ''} ${className}`}
    >
      {state.status === 'loading' ? <Spinner size="sm" /> : state.status === 'playing' ? <StopIcon /> : <SpeakerIcon />}
    </Button>
  )
}
