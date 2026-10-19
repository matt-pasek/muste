import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { loadInk, saveInk } from './db'
import { drawStroke, strokeHit, type Stroke } from './ink'
import type { LookupRequest } from './lookup'

export type Tool = 'pen' | 'eraser' | 'box'

type Props = {
  doc: PDFDocumentProxy
  pdfKey: string
  pageNum: number
  width: number // CSS px
  aspect: number // height / width
  tool: Tool
  onVisible: (page: number) => void
  onLookup: (page: number, req: LookupRequest, source: HTMLCanvasElement, pxPerUnit: number, pageW: number) => void
}

const TAP_MS = 300
const TAP_SLOP = 8

export function PdfPage({ doc, pdfKey, pageNum, width, aspect, tool, onVisible, onLookup }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [pageW, setPageW] = useState(0) // PDF units
  const strokes = useRef<Stroke[]>([])
  const scale = pageW ? width / pageW : 1 // CSS px per PDF unit
  const dpr = window.devicePixelRatio || 1
  const height = Math.round(width * aspect)

  // Render only pages near the viewport; a full textbook of canvases would
  // exhaust iPad memory.
  useEffect(() => {
    const el = wrapRef.current!
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1500px 0px' })
    const seen = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(pageNum), { threshold: 0.5 })
    io.observe(el)
    seen.observe(el)
    return () => {
      io.disconnect()
      seen.disconnect()
    }
  }, [pageNum, onVisible])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    let task: { cancel: () => void } | undefined
    const canvases = [pdfRef.current, inkRef.current, liveRef.current]
    ;(async () => {
      const page = await doc.getPage(pageNum)
      const base = page.getViewport({ scale: 1 })
      if (cancelled) return
      setPageW(base.width)
      const viewport = page.getViewport({ scale: (width / base.width) * dpr })
      const canvas = pdfRef.current!
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const t = page.render({ canvas, viewport })
      task = t
      await t.promise.catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
      // Free the backing store when the page scrolls far away.
      for (const c of canvases) if (c) c.width = c.height = 0
    }
  }, [near, doc, pageNum, width, dpr])

  const redrawInk = () => {
    const c = inkRef.current
    if (!c || !pageW) return
    c.width = Math.floor(width * dpr)
    c.height = Math.floor(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#1b3a8a'
    for (const s of strokes.current) drawStroke(ctx, s, scale)
  }

  useEffect(() => {
    if (!near || !pageW) return
    let cancelled = false
    loadInk(pdfKey, pageNum).then((s) => {
      if (cancelled) return
      strokes.current = s
      redrawInk()
      const live = liveRef.current!
      live.width = Math.floor(width * dpr)
      live.height = Math.floor(height * dpr)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, pageW, pdfKey, pageNum, width, height, dpr])

  // Safari scrolls (and starts Scribble) on Pencil touches unless the touch is
  // cancelled. Fingers still pan and pinch-zoom natively.
  useEffect(() => {
    const el = liveRef.current!
    const block = (e: TouchEvent) => {
      for (const t of Array.from(e.touches)) if ((t as Touch & { touchType?: string }).touchType === 'stylus') {
        e.preventDefault()
        return
      }
    }
    el.addEventListener('touchstart', block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    return () => {
      el.removeEventListener('touchstart', block)
      el.removeEventListener('touchmove', block)
    }
  }, [])

  const current = useRef<Stroke | null>(null)
  const boxStart = useRef<{ x: number; y: number } | null>(null)
  const tap = useRef<{ id: number; x: number; y: number; t: number } | null>(null)

  const toPage = (e: PointerEvent | React.PointerEvent) => {
    const r = liveRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const liveCtx = () => {
    const ctx = liveRef.current!.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    return ctx
  }

  const lookup = (req: LookupRequest) => onLookup(pageNum, req, pdfRef.current!, scale * dpr, pageW)

  const erase = (x: number, y: number) => {
    const before = strokes.current.length
    strokes.current = strokes.current.filter((s) => !strokeHit(s, x, y, 6))
    if (strokes.current.length !== before) {
      redrawInk()
      saveInk(pdfKey, pageNum, strokes.current)
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pageW) return
    const p = toPage(e)
    if (e.pointerType === 'touch') {
      tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Capture is best-effort; drawing still works without it.
    }
    if (tool === 'pen') current.current = { points: [[p.x, p.y, e.pressure || 0.5]] }
    else if (tool === 'eraser') erase(p.x, p.y)
    else boxStart.current = p
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
    const events = coalesced.length ? coalesced : [e.nativeEvent]
    if (current.current) {
      for (const ev of events) {
        const p = toPage(ev)
        current.current.points.push([p.x, p.y, ev.pressure || 0.5])
      }
      const ctx = liveCtx()
      ctx.fillStyle = '#1b3a8a'
      drawStroke(ctx, current.current, scale)
    } else if (tool === 'eraser' && e.buttons) {
      for (const ev of events) {
        const p = toPage(ev)
        erase(p.x, p.y)
      }
    } else if (boxStart.current) {
      const p = toPage(e)
      const s = boxStart.current
      const ctx = liveCtx()
      ctx.strokeStyle = '#e05a1a'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(s.x * scale, s.y * scale, (p.x - s.x) * scale, (p.y - s.y) * scale)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      const t = tap.current
      tap.current = null
      if (t && t.id === e.pointerId && e.timeStamp - t.t < TAP_MS &&
          Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_SLOP) {
        lookup({ kind: 'word', at: toPage(e) })
      }
      return
    }
    if (current.current) {
      const s = current.current
      current.current = null
      liveCtx()
      strokes.current = [...strokes.current, s]
      const ctx = inkRef.current!.getContext('2d')!
      drawStroke(ctx, s, scale, true)
      saveInk(pdfKey, pageNum, strokes.current)
    } else if (boxStart.current) {
      const a = boxStart.current
      const b = toPage(e)
      boxStart.current = null
      liveCtx()
      const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
      if (rect.w > 8 && rect.h > 6) lookup({ kind: 'region', rect })
    }
  }

  const onPointerCancel = () => {
    tap.current = null
    current.current = null
    boxStart.current = null
    if (liveRef.current?.width) liveCtx()
  }

  return (
    <div ref={wrapRef} className="page" style={{ width, height }} data-page={pageNum}>
      <canvas ref={pdfRef} className="layer" />
      <canvas ref={inkRef} className="layer" />
      <canvas
        ref={liveRef}
        className="layer live"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  )
}
