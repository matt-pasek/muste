import { Fragment, useState } from 'react'
import { caseClass, caseLabel, isCase } from './cases'
import { ListenButton } from './ListenButton'
import { ShadowButton, ShadowFeedback } from './ShadowPractice'
import { useShadow } from './useShadow'
import type { PartialExplanation } from './lookup'
import { useOpenReference } from './reference'
import type { Register } from './useRegister'

export type PartialWord = NonNullable<Extract<PartialExplanation, { word?: unknown }>['word']>

const TOKEN = /(\p{L}[\p{L}'’-]*)/u
const normal = (s: string) => s.toLowerCase().replace(/[-’']+$/u, '')

type HighlightProps = { text: string; words: (PartialWord | undefined)[]; written?: string }

export function Highlighted({ text, words, written }: HighlightProps) {
  const byForm = new Map(
    words
      .filter((w) => w?.form && caseClass(w.case))
      .flatMap((w) => [[normal(w!.form!), w!] as const, ...(w!.spoken ? [[normal(w!.spoken), w!] as const] : [])]),
  )
  const writtenWords = written ? new Set(written.split(TOKEN).filter((_, i) => i % 2).map(normal)) : null
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (!(i % 2)) return <Fragment key={i}>{part}</Fragment>
        const word = byForm.get(normal(part))
        const changed = writtenWords && !writtenWords.has(normal(part))
        const className = [word && `case-mark ${caseClass(word.case)}`, changed && 'spoken-mark'].filter(Boolean).join(' ')
        return className ? <mark key={i} className={className}>{part}</mark> : <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

type SentenceProps = { fi: string; spoken?: string; en?: string; words: (PartialWord | undefined)[]; register: Register; large?: boolean }

export function Sentence({ fi, spoken, en, words, register, large = false }: SentenceProps) {
  const showSpoken = register === 'puhe' && !!spoken
  const target = showSpoken ? spoken : fi
  const practice = useShadow(target)
  return (
    <>
      <p key={showSpoken ? 'puhe' : 'kirja'} className="enter font-medium">
        {showSpoken ? <Highlighted text={spoken} words={words} written={fi} /> : <Highlighted text={fi} words={words} />}
        <ListenButton text={target} className="ml-1" />
        <ShadowButton state={practice.state} onToggle={practice.toggle} />
      </p>
      {showSpoken && <p className="text-sm text-muted">{fi}</p>}
      {en && <p className={large ? 'mt-0.5 text-muted' : 'text-sm text-muted'}>{en}</p>}
      <ShadowFeedback state={practice.state} target={target} onRetry={practice.toggle} onClose={practice.reset} />
    </>
  )
}

export function CaseBadge({ word }: { word: PartialWord }) {
  const open = useOpenReference()
  if (!isCase(word.case)) return null
  const topic = word.case
  return (
    <button
      className={`case-badge ${caseClass(topic) || 'case-plain'}`}
      onClick={() => open({ kind: 'case', topic, word: { form: word.form, lemma: word.lemma, why: word.why } })}
      aria-label={`${topic}: how to form and use it`}
    >
      {caseLabel(topic, word.number)}
      <span aria-hidden>›</span>
    </button>
  )
}

export function WordDetail({ word, large = false }: { word: PartialWord; large?: boolean }) {
  const open = useOpenReference()
  const meta = [word.lemma && `← ${word.lemma}`, word.pos, word.grammar].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={large ? 'text-2xl font-semibold' : 'font-semibold'}>
          {word.form}
          <ListenButton text={word.form} className="ml-0.5" />
        </span>
        {word.gloss && <span className={large ? 'text-lg text-muted' : 'text-muted'}>{word.gloss}</span>}
      </p>
      {meta && <p className="enter font-mono text-xs text-muted">{meta}</p>}
      {word.spoken && word.form && normal(word.spoken) !== normal(word.form) && (
        <p className="enter text-sm text-muted">
          spoken: <span className="spoken-mark font-medium text-ink">{word.spoken}</span>
          <ListenButton text={word.spoken} className="ml-0.5" />
        </p>
      )}
      {word.why && <p className="enter text-sm leading-relaxed text-ink">{word.why}</p>}
      {(isCase(word.case) || word.lemma) && (
        <div className="enter mt-1 flex flex-wrap items-center gap-1.5">
          <CaseBadge word={word} />
          {word.lemma && (
            <button className="ref-link" onClick={() => open({ kind: 'dict', word: word.lemma! })}>
              Dictionary · {word.lemma}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function WordChip({ word }: { word: PartialWord }) {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <div className="enter basis-full rounded-xl bg-surface-2 px-3.5 py-3">
        <button className="mb-1 font-mono text-xs text-muted outline-none focus-visible:ring-focus" onClick={() => setOpen(false)}>
          ‹ back to words
        </button>
        <WordDetail word={word} />
      </div>
    )
  }
  return (
    <button
      className={`enter word-chip ${caseClass(word.case)}`}
      onClick={() => setOpen(true)}
      aria-expanded={false}
    >
      <span className="font-medium">{word.form}</span>
      {word.gloss && <span className="text-sm text-muted">{word.gloss}</span>}
    </button>
  )
}
