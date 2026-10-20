import type { Rect } from './lookup'
import type { OcrWord } from './ocr'

export const TRUSTED_CONF = 80
const TAP_REACH = 6
const LINE_GAP = 2.5
const NOISE_CONF = 50

const HAS_LETTER = /\p{L}{2,}/u
const center = (b: Rect) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const distance = (b: Rect, x: number, y: number) =>
  Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)))

export const isTrusted = (w: OcrWord) => w.conf >= TRUSTED_CONF && HAS_LETTER.test(w.text)

export function wordAt(words: OcrWord[], x: number, y: number) {
  let best: OcrWord | undefined
  let bestD = TAP_REACH
  for (const w of words) {
    const d = distance(w.box, x, y)
    if (d <= bestD) {
      best = w
      bestD = d
    }
  }
  return best
}

const sameRow = (a: Rect, b: Rect) => {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return overlap > 0.5 * Math.min(a.h, b.h)
}

const PAGE_TEXT_LIMIT = 3500

export const textOf = (words: OcrWord[]) =>
  words.filter((w) => !isNoise(w)).map((w) => w.text).join(' ').slice(0, PAGE_TEXT_LIMIT)

const isNoise =(w: OcrWord) => w.conf < NOISE_CONF || !(HAS_LETTER.test(w.text) || /\d/.test(w.text))

export function lineOf(words: OcrWord[], word: OcrWord) {
  const row = words
    .filter((w) => w === word || (sameRow(w.box, word.box) && !isNoise(w)))
    .sort((a, b) => a.box.x - b.box.x)
  const i = row.indexOf(word)
  const maxGap = LINE_GAP * word.box.h
  let start = i
  while (start > 0 && row[start].box.x - (row[start - 1].box.x + row[start - 1].box.w) < maxGap) start--
  let end = i
  while (end < row.length - 1 && row[end + 1].box.x - (row[end].box.x + row[end].box.w) < maxGap) end++
  return row.slice(start, end + 1).map((w) => w.text).join(' ')
}

export function snapToWords(words: OcrWord[], rect: Rect, pad = 3): Rect | undefined {
  const inside = words.filter((w) => {
    const c = center(w.box)
    return c.x >= rect.x && c.x <= rect.x + rect.w && c.y >= rect.y && c.y <= rect.y + rect.h
  })
  if (!inside.length) return undefined
  const x0 = Math.min(...inside.map((w) => w.box.x)) - pad
  const y0 = Math.min(...inside.map((w) => w.box.y)) - pad
  const x1 = Math.max(...inside.map((w) => w.box.x + w.box.w)) + pad
  const y1 = Math.max(...inside.map((w) => w.box.y + w.box.h)) + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
