import { Button } from '@usva-ui/react/primitives/button'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import { SlowIcon, SpeakerIcon, StopIcon } from './icons'
import { speak, speechKey, stop, useSpeech, useSpeechReady } from './speech'
import { stripTags } from './tags'

type Props = { text?: string; slow?: boolean; expressive?: boolean; className?: string }

export function ListenButton({ text, slow = false, expressive = false, className = '' }: Props) {
  const spoken = text?.trim() ?? ''
  const state = useSpeech(speechKey(spoken, slow, expressive))
  const ready = useSpeechReady()
  if (!ready || !spoken) return null
  const active = state.status === 'loading' || state.status === 'playing'
  const shown = stripTags(spoken)
  const label = state.status === 'error' ? `Couldn't play: ${state.message}` : active ? 'Stop' : `${slow ? 'Listen slowly' : 'Listen'}: ${shown}`
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="pill"
      iconOnly
      onClick={() => (active ? stop() : speak(spoken, slow, expressive))}
      aria-label={label}
      title={label}
      className={`listen-button ${state.status === 'error' ? 'is-error' : ''} ${className}`}
    >
      {state.status === 'loading' ? <Spinner size="sm" /> : state.status === 'playing' ? <StopIcon /> : slow ? <SlowIcon /> : <SpeakerIcon />}
    </Button>
  )
}
