import { Callout } from '@usva-ui/react/primitives/callout'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import type { Case } from '../server/grammar'
import { caseClass } from './cases'
import { Waiting } from './DictionaryEntry'
import { guide } from './grammar'
import type { CaseWord } from './reference'
import { useAsync } from './useAsync'

export function CaseGuide({ topic, word }: { topic: Case; word?: CaseWord }) {
  const state = useAsync(() => guide(topic), topic)
  if (state.status === 'loading') return <Waiting label={`Writing the ${topic} guide… (once, then it’s saved)`} />
  if (state.status === 'error') return <Callout tone="danger" title="Couldn’t load the guide">{state.message}</Callout>
  if (state.value.kind !== 'case') return null
  const g = state.value
  return (
    <article className={`case-guide ${caseClass(topic)} flex flex-col gap-7`}>
      <header className="enter flex flex-col gap-2">
        <p className="case-eyebrow font-mono text-xs tracking-wider uppercase">{g.questions}</p>
        <Dialog.Title className="text-3xl font-semibold tracking-tight">{g.title}</Dialog.Title>
        <p className="max-w-2xl text-lg text-muted">{g.summary}</p>
        <p className="case-endings mt-1 self-start rounded-lg px-3 py-1.5 font-mono">{g.endings}</p>
      </header>

      {word?.form && (
        <section className="enter rounded-xl border border-border bg-surface px-4 py-3">
          <p className="font-mono text-xs tracking-wider text-muted uppercase">In your text</p>
          <p className="mt-1 text-lg">
            {word.lemma && word.lemma !== word.form && <span className="text-muted">{word.lemma} → </span>}
            <span className="case-mark font-semibold">{word.form}</span>
          </p>
          {word.why && <p className="mt-1 text-sm">{word.why}</p>}
        </section>
      )}

      <Section title="Forming it">
        {g.formation.map((f, i) => (
          <Rule key={i} rule={f.rule} examples={f.examples} />
        ))}
        <Rule rule={`Plural: ${g.plural.rule}`} examples={g.plural.examples} />
      </Section>

      <Section title="When to use it">
        {g.uses.map((u, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <p>{u.rule}</p>
            <p className="text-sm">
              <span className="font-medium">{u.example.fi}</span> <span className="text-muted">— {u.example.en}</span>
            </p>
          </div>
        ))}
      </Section>

      {g.pitfalls.length > 0 && (
        <Section title="Watch out">
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-muted">
            {g.pitfalls.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>
      )}
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="enter flex flex-col gap-3">
      <h3 className="font-mono text-xs font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Rule({ rule, examples }: { rule: string; examples: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p>{rule}</p>
      {examples.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {examples.map((e) => (
            <span key={e} className="rounded-md bg-sunken px-2 py-0.5 font-mono text-sm text-on-sunken">{e}</span>
          ))}
        </p>
      )}
    </div>
  )
}
