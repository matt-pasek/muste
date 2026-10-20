import { Button } from '@usva-ui/react/primitives/button'
import { Callout } from '@usva-ui/react/primitives/callout'
import { SulaLoader } from '@usva-ui/react/sula/sula-loader'
import { useEffect, useMemo, type CSSProperties } from 'react'
import type { AnswerExercise } from '../server/answers'
import type { Explanation } from '../server/explain'
import { AnswersReveal } from './AnswersReveal'
import { CloseIcon } from './icons'
import { RegisterToggle } from './RegisterToggle'
import { SpeechReady, stop, useSpeechReady } from './speech'
import { SpeedToggle } from './SpeedToggle'
import { useRegister, type Register } from './useRegister'
import { Sentence, WordChip, WordDetail } from './WordViews'
import type { Anchor, PartialExplanation, PartialRegion } from './lookup'

export type SheetState =
  | { status: 'loading' }
  | { status: 'streaming'; result: PartialExplanation }
  | { status: 'done'; result: Explanation }
  | { status: 'error'; message: string }

const GAP = 12
const EDGE = 16
const DOCK = 96
const MIN_ROOM = 240

function placement(anchor: Anchor): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(520, vw - EDGE * 2)
  const center = (anchor.left + anchor.right) / 2
  const left = Math.min(Math.max(center - width / 2, EDGE), vw - width - EDGE)
  const below = vh - DOCK - anchor.bottom - GAP
  const above = anchor.top - GAP - EDGE
  if (below >= MIN_ROOM || below >= above) {
    return below >= MIN_ROOM
      ? { left, width, top: anchor.bottom + GAP, maxHeight: below }
      : { left, width, bottom: DOCK, maxHeight: Math.min(vh * 0.5, vh - DOCK - EDGE) }
  }
  return { left, width, bottom: vh - anchor.top + GAP, maxHeight: above }
}

type Props = { state: SheetState; anchor: Anchor; answers: AnswerExercise[]; onClose: () => void }

export function ExplainPanel({ state, anchor, answers, onClose }: Props) {
  const style = useMemo(() => placement(anchor), [anchor])
  const [register, setRegister] = useRegister()
  useEffect(() => stop, [])

  return (
    <aside
      role="dialog"
      aria-label="Explanation"
      aria-busy={state.status === 'loading' || state.status === 'streaming'}
      className="fade fixed z-overlay flex flex-col overflow-hidden rounded-2xl border border-border bg-overlay text-ink shadow-overlay select-text"
      style={style}
    >
      <Button
        variant="ghost"
        size="sm"
        shape="pill"
        iconOnly
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 z-base"
      >
        <CloseIcon />
      </Button>
      <SpeechReady value={state.status === 'done'}>
        <div className="overflow-y-auto overscroll-contain p-5 pr-12">
          {state.status === 'loading' && <Reading />}
          {state.status === 'error' && <Callout tone="danger" title="Couldn't explain that">{state.message}</Callout>}
          {(state.status === 'streaming' || state.status === 'done') && <Body result={state.result} register={register} onRegister={setRegister} />}
          {state.status === 'done' && answers.length > 0 && <AnswersReveal key={answers.map((a) => a.number).join()} exercises={answers} />}
        </div>
      </SpeechReady>
    </aside>
  )
}

function Reading() {
  return (
    <div className="flex items-center gap-3 text-muted">
      <SulaLoader size={40} motion="twin" label="Reading the page" />
      <span className="text-sm">Reading…</span>
    </div>
  )
}

type RegisterProps = { register: Register; onRegister: (r: Register) => void }

const differs = (a?: string, b?: string) => !!a && !!b && a.trim() !== b.trim()

function Body({ result, register, onRegister }: { result: PartialExplanation } & RegisterProps) {
  if (result.kind === 'word') {
    return (
      <div className="flex flex-col gap-4">
        {result.word ? <WordDetail word={result.word} large /> : <Reading />}
        {result.sentence && (
          <section className="enter flex flex-col gap-2 border-t border-border pt-3">
            <Controls showRegister={differs(result.sentence, result.sentence_spoken)} register={register} onRegister={onRegister} />
            <div>
              <Sentence fi={result.sentence} spoken={result.sentence_spoken} en={result.sentence_en} words={[result.word]} register={register} large />
            </div>
          </section>
        )}
      </div>
    )
  }
  return <RegionBody result={result as PartialRegion} register={register} onRegister={onRegister} />
}

function Controls({ showRegister, register, onRegister }: { showRegister: boolean } & RegisterProps) {
  const ready = useSpeechReady()
  if (!showRegister && !ready) return null
  return (
    <div className="enter flex flex-wrap items-center justify-between gap-2">
      {showRegister ? <RegisterToggle value={register} onChange={onRegister} /> : <span />}
      {ready && <SpeedToggle />}
    </div>
  )
}

function Eyebrow({ children }: { children: string }) {
  return <p className="enter font-mono text-xs tracking-wider text-accent uppercase">{children}</p>
}

function RegionBody({ result, register, onRegister }: { result: PartialRegion } & RegisterProps) {
  if (!result.kind && !result.fi) return <Reading />
  const words = result.words?.filter((w) => w?.form) ?? []
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        {result.kind === 'exercise' && <Eyebrow>Exercise</Eyebrow>}
        {result.fi && <p className="enter text-lg leading-snug font-semibold text-balance">{result.fi}</p>}
        {result.en && <p className="enter text-muted">{result.en}</p>}
      </header>
      {!!result.sentences?.length && (
        <section className="flex flex-col gap-2.5">
          <Controls showRegister={result.sentences.some((s) => differs(s?.fi, s?.spoken))} register={register} onRegister={onRegister} />
          <ol className="flex flex-col gap-2.5">
            {result.sentences.map((s, i) => s?.fi && (
              <li key={i} className="enter">
                <Sentence fi={s.fi} spoken={s.spoken} en={s.en} words={words} register={register} />
              </li>
            ))}
          </ol>
        </section>
      )}
      {result.rule && (
        <section className="enter rounded-xl bg-accent-tint px-4 py-3 text-on-tint">
          <p className="leading-relaxed">{result.rule}</p>
          {result.example && <p className="mt-2 font-mono text-sm">{result.example}</p>}
        </section>
      )}
      {words.length > 0 && (
        <section className="flex flex-col gap-2">
          <Eyebrow>Words</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w, i) => <WordChip key={i} word={w!} />)}
          </div>
        </section>
      )}
    </div>
  )
}
