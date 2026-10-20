import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadInk, saveInk } from './db'
import { fingersDown, multiFingerGesture } from './fingers'
import { bounds, isClosedLoop, isScribble, strokesUnder } from './gestures'
import { record, watchPage } from './history'
import { drawStroke, INK_SIZE, strokeHit, type Stroke } from './ink'
import { cropPage, snapToContent, type LookupRequest, type LookupTarget, type Rect } from './lookup'
import { ensureOcr, getStatus, getWords, prioritise, subscribe } from './ocr'
import { OcrBadge } from './OcrBadge'
import { isTrusted, lineOf, snapToWords, wordAt } from './words'

export type Tool = 'pen' | 'eraser' | 'box'

export type Focus = { req: LookupRequest; drawn?: Rect; busy: boolean }

type Props = {
  doc: PDFDocumentProxy
  pdfKey: string
  pageNum: number
  width: number
  aspect: number
  tool: Tool
  inkColor: string
  focus?: Focus
  onVisible: (page: number) => void
  onLookup: (target: LookupTarget) => void
}

const TAP_MS = 300
const TAP_SLOP = 8
const ERASE_RADIUS = 6
const HOLD_MS = 450
const HOLD_SLOP = 2.5
const FADE_MS = 240

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function PdfPage({ doc, pdfKey, pageNum, width, aspect, tool, inkColor, focus, onVisible, onLookup }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [pageW, setPageW] = useState(0)
  const strokes = useRef<Stroke[]>([])
  const scale = pageW ? width / pageW : 1
  const dpr = window.devicePixelRatio || 1
  const height = Math.round(width * aspect)
  const ocrStatus = useSyncExternalStore(subscribe, () => getStatus(pdfKey, pageNum))

  useEffect(() => {
    const el = wrapRef.current!
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1500px 0px' })
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      onVisible(pageNum)
      prioritise(pdfKey, pageNum)
    }, { threshold: 0.5 })
    io.observe(el)
    seen.observe(el)
    return () => {
      io.disconnect()
      seen.disconnect()
    }
  }, [pdfKey, pageNum, onVisible])

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
      const pxPerUnit = (width / base.width) * dpr
      const viewport = page.getViewport({ scale: pxPerUnit })
      const canvas = pdfRef.current!
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const t = page.render({ canvas, viewport })
      task = t
      const rendered = await t.promise.then(() => true, () => false)
      if (rendered && !cancelled) void ensureOcr(pdfKey, pageNum, canvas, pxPerUnit)
    })()
    return () => {
      cancelled = true
      task?.cancel()
      for (const c of canvases) if (c) c.width = c.height = 0
    }
  }, [near, doc, pdfKey, pageNum, width, dpr])

  const redrawInk = () => {
    const c = inkRef.current
    if (!c || !pageW) return
    c.width = Math.floor(width * dpr)
    c.height = Math.floor(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    for (const s of strokes.current) drawStroke(ctx, s, scale)
  }
  const redrawRef = useRef(redrawInk)
  redrawRef.current = redrawInk

  useEffect(() => {
    if (!near) return
    return watchPage(pdfKey, pageNum, (s) => {
      strokes.current = s
      redrawRef.current()
    })
  }, [near, pdfKey, pageNum])

  const commit = (before: Stroke[], after: Stroke[]) => {
    strokes.current = after
    void saveInk(pdfKey, pageNum, after)
    record({ pdf: pdfKey, page: pageNum, before, after })
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
  const box = useRef<{ start: { x: number; y: number }; accent: string } | null>(null)
  const tap = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  const erasing = useRef<Stroke[] | null>(null)
  const hold = useRef<{ x: number; y: number; timer: number } | null>(null)
  const fade = useRef(0)

  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }

  const fadeOut = (gone: Stroke[], color?: string) => {
    const started = performance.now()
    const frame = (now: number) => {
      if (current.current || box.current) return
      const t = Math.min(1, (now - started) / FADE_MS)
      const ctx = liveCtx()
      ctx.globalAlpha = 1 - t
      for (const s of gone) drawStroke(ctx, color ? { ...s, color } : s, scale, true)
      ctx.globalAlpha = 1
      if (t < 1) fade.current = requestAnimationFrame(frame)
      else liveCtx()
    }
    cancelAnimationFrame(fade.current)
    fade.current = requestAnimationFrame(frame)
  }

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

  const lookup = (req: LookupRequest, drawn?: Rect) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const area = req.kind === 'region' ? req.rect : req.box ?? { x: req.at.x - 14, y: req.at.y - 14, w: 28, h: 28 }
    onLookup({
      page: pageNum,
      req,
      drawn,
      crop: () => cropPage(pdfRef.current!, scale * dpr, req, pageW),
      anchor: {
        top: r.top + area.y * scale,
        bottom: r.top + (area.y + area.h) * scale,
        left: r.left + area.x * scale,
        right: r.left + (area.x + area.w) * scale,
      },
    })
  }

  const wordRequest = (at: { x: number; y: number }): LookupRequest => {
    const words = getWords(pdfKey, pageNum)
    const word = words && wordAt(words, at.x, at.y)
    if (!words || !word) return { kind: 'word', at }
    const text = isTrusted(word)
      ? { word: word.text.replace(/^[^\p{L}]+|[^\p{L}-]+$/gu, ''), line: lineOf(words, word) }
      : undefined
    return { kind: 'word', at, box: word.box, text }
  }

  const erase = (x: number, y: number) => {
    const kept = strokes.current.filter((s) => !strokeHit(s, x, y, ERASE_RADIUS))
    if (kept.length === strokes.current.length) return
    strokes.current = kept
    redrawInk()
  }

  const regionFrom = (drawn: Rect) => {
    const words = getWords(pdfKey, pageNum)
    const rect = (words && snapToWords(words, drawn)) ?? snapToContent(pdfRef.current!, scale * dpr, drawn)
    lookup({ kind: 'region', rect }, drawn)
  }

  const explainLoop = () => {
    const s = current.current
    if (!s || !isClosedLoop(s.points)) return
    current.current = null
    stopHold()
    fadeOut([s], token('--usva-accent'))
    regionFrom(bounds(s.points))
  }

  const trackHold = (x: number, y: number) => {
    const h = hold.current
    if (h && Math.hypot(x - h.x, y - h.y) < HOLD_SLOP) return
    stopHold()
    hold.current = { x, y, timer: window.setTimeout(explainLoop, HOLD_MS) }
  }

  const drawHover = (p: { x: number; y: number }) => {
    const ctx = liveCtx()
    ctx.beginPath()
    if (tool === 'eraser') {
      ctx.arc(p.x * scale, p.y * scale, ERASE_RADIUS * scale, 0, Math.PI * 2)
      ctx.strokeStyle = token('--usva-muted')
      ctx.lineWidth = 1.5
      ctx.stroke()
      return
    }
    ctx.arc(p.x * scale, p.y * scale, Math.max(2, (INK_SIZE * scale) / 2), 0, Math.PI * 2)
    ctx.fillStyle = tool === 'pen' ? inkColor : token('--usva-accent')
    ctx.globalAlpha = 0.55
    ctx.fill()
    ctx.globalAlpha = 1
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pageW) return
    const p = toPage(e)
    if (e.pointerType === 'touch') {
      tap.current = fingersDown() > 1 ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
    }
    cancelAnimationFrame(fade.current)
    liveCtx()
    if (tool === 'pen') {
      current.current = { points: [[p.x, p.y, e.pressure || 0.5]], color: inkColor }
      trackHold(p.x, p.y)
    } else if (tool === 'eraser') {
      erasing.current = strokes.current
      erase(p.x, p.y)
    } else {
      box.current = { start: p, accent: token('--usva-accent') }
    }
  }

  const drawBox = (a: { x: number; y: number }, b: { x: number; y: number }, accent: string) => {
    const ctx = liveCtx()
    ctx.beginPath()
    ctx.roundRect(Math.min(a.x, b.x) * scale, Math.min(a.y, b.y) * scale, Math.abs(b.x - a.x) * scale, Math.abs(b.y - a.y) * scale, 8)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.12
    ctx.fill()
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 1
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
      const [x, y] = current.current.points[current.current.points.length - 1]
      trackHold(x, y)
      const ctx = liveCtx()
      drawStroke(ctx, current.current, scale)
    } else if (e.pointerType === 'pen' && !e.buttons && !box.current) {
      drawHover(toPage(e))
    } else if (tool === 'eraser' && e.buttons) {
      for (const ev of events) {
        const p = toPage(ev)
        erase(p.x, p.y)
      }
    } else if (box.current) {
      drawBox(box.current.start, toPage(e), box.current.accent)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      const t = tap.current
      tap.current = null
      if (t && t.id === e.pointerId && !multiFingerGesture() && e.timeStamp - t.t < TAP_MS &&
          Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_SLOP) {
        lookup(wordRequest(toPage(e)))
      }
      return
    }
    stopHold()
    if (current.current) {
      const s = current.current
      current.current = null
      liveCtx()
      const before = strokes.current
      const gone = isScribble(s.points) ? strokesUnder(s.points, before) : []
      if (gone.length) {
        commit(before, before.filter((x) => !gone.includes(x)))
        redrawInk()
        fadeOut(gone)
        return
      }
      commit(before, [...before, s])
      drawStroke(inkRef.current!.getContext('2d')!, s, scale, true)
    } else if (erasing.current) {
      const before = erasing.current
      erasing.current = null
      if (before !== strokes.current) commit(before, strokes.current)
    } else if (box.current) {
      const a = box.current.start
      const b = toPage(e)
      box.current = null
      liveCtx()
      const drawn = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
      if (drawn.w > 8 && drawn.h > 6) regionFrom(drawn)
    }
  }

  const onPointerCancel = () => {
    tap.current = null
    current.current = null
    box.current = null
    stopHold()
    if (erasing.current && erasing.current !== strokes.current) commit(erasing.current, strokes.current)
    erasing.current = null
    if (liveRef.current?.width) liveCtx()
  }

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen' && !current.current && !box.current && liveRef.current?.width) liveCtx()
  }

  return (
    <div ref={wrapRef} className="page rounded-sm shadow-raised" style={{ width, height }} data-page={pageNum}>
      <canvas ref={pdfRef} className="layer rounded-sm" />
      {focus && <FocusMark key={JSON.stringify(focus.req)} focus={focus} scale={scale} />}
      <canvas ref={inkRef} className="layer" />
      <canvas
        ref={liveRef}
        className="layer live"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
      />
      {near && <OcrBadge status={ocrStatus} />}
    </div>
  )
}

const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 })

function FocusMark({ focus, scale }: { focus: Focus; scale: number }) {
  const { req, drawn, busy } = focus
  const [settled, setSettled] = useState(!drawn)
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [])
  if (req.kind === 'word' && !req.box) {
    return <span className="focus-dot" data-busy={busy || undefined} style={{ left: req.at.x * scale, top: req.at.y * scale }} />
  }
  const target = req.kind === 'word' ? pad(req.box!, 2) : req.rect
  const r = settled || !drawn ? target : drawn
  return (
    <span
      className="focus-box"
      data-busy={busy || undefined}
      style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }}
    />
  )
}
