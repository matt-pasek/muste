import { saveInk } from './db'
import type { Stroke } from './ink'

type Change = { pdf: string; page: number; before: Stroke[]; after: Stroke[] }
type PageListener = (strokes: Stroke[]) => void
export type Notice = { id: number; label: string }

const LIMIT = 200

let undoStack: Change[] = []
let redoStack: Change[] = []
const pages = new Map<string, PageListener>()
const noticeListeners = new Set<() => void>()
let notice: Notice | null = null
let noticeId = 0

const pageKey = (pdf: string, page: number) => `${pdf}:${page}`

export function watchPage(pdf: string, page: number, listener: PageListener) {
  const key = pageKey(pdf, page)
  pages.set(key, listener)
  return () => {
    if (pages.get(key) === listener) pages.delete(key)
  }
}

export function record(change: Change) {
  undoStack = [...undoStack.slice(-(LIMIT - 1)), change]
  redoStack = []
}

function apply(change: Change, strokes: Stroke[]) {
  pages.get(pageKey(change.pdf, change.page))?.(strokes)
  return saveInk(change.pdf, change.page, strokes)
}

function announce(label: string) {
  notice = { id: ++noticeId, label }
  for (const l of noticeListeners) l()
}

export function undo() {
  const change = undoStack.at(-1)
  if (!change) return announce('Nothing to undo')
  undoStack = undoStack.slice(0, -1)
  redoStack = [...redoStack, change]
  void apply(change, change.before)
  announce(`Undo · page ${change.page}`)
}

export function redo() {
  const change = redoStack.at(-1)
  if (!change) return announce('Nothing to redo')
  redoStack = redoStack.slice(0, -1)
  undoStack = [...undoStack, change]
  void apply(change, change.after)
  announce(`Redo · page ${change.page}`)
}

export const subscribeNotice = (l: () => void) => {
  noticeListeners.add(l)
  return () => noticeListeners.delete(l)
}
export const getNotice = () => notice
export const showNotice = announce
