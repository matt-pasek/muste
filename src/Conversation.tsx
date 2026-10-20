import { Button } from '@usva-ui/react/primitives/button'
import { Callout } from '@usva-ui/react/primitives/callout'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import { AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Controls } from './ConversationControls'
import { ConversationSettings } from './ConversationSettings'
import { Draft, Pending, SceneDirection, Turn } from './ConversationTurns'
import { CloseIcon } from './icons'
import { replySlot, type Chat, type Phase } from './useConversation'
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
  opening: 'Aino is setting the scene',
  recording: 'Listening to you',
  thinking: 'Aino is thinking',
  speaking: 'Aino is speaking',
}

const SETTLE_MS = 450
const RECENT = 3
const YIELDED = 0.68

type SessionProps = { chat: Chat; register: Register; onRegister: (r: Register) => void }
type Props = SessionProps & { open: boolean; onClose: () => void }

export function Conversation({ open, onClose, ...session }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content
        backdropClassName="bg-bg"
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 bg-bg p-0 shadow-none"
      >
        {open && <Room {...session} />}
      </Dialog.Content>
    </Dialog>
  )
}

function useSettled() {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])
  return settled
}

const measureStage = () => {
  const landscape = window.innerWidth > window.innerHeight && window.innerWidth >= 900
  const basis = landscape ? Math.min(window.innerWidth * 0.32, window.innerHeight * 0.5) : window.innerHeight * 0.3
  return Math.round(Math.min(340, Math.max(160, basis)))
}

function useStageSize() {
  const [size, setSize] = useState(measureStage)
  useEffect(() => {
    const onResize = () => setSize(measureStage())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function Room({ chat, register, onRegister }: SessionProps) {
  const settled = useSettled()
  const bottom = useRef<HTMLDivElement>(null)
  const last = chat.entries.at(-1)
  const busy = chat.phase === 'opening' || chat.phase === 'thinking'
  const replies = chat.entries.filter((e) => e.role === 'learner').length
  const draft = last?.role === 'partner' && last.suggestion.fi && chat.phase !== 'speaking' && chat.phase !== 'opening' ? last.suggestion : undefined
  const slots = chat.entries.map((e, i) => (e.role === 'learner' ? replySlot(chat.entries.slice(0, i).filter((x) => x.role === 'learner').length) : undefined))

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.entries.length, chat.phase])

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_fit-content(62%)_auto] landscape:lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] landscape:lg:grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="safe-top flex items-center justify-between gap-4 px-5 pb-1 sm:px-8 landscape:lg:col-span-2">
        <Dialog.Title className="text-lg font-semibold text-ink">Aino</Dialog.Title>
        <div className="flex items-center gap-1">
          <ConversationSettings register={register} onRegister={onRegister} onNewScene={() => void chat.open()} busy={busy} />
          <Dialog.Close render={<Button variant="ghost" shape="pill" iconOnly aria-label="Close conversation" />}>
            <CloseIcon />
          </Dialog.Close>
        </div>
      </header>

      <Stage phase={chat.phase} settled={settled} level={chat.level} />

      <div className="mask-fade-top min-h-0 overflow-y-auto overscroll-contain select-text landscape:lg:col-start-2 landscape:lg:row-start-2">
        <LayoutGroup>
          <ol className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-end gap-7 px-5 pt-10 pb-6 sm:px-8">
            {chat.scene && <SceneDirection scene={chat.scene} />}
            {chat.entries.map((entry, i) => (
              <Turn
                key={i}
                entry={entry}
                latest={i === chat.entries.length - 1}
                speaking={chat.phase === 'speaking' && i === chat.entries.length - 1}
                faded={i < chat.entries.length - RECENT}
                slot={slots[i]}
              />
            ))}
            <AnimatePresence mode="popLayout">
              {draft && <Draft key={replySlot(replies)} slot={replySlot(replies)} suggestion={draft} recording={chat.phase === 'recording'} />}
              {busy && <Pending key="pending" />}
            </AnimatePresence>
            <div ref={bottom} />
          </ol>
        </LayoutGroup>
      </div>

      <footer className="safe-bottom flex flex-col items-center gap-4 px-5 pt-3 landscape:lg:col-start-2 landscape:lg:row-start-3">
        {chat.notice && <Callout tone="warning" className="w-full max-w-xl">{chat.notice}</Callout>}
        <Controls chat={chat} />
      </footer>
    </div>
  )
}

const GLOW_REST: Record<Phase, number> = { idle: 0.12, opening: 0.3, recording: 0.22, thinking: 0.3, speaking: 0.4 }

function useGlow(phase: Phase, level: () => number) {
  const glow = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const node = glow.current
    if (!node) return
    if (reduced) {
      node.style.setProperty('--glow', String(GLOW_REST[phase]))
      return
    }
    let smooth = Number(node.style.getPropertyValue('--glow')) || 0
    const started = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const rest = GLOW_REST[phase]
      const live = phase === 'recording' || phase === 'speaking' ? level() * 0.6 : 0
      const breath = phase === 'thinking' || phase === 'opening' ? Math.sin((now - started) / 700) * 0.12 : 0
      smooth += (rest + live + breath - smooth) * 0.12
      node.style.setProperty('--glow', smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [phase, level, reduced])

  return glow
}

function Stage({ phase, settled, level }: { phase: Phase; settled: boolean; level: () => number }) {
  const size = useStageSize()
  const [value, setValue] = useState(0)
  const yielded = phase === 'idle' || phase === 'recording'
  const glow = useGlow(phase, level)

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
    <div className="grid place-items-center py-2 landscape:lg:row-span-2 landscape:lg:row-start-2">
      <div className="grid place-items-center" style={{ width: size, height: size }}>
        <div
          className="stage-presence relative grid place-items-center"
          data-yielded={yielded || undefined}
          style={{ '--stage': `${size}px`, '--yielded': YIELDED } as CSSProperties}
        >
          {settled && (
            <Virva
              state={VIRVA_STATE[phase]}
              level={value}
              size={size}
              label={STATUS[phase]}
              className="room-fade"
              style={{ width: '100%', height: '100%' }}
            />
          )}
          <div ref={glow} aria-hidden className="virva-glow" />
        </div>
      </div>
    </div>
  )
}
