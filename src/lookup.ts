import { partialParse } from '@anthropic-ai/sdk/_vendor/partial-json-parser/parser'
import type { ExplainEvent, Explanation, RegionLookup } from '../server/explain'
import {
  loadExplanations,
  loadTextExplanation,
  saveExplanations,
  saveTextExplanation,
  type CachedExplanation,
} from './db'

export type Rect = { x: number; y: number; w: number; h: number }

export type WordText = { word: string; line: string }

export type LookupRequest =
  | { kind: 'word'; at: { x: number; y: number }; box?: Rect; text?: WordText }
  | { kind: 'region'; rect: Rect }

export type Anchor = { top: number; bottom: number; left: number; right: number }

export type LookupTarget = {
  page: number
  req: LookupRequest
  drawn?: Rect
  crop: () => string
  anchor: Anchor
}

const MAX_SIDE = 1400
const INK_THRESHOLD = 170
const SNAP_PAD = 3

export function snapToContent(source: HTMLCanvasElement, pxPerUnit: number, rect: Rect): Rect {
  const sx = Math.max(0, Math.floor(rect.x * pxPerUnit))
  const sy = Math.max(0, Math.floor(rect.y * pxPerUnit))
  const sw = Math.min(source.width - sx, Math.ceil(rect.w * pxPerUnit))
  const sh = Math.min(source.height - sy, Math.ceil(rect.h * pxPerUnit))
  if (sw <= 0 || sh <= 0) return rect
  const { data } = source.getContext('2d')!.getImageData(sx, sy, sw, sh)
  let minX = sw, minY = sh, maxX = -1, maxY = -1
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4
      if (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < INK_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return rect
  const x = Math.max(rect.x, (sx + minX) / pxPerUnit - SNAP_PAD)
  const y = Math.max(rect.y, (sy + minY) / pxPerUnit - SNAP_PAD)
  return {
    x,
    y,
    w: Math.min(rect.x + rect.w, (sx + maxX + 1) / pxPerUnit + SNAP_PAD) - x,
    h: Math.min(rect.y + rect.h, (sy + maxY + 1) / pxPerUnit + SNAP_PAD) - y,
  }
}
const WORD_RADIUS = 8
const MIN_REGION_OVERLAP = 0.7

export function cropPage(source: HTMLCanvasElement, pxPerUnit: number, req: LookupRequest, pageW: number) {
  const rect: Rect =
    req.kind === 'region'
      ? req.rect
      : { x: 0, y: Math.max(0, req.at.y - 30), w: pageW, h: 60 }
  const sx = rect.x * pxPerUnit
  const sy = rect.y * pxPerUnit
  const sw = rect.w * pxPerUnit
  const sh = rect.h * pxPerUnit
  const fit = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.round(sw * fit)
  out.height = Math.round(sh * fit)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height)
  if (req.kind === 'word') {
    const k = pxPerUnit * fit
    ctx.strokeStyle = 'rgba(230, 0, 0, 0.85)'
    ctx.lineWidth = Math.max(2, 1.2 * k)
    ctx.beginPath()
    if (req.box) {
      const b = req.box
      ctx.roundRect((b.x - rect.x - 2) * k, (b.y - rect.y - 2) * k, (b.w + 4) * k, (b.h + 4) * k, 3 * k)
    } else {
      ctx.arc((req.at.x - rect.x) * k, (req.at.y - rect.y) * k, 9 * k, 0, Math.PI * 2)
    }
    ctx.stroke()
  }
  return out.toDataURL('image/jpeg', 0.85).split(',')[1]
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.w * a.h + b.w * b.h - inter)
}

export function sameLookup(a: LookupRequest, b: LookupRequest) {
  if (a.kind === 'word' && b.kind === 'word') {
    if (a.box && b.box) return overlap(a.box, b.box) >= MIN_REGION_OVERLAP
    return Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) <= WORD_RADIUS
  }
  if (a.kind === 'region' && b.kind === 'region') return overlap(a.rect, b.rect) >= MIN_REGION_OVERLAP
  return false
}

export type PartialExplanation = DeepPartial<Explanation>
export type PartialRegion = DeepPartial<RegionLookup>
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

async function* readEvents(res: Response): AsyncGenerator<ExplainEvent> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) if (line) yield JSON.parse(line)
  }
}

export async function explain(
  pdf: string,
  page: number,
  req: LookupRequest,
  image: () => string,
  onPartial: (partial: PartialExplanation) => void,
  signal: AbortSignal,
): Promise<Explanation> {
  const ocrText = req.kind === 'word' ? req.text : undefined
  const textKey = ocrText && `${ocrText.word}|${ocrText.line}`.toLowerCase()
  const cached = textKey
    ? await loadTextExplanation(textKey)
    : (await loadExplanations(pdf, page)).find((c) => sameLookup(c.req, req))?.result
  if (cached) return cached
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ocrText ? { kind: req.kind, text: ocrText } : { kind: req.kind, image: image() }),
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  let text = ''
  for await (const event of readEvents(res)) {
    if (event.type === 'error') throw new Error(event.message)
    if (event.type === 'done') {
      if (textKey) {
        await saveTextExplanation(textKey, event.result)
      } else {
        const entry: CachedExplanation = { req, result: event.result }
        await saveExplanations(pdf, page, [...(await loadExplanations(pdf, page)), entry])
      }
      return event.result
    }
    text = event.type === 'reset' ? '' : text + event.text
    const partial = text ? (partialParse(text) as PartialExplanation) : {}
    onPartial(req.kind === 'word' ? { ...partial, kind: 'word' } : partial)
  }
  throw new Error('The connection closed before the explanation finished')
}
