import { createStore, get, keys, set } from 'idb-keyval'
import type { DictResult } from '../server/dictionary'
import type { Explanation } from '../server/explain'
import type { Guide, Topic } from '../server/grammar'
import type { AnswerKey } from './answers'
import type { Stroke } from './ink'
import type { LookupRequest } from './lookup'
import type { OcrWord } from './ocr'

const store = createStore('muste', 'kv')

export type StoredPdf = { name: string; data: ArrayBuffer }

export const loadPdf = () => get<StoredPdf>('pdf', store)
export const savePdf = (pdf: StoredPdf) => set('pdf', pdf, store)

export const loadInk = (pdf: string, page: number) =>
  get<Stroke[]>(`ink:${pdf}:${page}`, store).then((s) => s ?? [])
export const saveInk = (pdf: string, page: number, strokes: Stroke[]) =>
  set(`ink:${pdf}:${page}`, strokes, store)

export async function unstretchInk(pdf: string, aspects: number[]) {
  const flag = `inkfix1:${pdf}`
  if (await get<boolean>(flag, store)) return
  const prefix = `ink:${pdf}:`
  const inkKeys = (await keys<string>(store)).filter((k) => typeof k === 'string' && k.startsWith(prefix))
  await Promise.all(
    inkKeys.map(async (key) => {
      const page = Number(key.slice(prefix.length))
      const factor = aspects[page - 1] / aspects[0]
      const strokes = await get<Stroke[]>(key, store)
      if (!strokes || !factor || factor === 1) return
      const fixed = strokes.map((s) => ({ points: s.points.map(([x, y, p]) => [x, y * factor, p] as [number, number, number]) }))
      await set(key, fixed, store)
    }),
  )
  await set(flag, true, store)
}

export const loadLastPage =(pdf: string) => get<number>(`last:${pdf}`, store)
export const saveLastPage = (pdf: string, page: number) => set(`last:${pdf}`, page, store)

export const loadOcr = (pdf: string, page: number) => get<OcrWord[]>(`ocr1:${pdf}:${page}`, store)
export const saveOcr = (pdf: string, page: number, words: OcrWord[]) => set(`ocr1:${pdf}:${page}`, words, store)

export const loadTextExplanation = (key: string) => get<Explanation>(`explainw1:${key}`, store)
export const saveTextExplanation = (key: string, value: Explanation) => set(`explainw1:${key}`, value, store)

export const loadAnswerKey = (pdf: string) => get<AnswerKey>(`answers1:${pdf}`, store)
export const saveAnswerKey = (pdf: string, key: AnswerKey) => set(`answers1:${pdf}`, key, store)

export const loadDict = (word: string) => get<DictResult>(`dict1:${word}`, store)
export const saveDict = (word: string, value: DictResult) => set(`dict1:${word}`, value, store)

export const loadGuide = (topic: Topic) => get<Guide>(`guide2:${topic}`, store)
export const saveGuide = (topic: Topic, value: Guide) => set(`guide2:${topic}`, value, store)

export const loadSpeech = (key: string) => get<ArrayBuffer>(`tts2:${key}`, store)
export const saveSpeech = (key: string, audio: ArrayBuffer) => set(`tts2:${key}`, audio, store)

export type CachedExplanation = { req: LookupRequest; result: Explanation }

export const loadExplanations = (pdf: string, page: number) =>
  get<CachedExplanation[]>(`explain2:${pdf}:${page}`, store).then((e) => e ?? [])
export const saveExplanations = (pdf: string, page: number, entries: CachedExplanation[]) =>
  set(`explain2:${pdf}:${page}`, entries, store)
