import { Callout } from '@usva-ui/react/primitives/callout'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import { Spinner } from '@usva-ui/react/primitives/spinner'
import type { DictEntry } from '../server/dictionary'
import { caseClass, isCase } from './cases'
import { lookup, tables, type Block } from './dictionary'
import { useOpenReference } from './reference'
import { useAsync } from './useAsync'

export function DictionaryEntry({ word }: { word: string }) {
  const state = useAsync(() => lookup(word), word)
  if (state.status === 'loading') return <Waiting label={`Looking up ${word}…`} />
  if (state.status === 'error') return <Callout tone="danger" title="Dictionary unavailable">{state.message}</Callout>
  if (!state.value.entries.length) {
    return (
      <>
        <Dialog.Title className="text-3xl font-semibold">{word}</Dialog.Title>
        <p className="mt-2 text-muted">No Wiktionary entry for this word.</p>
      </>
    )
  }
  return (
    <div className="flex flex-col gap-10">
      {state.value.entries.map((entry, i) => <Entry key={i} entry={entry} first={i === 0} />)}
      <p className="text-xs text-muted">From Wiktionary (CC BY-SA), via kaikki.org.</p>
    </div>
  )
}

export function Waiting({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-muted">
      <Spinner size="md" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function Entry({ entry, first }: { entry: DictEntry; first: boolean }) {
  const Title = first ? Dialog.Title : 'h2'
  const sections = tables(entry)
  return (
    <article className="flex flex-col gap-6">
      <header className="enter flex flex-col items-center gap-1 text-center">
        <Title className="text-4xl font-light tracking-tight">{entry.word}</Title>
        <p className="text-muted italic">{entry.pos}</p>
        {entry.kotus && (
          <p className="text-sm text-muted">
            Inflection class <span className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-on-sunken">{entry.kotus}</span>
            {entry.gradation && <span className="ml-2">{entry.gradation}</span>}
          </p>
        )}
      </header>
      {entry.senses.length > 0 && (
        <ol className="enter mx-auto flex max-w-xl list-decimal flex-col gap-1 pl-5 marker:text-muted">
          {entry.senses.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {sections.map((section) => (
        <section key={section.title} className="enter overflow-hidden rounded-xl border border-border">
          <h3 className="bg-surface px-4 py-2.5 font-mono text-xs font-semibold tracking-wider uppercase">{section.title}</h3>
          <div className="grid gap-x-10 gap-y-6 p-5 sm:grid-cols-2">
            {section.blocks.map((block) => <FormTable key={block.title || section.title} block={block} />)}
          </div>
        </section>
      ))}
    </article>
  )
}

function FormTable({ block }: { block: Block }) {
  const open = useOpenReference()
  return (
    <div className="flex flex-col gap-2">
      {block.title && <h4 className="font-semibold">{block.title}</h4>}
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1 text-[0.95rem]">
        {block.rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-muted">
              {isCase(label) ? (
                <button className={`case-link ${caseClass(label)}`} onClick={() => open({ kind: 'case', topic: label })}>
                  {label}
                </button>
              ) : (
                label
              )}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
