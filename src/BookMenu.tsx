import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@usva-ui/react/primitives/button'
import { Callout } from '@usva-ui/react/primitives/callout'
import { Input } from '@usva-ui/react/primitives/input'
import { Popover } from '@usva-ui/react/primitives/popover'
import { Progress } from '@usva-ui/react/primitives/progress'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getIndexState, indexAnswerKey, subscribeIndex, type AnswerKey } from './answers'
import { loadAnswerKey } from './db'
import { BookIcon } from './icons'

type Props = { doc: PDFDocumentProxy; pdf: string; onOpen: () => void }

export function BookMenu({ doc, pdf, onOpen }: Props) {
  return (
    <Popover>
      <Popover.Trigger render={<Button variant="ghost" shape="pill" iconOnly aria-label="Book" />}>
        <BookIcon />
      </Popover.Trigger>
      <Popover.Content side="top" align="start" sideOffset={14} className="w-[min(340px,calc(100vw-32px))]">
        <div className="flex flex-col gap-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Popover.Title className="truncate">{pdf}</Popover.Title>
              <Popover.Description>{doc.numPages} pages</Popover.Description>
            </div>
            <Button variant="soft" size="sm" onClick={onOpen}>Open another</Button>
          </header>
          <div className="h-px bg-border" />
          <AnswerKeySection doc={doc} pdf={pdf} />
        </div>
      </Popover.Content>
    </Popover>
  )
}

function AnswerKeySection({ doc, pdf }: { doc: PDFDocumentProxy; pdf: string }) {
  const state = useSyncExternalStore(subscribeIndex, getIndexState)
  const [key, setKey] = useState<AnswerKey | null | undefined>(undefined)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    loadAnswerKey(pdf).then((k) => {
      setKey(k ?? null)
      if (k) {
        setFrom(String(k.from))
        setTo(String(k.to))
      }
    })
  }, [pdf, state.status])

  const range = { from: Number(from), to: Number(to) }
  const validRange =
    Number.isInteger(range.from) && Number.isInteger(range.to) && range.from >= 1 && range.to <= doc.numPages && range.from <= range.to
  const pages = validRange ? range.to - range.from + 1 : 0
  const complete = key && key.read.length === key.to - key.from + 1

  const start = async () => {
    ctrl.current = new AbortController()
    setKey(await indexAnswerKey(doc, pdf, range.from, range.to, ctrl.current.signal))
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Answer key</h3>
        {complete && state.status === 'idle' && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            {key.exercises.length} exercises · p. {key.from}–{key.to}
          </span>
        )}
      </div>

      {state.status === 'reading' && (
        <div className="flex flex-col gap-2">
          <Progress value={state.done} max={state.total} size="sm" glow />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Reading page {state.page} · {state.done} of {state.total} done</span>
            <Button variant="ghost" size="sm" onClick={() => ctrl.current?.abort()}>Stop</Button>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <Callout tone="danger" title="Stopped on a page" action={<Button size="sm" variant="soft" onClick={start}>Resume</Button>}>
          {state.message}
        </Callout>
      )}

      {state.status === 'idle' && !complete && key !== undefined && (
        <>
          <p className="text-sm text-muted">
            The pages titled “Harjoitusten ratkaisut” at the back. Each is sent to Claude once, about $0.15 a page.
          </p>
          <div className="flex items-center gap-2">
            <Input inputMode="numeric" aria-label="First page" placeholder="From" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted">–</span>
            <Input inputMode="numeric" aria-label="Last page" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="solid" disabled={!validRange} onClick={start}>
            {key?.read.length ? `Continue reading (${key.read.length}/${pages} done)` : pages ? `Read ${pages} pages` : 'Read answer key'}
          </Button>
        </>
      )}

      {state.status === 'idle' && complete && (
        <p className="text-sm text-muted">Box an exercise with Explain to see its answers.</p>
      )}
    </section>
  )
}
