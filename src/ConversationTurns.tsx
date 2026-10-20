import { Skeleton } from '@usva-ui/react/primitives/skeleton'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ListenButton } from './ListenButton'
import { HEAVE, rise, riseCalm } from './motion'
import { playbackProgress } from './speech'
import { stripTags } from './tags'
import type { Entry, Suggestion } from './useConversation'

const LEAD = 1.08

const normal = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim()

function useVariants() {
  return useReducedMotion() ? riseCalm : rise
}

const settle = { duration: 0.6, ease: HEAVE }
const slide = { layout: { duration: 0.55, ease: HEAVE } }

function Speaker({ children, tone }: { children: string; tone: 'accent' | 'muted' }) {
  return <p className={`font-mono text-xs tracking-wide ${tone === 'accent' ? 'text-accent' : 'text-muted'}`}>{children}</p>
}

function useSpokenWords(words: string[], speaking: boolean) {
  const reduced = useReducedMotion()
  const [count, setCount] = useState(speaking && !reduced ? 0 : words.length)

  useEffect(() => {
    if (!speaking || reduced) return
    let frame = requestAnimationFrame(function tick() {
      setCount((current) => Math.max(current, Math.ceil(words.length * Math.min(1, playbackProgress() * LEAD))))
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      setCount(words.length)
    }
  }, [speaking, reduced, words.length])

  return count
}

function SpokenLine({ text, speaking, large }: { text: string; speaking: boolean; large: boolean }) {
  const words = stripTags(text).split(' ')
  const shown = useSpokenWords(words, speaking)
  return (
    <p className={`size-ease text-pretty text-ink ${large ? 'text-2xl leading-snug font-medium sm:text-[1.75rem]' : 'text-lg leading-normal font-medium'}`}>
      {words.map((word, i) => (
        <span key={i} className="spoken-word" data-said={i < shown || undefined}>
          {word}{' '}
        </span>
      ))}
      <span className="whitespace-nowrap">
        <ListenButton text={text} expressive />
        <ListenButton text={text} slow expressive />
      </span>
    </p>
  )
}

export function SceneDirection({ scene }: { scene: string }) {
  const variants = useVariants()
  return (
    <motion.li initial="hidden" animate="shown" variants={variants} transition={settle} className="max-w-[56ch]">
      <p className="text-sm text-pretty text-muted italic">{scene}</p>
    </motion.li>
  )
}

type TurnProps = { entry: Entry; latest: boolean; speaking: boolean; faded: boolean; slot?: string }

export function Turn({ entry, latest, speaking, faded, slot }: TurnProps) {
  const variants = useVariants()
  const item = { variants, transition: settle }
  const fade = `transition-opacity duration-slow ${faded ? 'opacity-50' : ''}`

  if (entry.role === 'partner') {
    return (
      <motion.li initial="hidden" animate="shown" transition={{ staggerChildren: 0.09 }} className={`flex flex-col gap-1.5 ${fade}`}>
        <motion.div {...item}><Speaker tone="accent">Aino</Speaker></motion.div>
        <motion.div {...item}><SpokenLine text={entry.text} speaking={speaking} large={latest} /></motion.div>
        <motion.p {...item} className={`size-ease text-pretty text-muted ${latest ? 'text-base' : 'text-sm'}`}>{entry.en}</motion.p>
      </motion.li>
    )
  }

  const understood = entry.understood && normal(entry.understood) !== normal(entry.heard) ? entry.understood : ''
  return (
    <motion.li
      layoutId={slot}
      transition={slide}
      className={`flex flex-col gap-1.5 pl-6 sm:pl-12 ${fade}`}
    >
      <Speaker tone="muted">you</Speaker>
      <p className="text-lg text-pretty text-ink">“{entry.heard}”</p>
      <motion.div initial="hidden" animate="shown" transition={{ staggerChildren: 0.08, delayChildren: 0.25 }} className="flex flex-col gap-1.5">
        {understood && (
          <motion.p {...item} className="text-sm text-muted">
            Aino understood <span className="font-medium text-ink">{understood}</span>
            <ListenButton text={understood} className="ml-0.5" />
          </motion.p>
        )}
        {entry.corrections.length > 0 && (
          <motion.dl {...item} className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
            {entry.corrections.map((c, i) => (
              <div key={i} className="contents">
                <dt className="pt-0.5 font-mono text-xs text-muted line-through">{c.said}</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">
                    {c.better}
                    <ListenButton text={c.better} className="ml-0.5" />
                  </span>
                  <span className="text-pretty text-muted">{c.note}</span>
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
      </motion.div>
    </motion.li>
  )
}

export function Draft({ suggestion, recording, slot }: { suggestion: Suggestion; recording: boolean; slot: string }) {
  const variants = useVariants()
  return (
    <motion.li
      layoutId={slot}
      initial="hidden"
      animate="shown"
      exit="gone"
      variants={variants}
      transition={{ ...settle, ...slide }}
      className="draft flex flex-col gap-1 pl-6 sm:pl-12"
      data-recording={recording || undefined}
    >
      <p className="text-lg font-medium text-pretty text-ink/70">
        {suggestion.fi}
        <span className="whitespace-nowrap">
          <ListenButton text={suggestion.fi} />
          <ListenButton text={suggestion.fi} slow />
        </span>
      </p>
      <p className="text-sm text-muted">{suggestion.en}</p>
    </motion.li>
  )
}

export function Pending() {
  const variants = useVariants()
  return (
    <motion.li initial="hidden" animate="shown" exit="gone" variants={variants} transition={{ duration: 0.4, ease: HEAVE }} className="flex flex-col gap-2" aria-hidden>
      <Speaker tone="accent">Aino</Speaker>
      <Skeleton className="h-7 w-4/5 rounded-lg" />
      <Skeleton className="h-7 w-3/5 rounded-lg" />
    </motion.li>
  )
}
