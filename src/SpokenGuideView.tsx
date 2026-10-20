import { Callout } from '@usva-ui/react/primitives/callout'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import { Waiting } from './DictionaryEntry'
import { guide } from './grammar'
import { useAsync } from './useAsync'

export function SpokenGuideView() {
  const state = useAsync(() => guide('puhekieli'), 'puhekieli')
  if (state.status === 'loading') return <Waiting label="Writing the puhekieli guide… (once, then it’s saved)" />
  if (state.status === 'error') return <Callout tone="danger" title="Couldn’t load the guide">{state.message}</Callout>
  if (state.value.kind !== 'spoken') return null
  const g = state.value
  return (
    <article className="flex flex-col gap-8">
      <header className="enter flex flex-col gap-2">
        <p className="font-mono text-xs tracking-wider text-accent-alt uppercase">Kirjakieli → puhekieli</p>
        <Dialog.Title className="text-3xl font-semibold tracking-tight">{g.title}</Dialog.Title>
        <p className="max-w-2xl text-lg text-muted">{g.summary}</p>
      </header>
      {g.sections.map((section) => (
        <section key={section.title} className="enter flex flex-col gap-3">
          <h3 className="font-semibold">{section.title}</h3>
          <p className="text-muted">{section.rule}</p>
          <dl className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-4 gap-y-1.5">
            {section.pairs.map((pair) => (
              <div key={pair.kirja} className="contents">
                <dt className="text-muted">{pair.kirja}</dt>
                <dd className="spoken-mark font-medium">{pair.puhe}</dd>
                <dd className="text-sm text-muted">{pair.en}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {g.tips.length > 0 && (
        <section className="enter flex flex-col gap-2">
          <h3 className="font-mono text-xs font-semibold tracking-wider text-muted uppercase">Good to know</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-muted">
            {g.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      )}
    </article>
  )
}
