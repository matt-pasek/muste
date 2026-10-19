import { createStore, get, set } from 'idb-keyval'
import type { Explanation } from '../server/explain'
import type { Stroke } from './ink'

// Everything stays in this browser's IndexedDB. The PDFs are copyrighted and
// are never uploaded anywhere.
const store = createStore('muste', 'kv')

export type StoredPdf = { name: string; data: ArrayBuffer }

export const loadPdf = () => get<StoredPdf>('pdf', store)
export const savePdf = (pdf: StoredPdf) => set('pdf', pdf, store)

export const loadInk = (pdf: string, page: number) =>
  get<Stroke[]>(`ink:${pdf}:${page}`, store).then((s) => s ?? [])
export const saveInk = (pdf: string, page: number, strokes: Stroke[]) =>
  set(`ink:${pdf}:${page}`, strokes, store)

export const loadLastPage = (pdf: string) => get<number>(`last:${pdf}`, store)
export const saveLastPage = (pdf: string, page: number) => set(`last:${pdf}`, page, store)

export const loadExplanation = (key: string) => get<Explanation>(`explain:${key}`, store)
export const saveExplanation = (key: string, value: Explanation) => set(`explain:${key}`, value, store)
