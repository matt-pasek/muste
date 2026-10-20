import { Button } from '@usva-ui/react/primitives/button'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { AgainIcon, HintIcon, MicIcon, StopIcon } from './icons'
import { iconSwap } from './motion'
import type { Chat } from './useConversation'

const LABEL = {
  idle: 'Talk',
  opening: 'One moment',
  recording: 'Done',
  thinking: 'One moment',
  speaking: 'Interrupt',
} as const

function TalkIconState({ phase }: { phase: Chat['phase'] }) {
  const busy = phase === 'opening' || phase === 'thinking'
  const key = busy ? 'busy' : phase === 'recording' ? 'stop' : 'mic'
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={key} {...iconSwap} className="grid place-items-center text-[1.9rem]">
        {busy ? <Spinner size="md" /> : phase === 'recording' ? <StopIcon /> : <MicIcon />}
      </motion.span>
    </AnimatePresence>
  )
}

function useLevelRing(chat: Chat) {
  const ring = useRef<HTMLSpanElement>(null)
  const recording = chat.phase === 'recording'
  const { level } = chat

  useEffect(() => {
    const node = ring.current
    if (!node || !recording) return
    let smooth = 0
    let frame = requestAnimationFrame(function tick() {
      smooth += (level() - smooth) * 0.25
      node.style.setProperty('--level', smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      node.style.setProperty('--level', '0')
    }
  }, [recording, level])

  return ring
}

type ControlsProps = { chat: Chat; hints: boolean; onHints: () => void }

export function Controls({ chat, hints, onHints }: ControlsProps) {
  const recording = chat.phase === 'recording'
  const busy = chat.phase === 'opening' || chat.phase === 'thinking'
  const ring = useLevelRing(chat)
  const canReplay = chat.entries.some((e) => e.role === 'partner') && !recording && !busy

  return (
    <div className="grid w-full max-w-sm grid-cols-[1fr_auto_1fr] items-start gap-6">
      <div className="justify-self-end pt-4">
        <Button variant="ghost" shape="pill" disabled={!canReplay} onClick={chat.replay}>
          <AgainIcon /> Again
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <span ref={ring} className="talk-ring" data-recording={recording || undefined}>
          <Button
            variant="solid"
            shape="pill"
            iconOnly
            disabled={busy}
            onClick={() => void (recording ? chat.send() : chat.talk())}
            aria-label={recording ? 'Stop and send' : 'Talk to Jouni'}
            className="talk-button size-20"
          >
            <TalkIconState phase={chat.phase} />
          </Button>
        </span>
        <span className="text-sm font-medium text-muted">{LABEL[chat.phase]}</span>
      </div>
      <div className="justify-self-start pt-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {recording ? (
            <motion.div key="cancel" {...iconSwap}>
              <Button variant="ghost" shape="pill" onClick={chat.cancel}>Cancel</Button>
            </motion.div>
          ) : (
            <motion.div key="hints" {...iconSwap}>
              <Button
                variant="ghost"
                shape="pill"
                aria-pressed={hints}
                onClick={onHints}
                title={hints ? 'Hide what you could say' : 'Show what you could say'}
                className="hint-toggle"
              >
                <HintIcon /> Hints
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
