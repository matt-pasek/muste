import { Button } from '@usva-ui/react/primitives/button'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import { SlowIcon, SpeakerIcon, StopIcon } from './icons'
import { speak, speechKey, stop, useSpeech, useSpeechReady } from './speech'

type Props = { text?: string; slow?: boolean; className?: string }

export function ListenButton({ text, slow = false, className = '' }: Props) {
  const spoken = text?.trim() ?? ''
  const state = useSpeech(speechKey(spoken, slow))
  const ready = useSpeechReady()
  if (!ready || !spoken) return null
  const active = state.status === 'loading' || state.status === 'playing'
  const label = state.status === 'error' ? `Couldn't play: ${state.message}` : active ? 'Stop' : `${slow ? 'Listen slowly' : 'Listen'}: ${spoken}`
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="pill"
      iconOnly
      onClick={() => (active ? stop() : speak(spoken, slow))}
      aria-label={label}
      title={label}
      className={`listen-button ${state.status === 'error' ? 'is-error' : ''} ${className}`}
    >
      {state.status === 'loading' ? <Spinner size="sm" /> : state.status === 'playing' ? <StopIcon /> : slow ? <SlowIcon /> : <SpeakerIcon />}
    </Button>
  )
}
