import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { EmptyState } from '@usva-ui/react/patterns/empty-state'
import { Button } from '@usva-ui/react/primitives/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnswerExercise } from '../server/answers'
import { findAnswers } from './answers'
import { BookMenu } from './BookMenu'
import { ReferenceContext, type Reference } from './reference'
import { ReferenceSheet } from './ReferenceSheet'
import { useFingerTaps } from './fingers'
import { GestureToast } from './GestureToast'
import { redo, undo } from './history'
import { DEFAULT_INK, INKS } from './ink'
import { loadLastPage, loadPdf, saveLastPage, savePdf, unstretchInk, type StoredPdf } from './db'
import { Conversation } from './Conversation'
import { Dock } from './Dock'
import { getWords } from './ocr'
import { useConversation } from './useConversation'
import { useRegister } from './useRegister'
import { textOf } from './words'
import { ExplainPanel, type SheetState } from './ExplainPanel'
import { BookIcon } from './icons'
import { explain, type Anchor, type LookupTarget, type PartialExplanation } from './lookup'
import { PdfPage, type Tool } from './PdfPage'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const pageWidth = () => Math.min(window.innerWidth - 32, 900)

const INK_KEY = 'muste:ink'
const FINGER_TAPS = { two: undo, three: redo }

function loadInkColor() {
  try {
    const saved = localStorage.getItem(INK_KEY)
    return INKS.some((i) => i.color === saved) ? saved! : DEFAULT_INK
  } catch {
    return DEFAULT_INK
  }
}

function saveInkColor(color: string) {
  try {
    localStorage.setItem(INK_KEY, color)
  } catch {
    return
  }
}

type Active = { target: LookupTarget; anchor: Anchor; sheet: SheetState }

export default function App() {
  const [pdf, setPdf] = useState<StoredPdf | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [aspects, setAspects] = useState<number[]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [inkColor, setInkColor] = useState(loadInkColor)
  useFingerTaps(FINGER_TAPS)
  const [active, setActive] = useState<Active | null>(null)
  const [reference, setReference] = useState<Reference | null>(null)
  const [found, setFound] = useState<{ for: string; list: AnswerExercise[] }>({ for: '', list: [] })
  const [width, setWidth] = useState(pageWidth)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrolled = useRef(false)

  useEffect(() => {
    loadPdf().then((p) => p && setPdf(p))
    const onResize = () => setWidth(pageWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!pdf) return
    scrolled.current = false
    const task = pdfjs.getDocument({ data: pdf.data.slice(0) })
    task.promise.then(async (d) => {
      const sizes = await Promise.all(
        Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1).then((p) => p.getViewport({ scale: 1 }))),
      )
      const ratios = sizes.map((v) => v.height / v.width)
      await unstretchInk(pdf.name, ratios)
      setAspects(ratios)
      setDoc(d)
    }).catch(() => {
    })
    return () => {
      task.destroy()
      setDoc(null)
    }
  }, [pdf])

  useEffect(() => {
    if (!doc || !pdf || scrolled.current) return
    scrolled.current = true
    loadLastPage(pdf.name).then((n) => {
      if (n) requestAnimationFrame(() => document.querySelector(`[data-page="${n}"]`)?.scrollIntoView())
    })
  }, [doc, pdf])

  const visiblePage = useRef(1)
  const onVisible = useCallback(
    (n: number) => {
      visiblePage.current = n
      if (pdf) saveLastPage(pdf.name, n)
    },
    [pdf],
  )
  const pageText = useCallback(() => (pdf ? textOf(getWords(pdf.name, visiblePage.current) ?? []) : ''), [pdf])
  const [talking, setTalking] = useState(false)
  const [register, setRegister] = useRegister()
  const chat = useConversation(pageText, register)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const stored = { name: file.name, data: await file.arrayBuffer() }
    await savePdf(stored)
    setPdf(stored)
  }

  const inflight = useRef<AbortController | null>(null)

  const close = useCallback(() => {
    inflight.current?.abort()
    inflight.current = null
    setActive(null)
  }, [])

  const onLookup = useCallback(
    async (target: LookupTarget) => {
      if (!pdf) return
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl
      const show = (sheet: SheetState) => {
        if (!ctrl.signal.aborted) setActive({ target, anchor: target.anchor, sheet })
      }
      show({ status: 'loading' })
      try {
        const onPartial = (partial: PartialExplanation) => show({ status: 'streaming', result: partial })
        const result = await explain(pdf.name, target.page, target.req, target.crop, onPartial, ctrl.signal)
        show({ status: 'done', result })
      } catch (err) {
        show({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        if (inflight.current === ctrl) inflight.current = null
      }
    },
    [pdf],
  )

  const exerciseTitle =
    active?.sheet.status === 'done' && active.sheet.result.kind === 'exercise' ? active.sheet.result.fi : undefined
  const activePage = active?.target.page

  const answersFor = exerciseTitle && `${activePage}|${exerciseTitle}`
  const answers = found.for === answersFor ? found.list : []

  useEffect(() => {
    if (!pdf || !exerciseTitle || !activePage || !answersFor) return
    let cancelled = false
    findAnswers(pdf.name, activePage, exerciseTitle).then((list) => !cancelled && setFound({ for: answersFor, list }))
    return () => {
      cancelled = true
    }
  }, [pdf, activePage, exerciseTitle, answersFor])

  const busy = active?.sheet.status === 'loading' || active?.sheet.status === 'streaming'
  const openFile = () => fileRef.current?.click()

  return (
    <ReferenceContext.Provider value={setReference}>
      <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} hidden />
      <main className="safe-top flex flex-col items-center gap-4 px-4 pb-32">
        {!doc && (
          <div className="mt-[20vh] w-full max-w-md">
            <EmptyState
              variant="dashed"
              icon={<BookIcon />}
              title="Open your textbook"
              description="The PDF stays on this device. Write with the Pencil, tap a word to have it explained."
              action={<Button variant="solid" onClick={openFile}>Open PDF</Button>}
            />
          </div>
        )}
        {doc && pdf &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage
              key={`${pdf.name}:${i + 1}`}
              doc={doc}
              pdfKey={pdf.name}
              pageNum={i + 1}
              width={width}
              aspect={aspects[i]}
              tool={tool}
              inkColor={inkColor}
              focus={active?.target.page === i + 1 ? { req: active.target.req, drawn: active.target.drawn, busy } : undefined}
              onVisible={onVisible}
              onLookup={onLookup}
            />
          ))}
      </main>
      {doc && pdf && (
        <Dock
          tool={tool}
          onTool={setTool}
          inkColor={inkColor}
          onInkColor={(c) => {
            setInkColor(c)
            saveInkColor(c)
          }}
          menu={<BookMenu doc={doc} pdf={pdf.name} onOpen={openFile} />}
          onTalk={() => {
            setTalking(true)
            void chat.open()
          }}
        />
      )}
      <Conversation
        open={talking}
        chat={chat}
        register={register}
        onRegister={setRegister}
        onClose={() => {
          chat.close()
          setTalking(false)
        }}
      />
      <GestureToast />
      <ReferenceSheet reference={reference} onClose={() => setReference(null)} />
      {active && <ExplainPanel state={active.sheet} anchor={active.anchor} answers={answers} onClose={close} />}
    </ReferenceContext.Provider>
  )
}
