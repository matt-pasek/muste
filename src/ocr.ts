import { createWorker, PSM, type Worker } from 'tesseract.js'
import { loadOcr, saveOcr } from './db'
import type { Rect } from './lookup'

export type OcrWord = { text: string; conf: number; box: Rect }

export type OcrStatus = 'idle' | 'queued' | 'reading' | 'done' | 'error'

type Job = { key: string; pdf: string; page: number; canvas: HTMLCanvasElement; pxPerUnit: number }

const MODE = PSM.SPARSE_TEXT

const status = new Map<string, OcrStatus>()
const words = new Map<string, OcrWord[]>()
const listeners = new Set<() => void>()
const queue: Job[] = []
let worker: Promise<Worker> | null = null
let running = false

const pageKey = (pdf: string, page: number) => `${pdf}:${page}`

const setStatus = (key: string, s: OcrStatus) => {
  status.set(key, s)
  for (const l of listeners) l()
}

export const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getStatus = (pdf: string, page: number) => status.get(pageKey(pdf, page)) ?? 'idle'
export const getWords = (pdf: string, page: number) => words.get(pageKey(pdf, page))

const getWorker = () => {
  worker ??= createWorker('fin').then(async (w) => {
    await w.setParameters({ tessedit_pageseg_mode: MODE })
    return w
  })
  return worker
}

async function run(job: Job) {
  if (!job.canvas.width) {
    setStatus(job.key, 'idle')
    return
  }
  setStatus(job.key, 'reading')
  const w = await getWorker()
  const { data } = await w.recognize(job.canvas, {}, { blocks: true })
  const found: OcrWord[] = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
    .filter((w) => w.text.trim())
    .map((w) => ({
      text: w.text,
      conf: Math.round(w.confidence),
      box: {
        x: w.bbox.x0 / job.pxPerUnit,
        y: w.bbox.y0 / job.pxPerUnit,
        w: (w.bbox.x1 - w.bbox.x0) / job.pxPerUnit,
        h: (w.bbox.y1 - w.bbox.y0) / job.pxPerUnit,
      },
    }))
  words.set(job.key, found)
  await saveOcr(job.pdf, job.page, found)
  setStatus(job.key, 'done')
}

async function drain() {
  if (running) return
  running = true
  while (queue.length) {
    const job = queue.shift()!
    try {
      await run(job)
    } catch (err) {
      console.error('OCR failed for page', job.page, err)
      setStatus(job.key, 'error')
    }
  }
  running = false
}

export async function ensureOcr(pdf: string, page: number, canvas: HTMLCanvasElement, pxPerUnit: number) {
  const key = pageKey(pdf, page)
  const s = status.get(key)
  if (s === 'done' || s === 'queued' || s === 'reading') return
  const stored = await loadOcr(pdf, page)
  if (stored) {
    words.set(key, stored)
    setStatus(key, 'done')
    return
  }
  queue.push({ key, pdf, page, canvas, pxPerUnit })
  setStatus(key, 'queued')
  void drain()
}

export async function readText(canvas: HTMLCanvasElement) {
  const w = await getWorker()
  const { data } = await w.recognize(canvas)
  return data.text
}

export function prioritise(pdf: string, page: number) {
  const key = pageKey(pdf, page)
  const i = queue.findIndex((j) => j.key === key)
  if (i > 0) queue.unshift(...queue.splice(i, 1))
}
