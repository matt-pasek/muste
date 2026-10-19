import type { Explanation } from '../server/explain'
import { loadExplanation, saveExplanation } from './db'

export type Rect = { x: number; y: number; w: number; h: number }

export type LookupRequest =
  | { kind: 'word'; at: { x: number; y: number } }
  | { kind: 'region'; rect: Rect }

const MAX_SIDE = 1400

// Crops the rendered page (ink excluded, it lives on its own canvas) and, for
// a word lookup, rings the tapped spot so Claude knows which word is meant.
// All coordinates are in PDF units; `pxPerUnit` maps them to canvas pixels.
export function cropPage(source: HTMLCanvasElement, pxPerUnit: number, req: LookupRequest, pageW: number) {
  const rect: Rect =
    req.kind === 'region'
      ? req.rect
      : { x: 0, y: Math.max(0, req.at.y - 30), w: pageW, h: 60 } // the tapped line plus one line either side
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
    ctx.arc((req.at.x - rect.x) * k, (req.at.y - rect.y) * k, 9 * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  return out.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export function cacheKey(pdf: string, page: number, req: LookupRequest) {
  const q = (n: number) => Math.round(n / 4) // ~4pt grid so near-identical taps share a result
  return req.kind === 'word'
    ? `${pdf}:${page}:w:${q(req.at.x)}:${q(req.at.y)}`
    : `${pdf}:${page}:r:${q(req.rect.x)}:${q(req.rect.y)}:${q(req.rect.w)}:${q(req.rect.h)}`
}

export async function explain(key: string, kind: LookupRequest['kind'], image: string): Promise<Explanation> {
  const cached = await loadExplanation(key)
  if (cached) return cached
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, image }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  await saveExplanation(key, body)
  return body
}
