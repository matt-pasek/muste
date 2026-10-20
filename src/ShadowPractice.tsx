import { Button } from '@usva-ui/react/primitives/button'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import { Fragment } from 'react'
import type { ShadowResult } from '../server/shadow'
import { CloseIcon, MicIcon, StopIcon } from './icons'
import { ListenButton } from './ListenButton'
import { useSpeechReady } from './speech'
import type { ShadowState } from './useShadow'

type ButtonProps = { state: ShadowState; onToggle: () => void; className?: string }

export function ShadowButton({ state, onToggle, className = '' }: ButtonProps) {
  const ready = useSpeechReady()
  if (!ready || !navigator.mediaDevices) return null
  const recording = state.status === 'recording'
  const busy = state.status === 'starting' || state.status === 'checking'
  return (
    <Button
      variant="ghost"
      size="sm"
      shape="pill"
      iconOnly
      disabled={busy}
      onClick={onToggle}
      aria-label={recording ? 'Stop and check' : 'Say it yourself'}
      title={recording ? 'Stop and check' : 'Say it yourself'}
      className={`listen-button shadow-button ${recording ? 'is-recording' : ''} ${className}`}
    >
      {busy ? <Spinner size="sm" /> : recording ? <StopIcon /> : <MicIcon />}
    </Button>
  )
}

type FeedbackProps = {
  state: ShadowState
  target: string
  onRetry: () => void
  onClose: () => void
  onCancel: () => void
  onRestart: () => void
}

export function ShadowFeedback({ state, target, onRetry, onClose, onCancel, onRestart }: FeedbackProps) {
  if (state.status === 'idle' || state.status === 'starting') return null
  return (
    <div className="enter shadow-card relative mt-2 flex flex-col gap-2 rounded-xl bg-surface-2 px-3.5 py-3 pr-10 text-sm">
      {state.status !== 'recording' && state.status !== 'checking' && (
        <Button variant="ghost" size="sm" shape="pill" iconOnly onClick={onClose} aria-label="Close feedback" className="absolute top-1.5 right-1.5">
          <CloseIcon />
        </Button>
      )}
      {state.status === 'recording' && (
        <>
          <p className="flex items-center gap-2 text-muted"><span className="rec-dot" />Listening… tap ■ when you're done.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="ref-link" onClick={onRestart}>Start over</button>
            <button className="ref-link" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
      {state.status === 'checking' && <p className="flex items-center gap-2 text-muted"><Spinner size="sm" />Checking your pronunciation…</p>}
      {state.status === 'error' && <p className="text-danger-ink">{state.message}</p>}
      {state.status === 'done' && <Result result={state.result} target={target} />}
      {(state.status === 'done' || state.status === 'error') && (
        <div className="flex flex-wrap items-center gap-1.5">
          {state.status === 'done' && state.result.verdict !== 'match' && (
            <span className="flex items-center text-muted">
              slowly <ListenButton text={target} slow />
            </span>
          )}
          <button className="ref-link" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  )
}

const normal = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, '')
const TOKEN = /(\p{L}[\p{L}'’-]*)/u

function Result({ result, target }: { result: ShadowResult; target: string }) {
  if (result.verdict === 'match') {
    return <p className="font-medium text-success-ink">Spot on: “{result.heard}”</p>
  }
  const expected = new Set(target.split(TOKEN).filter((_, i) => i % 2).map(normal))
  return (
    <>
      <p>
        <span className="text-muted">I heard </span>
        {result.heard
          ? result.heard.split(TOKEN).map((part, i) =>
              i % 2 && !expected.has(normal(part)) ? <mark key={i} className="shadow-miss">{part}</mark> : <Fragment key={i}>{part}</Fragment>,
            )
          : '…nothing'}
      </p>
      {result.summary && <p>{result.summary}</p>}
      {result.mistakes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {result.mistakes.map((m, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <span className="font-mono text-xs">
                <span className="font-semibold">{m.expected}</span>
                {m.heard && <span className="text-muted"> ← you said {m.heard}</span>}
                <span className="ml-2 text-accent">{m.kind}</span>
              </span>
              <span className="leading-relaxed">{m.tip}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
