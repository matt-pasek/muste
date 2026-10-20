import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { AnswerExercise, AnswerPage } from '../server/answers'
import { loadAnswerKey, loadOcr, saveAnswerKey } from './db'
import { getWords, readText } from './ocr'

export type AnswerKey = {
  from: number
  to: number
  read: number[]
  exercises: AnswerExercise[]
}

export type IndexState =
  | { status: 'idle' }
  | { status: 'reading'; page: number; done: number; total: number }
  | { status: 'error'; message: string }

const RENDER_WIDTH = 1800
const SECTION_LOOKBACK = 12

let state: IndexState = { status: 'idle' }
const listeners = new Set<() => void>()

export const subscribeIndex = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getIndexState = () => state
const setState = (s: IndexState) => {
  state = s
  for (const l of listeners) l()
}

const keyOf = (e: { section: string; number: number }) => `${e.section.trim().toLowerCase()}#${e.number}`

function merge(exercises: AnswerExercise[], page: AnswerPage): AnswerExercise[] {
  const byKey = new Map(exercises.map((e) => [keyOf(e), e]))
  for (const e of page.exercises) {
    const existing = byKey.get(keyOf(e))
    if (!existing || !e.continued) {
      byKey.set(keyOf(e), e)
      continue
    }
    const parts = [...existing.parts]
    for (const part of e.parts) {
      const last = parts.at(-1)
      if (last && last.label === part.label) parts[parts.length - 1] = { ...last, items: [...last.items, ...part.items] }
      else parts.push(part)
    }
    byKey.set(keyOf(e), { ...existing, parts })
  }
  return [...byKey.values()]
}

async function renderPage(doc: PDFDocumentProxy, n: number) {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}

async function readPage(canvas: HTMLCanvasElement, context: AnswerKey['exercises'][number] | undefined, signal: AbortSignal) {
  const ocr = await readText(canvas)
  const res = await fetch('/api/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: canvas.toDataURL('image/jpeg', 0.85).split(',')[1],
      ocr,
      context: context ? { section: context.section, number: context.number } : null,
    }),
    signal,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as AnswerPage
}

export async function indexAnswerKey(doc: PDFDocumentProxy, pdf: string, from: number, to: number, signal: AbortSignal) {
  const stored = await loadAnswerKey(pdf)
  let key: AnswerKey = stored && stored.from === from && stored.to === to ? stored : { from, to, read: [], exercises: [] }
  const total = to - from + 1
  try {
    for (let n = from; n <= to; n++) {
      if (key.read.includes(n)) continue
      setState({ status: 'reading', page: n, done: key.read.length, total })
      const page = await readPage(await renderPage(doc, n), key.exercises.at(-1), signal)
      key = { ...key, read: [...key.read, n], exercises: merge(key.exercises, page) }
      await saveAnswerKey(pdf, key)
    }
    setState({ status: 'idle' })
    return key
  } catch (err) {
    setState(signal.aborted ? { status: 'idle' } : { status: 'error', message: err instanceof Error ? err.message : String(err) })
    return key
  }
}

const SECTION = /^kappale$/i
const EXTRA = /^lisäharjoitukset$/i

async function sectionOf(pdf: string, page: number) {
  for (let n = page; n > 0 && n > page - SECTION_LOOKBACK; n--) {
    const words = getWords(pdf, n) ?? (await loadOcr(pdf, n))
    if (!words) continue
    if (words.some((w) => EXTRA.test(w.text))) return 'Lisäharjoitukset'
    const i = words.findIndex((w) => SECTION.test(w.text))
    const num = i >= 0 ? words.slice(i + 1, i + 3).map((w) => parseInt(w.text, 10)).find((x) => !Number.isNaN(x)) : undefined
    if (num) return `Kappale ${num}`
  }
  return undefined
}

export async function findAnswers(pdf: string, page: number, title: string): Promise<AnswerExercise[]> {
  const key = await loadAnswerKey(pdf)
  if (!key) return []
  const numbers = [...title.matchAll(/Harjoitus\s*(\d+)/gi)].map((m) => Number(m[1]))
  if (!numbers.length) return []
  const section = await sectionOf(pdf, page)
  return numbers.flatMap((number) => {
    const candidates = key.exercises.filter((e) => e.number === number)
    const exact = section && candidates.filter((e) => keyOf(e) === keyOf({ section, number }))
    return exact && exact.length ? exact : candidates
  })
}
