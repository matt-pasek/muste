import { Button } from '@usva-ui/react/primitives/button'
import { Callout } from '@usva-ui/react/primitives/callout'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MicIcon, StopIcon } from './icons'
import { ListenButton } from './ListenButton'
import { RegisterToggle } from './RegisterToggle'
import { SpeedToggle } from './SpeedToggle'
import { stripTags } from './tags'
import type { Chat, Entry, Phase } from './useConversation'
import type { Register } from './useRegister'
import { Virva } from './virva/virva'
import type { VirvaState } from './virva/virva-geometry'

const VIRVA_STATE: Record<Phase, VirvaState> = {
  idle: 'idle',
  opening: 'thinking',
  recording: 'listening',
  thinking: 'thinking',
  speaking: 'responding',
}

const STATUS: Record<Phase, string> = {
  idle: 'Your turn',
  opening: 'Setting the scene…',
  recording: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
}

const SETTLE_MS = 400

type SessionProps = { chat: Chat; register: Register; onRegister: (r: Register) => void }
type Props = SessionProps & { open: boolean; onClose: () => void }

export function Conversation({ open, onClose, ...session }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content className="flex h-[min(88dvh,920px)] w-[calc(100vw-32px)] max-w-2xl flex-col overflow-hidden p-0">
        <Dialog.Close
          render={<Button variant="ghost" size="sm" shape="pill" iconOnly aria-label="Close" className="absolute top-3 right-3 z-base" />}
        >
          <CloseIcon />
        </Dialog.Close>
        {open && <Session {...session} />}
      </Dialog.Content>
    </Dialog>
  )
}

function Session({ chat, register, onRegister }: SessionProps) {
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.entries.length, chat.phase])

  return (
    <>
      <header className="flex flex-col gap-3 px-6 pt-6 pr-14 sm:px-8">
        <div className="flex flex-col gap-1">
          <Dialog.Title className="font-mono text-xs tracking-wider text-accent uppercase">Puhu · conversation</Dialog.Title>
          <p className="text-muted">{chat.scene || 'A short role-play from the page you are on.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RegisterToggle value={register} onChange={onRegister} />
          <SpeedToggle />
        </div>
      </header>
      <LiveVirva phase={chat.phase} level={chat.level} />
      <ol className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-4 select-text sm:px-8">
        {chat.entries.map((entry, i) => <Line key={i} entry={entry} latest={i === chat.entries.length - 1} />)}
        <div ref={bottom} />
      </ol>
      <footer className="safe-bottom flex flex-col items-center gap-2 border-t border-border px-6 pt-4">
        {chat.notice && <Callout tone="warning" className="w-full">{chat.notice}</Callout>}
        <Controls chat={chat} />
      </footer>
    </>
  )
}

function LiveVirva({ phase, level }: { phase: Phase; level: () => number }) {
  const [settled, setSettled] = useState(false)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (phase !== 'recording' && phase !== 'speaking') return
    let frame = requestAnimationFrame(function tick() {
      setValue(level())
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      setValue(0)
    }
  }, [phase, level])

  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <div className="grid size-[148px] place-items-center">
        {settled && <Virva state={VIRVA_STATE[phase]} level={value} size={148} label={STATUS[phase]} />}
      </div>
      <p className="text-sm text-muted" aria-live="polite">{STATUS[phase]}</p>
    </div>
  )
}

function Line({ entry, latest }: { entry: Entry; latest: boolean }) {
  if (entry.role === 'partner') {
    return (
      <li className="enter flex max-w-[85%] flex-col gap-2 self-start">
        <div className="flex flex-col gap-0.5 rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3">
          <p className="font-medium">
            {stripTags(entry.text)}
            <ListenButton text={entry.text} expressive className="ml-1" />
            <ListenButton text={entry.text} slow expressive />
          </p>
          <p className="text-sm text-muted">{entry.en}</p>
        </div>
        {latest && entry.suggestion.fi && (
          <div className="enter flex flex-col gap-0.5 rounded-xl border border-dashed border-border-strong px-3 py-2 text-sm">
            <p className="font-mono text-xs tracking-wider text-accent uppercase">You could say</p>
            <p className="font-medium">
              {entry.suggestion.fi}
              <ListenButton text={entry.suggestion.fi} className="ml-0.5" />
              <ListenButton text={entry.suggestion.fi} slow />
            </p>
            <p className="text-muted">{entry.suggestion.en}</p>
          </div>
        )}
      </li>
    )
  }
  return (
    <li className="enter flex max-w-[85%] flex-col items-end gap-1.5 self-end">
      <p className="rounded-2xl rounded-br-md bg-accent-tint px-4 py-3 text-on-tint">{entry.heard}</p>
      {entry.understood && normal(entry.understood) !== normal(entry.heard) && (
        <p className="text-sm text-muted">
          understood as <span className="font-medium text-ink">{entry.understood}</span>
          <ListenButton text={entry.understood} className="ml-0.5" />
        </p>
      )}
      {entry.corrections.map((c, i) => (
        <div key={i} className="flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2 text-sm">
          <p>
            <span className="text-muted line-through">{c.said}</span>
            <span className="text-muted"> → </span>
            <span className="font-semibold">{c.better}</span>
            <ListenButton text={c.better} className="ml-0.5" />
          </p>
          <p className="text-muted">{c.note}</p>
        </div>
      ))}
    </li>
  )
}

const normal = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim()

function Controls({ chat }: { chat: Chat }) {
  if (chat.phase === 'recording') {
    return (
      <div className="flex items-center gap-3">
        <Button variant="solid" shape="pill" size="lg" onClick={() => void chat.send()}>
          <StopIcon /> Done
        </Button>
        <button className="ref-link" onClick={chat.cancel}>Cancel</button>
      </div>
    )
  }
  const busy = chat.phase === 'opening' || chat.phase === 'thinking'
  return (
    <div className="flex items-center gap-3">
      <Button variant="solid" shape="pill" size="lg" disabled={busy} onClick={() => void chat.talk()}>
        <MicIcon /> {chat.phase === 'speaking' ? 'Interrupt and talk' : 'Talk'}
      </Button>
      <button className="ref-link" disabled={busy} onClick={() => void chat.open()}>New scene</button>
    </div>
  )
}
