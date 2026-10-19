// Legacy build: the modern one relies on very new JS (Map.getOrInsertComputed)
// that not every browser ships yet (it failed in headless Chromium here).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLastPage, loadPdf, saveLastPage, savePdf, type StoredPdf } from './db'
import { ExplainSheet, type SheetState } from './ExplainSheet'
import { cacheKey, cropPage, explain, type LookupRequest } from './lookup'
import { PdfPage, type Tool } from './PdfPage'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function App() {
  const [pdf, setPdf] = useState<StoredPdf | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [aspect, setAspect] = useState(1.414)
  const [tool, setTool] = useState<Tool>('pen')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [width, setWidth] = useState(() => Math.min(window.innerWidth - 24, 900))
  const scrolled = useRef(false)

  useEffect(() => {
    loadPdf().then((p) => p && setPdf(p))
    const onResize = () => setWidth(Math.min(window.innerWidth - 24, 900))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!pdf) return
    scrolled.current = false
    // pdf.js takes ownership of the buffer, so hand it a copy.
    const task = pdfjs.getDocument({ data: pdf.data.slice(0) })
    task.promise.then(async (d) => {
      const first = (await d.getPage(1)).getViewport({ scale: 1 })
      setAspect(first.height / first.width)
      setDoc(d)
    }).catch(() => {
      // Superseded by a newer load (or StrictMode's double effect); nothing to do.
    })
    return () => {
      task.destroy()
      setDoc(null)
    }
  }, [pdf])

  // Resume where you left off.
  useEffect(() => {
    if (!doc || !pdf || scrolled.current) return
    scrolled.current = true
    loadLastPage(pdf.name).then((n) => {
      if (n) requestAnimationFrame(() => document.querySelector(`[data-page="${n}"]`)?.scrollIntoView())
    })
  }, [doc, pdf])

  const onVisible = useCallback((n: number) => pdf && saveLastPage(pdf.name, n), [pdf])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const stored = { name: file.name, data: await file.arrayBuffer() }
    await savePdf(stored)
    setPdf(stored)
  }

  const onLookup = useCallback(
    async (page: number, req: LookupRequest, source: HTMLCanvasElement, pxPerUnit: number, pageW: number) => {
      if (!pdf) return
      setSheet({ status: 'loading' })
      try {
        const image = cropPage(source, pxPerUnit, req, pageW)
        const result = await explain(cacheKey(pdf.name, page, req), req.kind, image)
        setSheet({ status: 'done', result })
      } catch (err) {
        setSheet({ status: 'error', message: String(err) })
      }
    },
    [pdf],
  )

  return (
    <>
      <header className="bar">
        <strong>muste</strong>
        <div className="tools">
          {(['pen', 'eraser', 'box'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
              {t === 'box' ? 'Explain area' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <label className="open">
          {pdf ? pdf.name : 'Open PDF'}
          <input type="file" accept="application/pdf" onChange={onFile} hidden />
        </label>
      </header>
      <main className="pages">
        {!doc && <p className="muted">Open a textbook PDF. It stays on this device.</p>}
        {doc && pdf &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage
              key={`${pdf.name}:${i + 1}`}
              doc={doc}
              pdfKey={pdf.name}
              pageNum={i + 1}
              width={width}
              aspect={aspect}
              tool={tool}
              onVisible={onVisible}
              onLookup={onLookup}
            />
          ))}
      </main>
      {sheet && <ExplainSheet state={sheet} onClose={() => setSheet(null)} />}
    </>
  )
}
