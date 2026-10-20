import { strokeHit, type Stroke } from './ink'
import type { Rect } from './lookup'

type Point = [number, number, number]

const SCRIBBLE_MIN_REVERSALS = 4
const SCRIBBLE_MIN_RATIO = 3.5
const SCRIBBLE_MIN_SPAN = 8
const SCRIBBLE_REACH = 4
const SCRIBBLE_MIN_COVER = 0.5
const SCRIBBLE_MIN_OVERLAP = 0.25
const LOOP_MIN_SIZE = 18
const LOOP_CLOSE_RATIO = 0.4
const LOOP_MIN_RATIO = 1.7

export function bounds(points: Point[]): Rect {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function pathLength(points: Point[]) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

function reversals(values: number[], minLeg: number) {
  let count = 0
  let direction = 0
  let anchor = values[0]
  for (const v of values) {
    const delta = v - anchor
    if (Math.abs(delta) < minLeg) continue
    const d = Math.sign(delta)
    if (direction && d !== direction) count++
    direction = d
    anchor = v
  }
  return count
}

export function isScribble(points: Point[]) {
  if (points.length < 12) return false
  const b = bounds(points)
  const span = Math.max(b.w, b.h)
  if (span < SCRIBBLE_MIN_SPAN) return false
  if (pathLength(points) / Math.hypot(b.w, b.h) < SCRIBBLE_MIN_RATIO) return false
  const xTurns = reversals(points.map((p) => p[0]), b.w * 0.4)
  const yTurns = reversals(points.map((p) => p[1]), b.h * 0.4)
  return Math.max(xTurns, yTurns) >= SCRIBBLE_MIN_REVERSALS
}

function coverage(target: Rect, by: Rect) {
  const w = Math.min(target.x + target.w, by.x + by.w) - Math.max(target.x, by.x)
  const h = Math.min(target.y + target.h, by.y + by.h) - Math.max(target.y, by.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.max(target.w * target.h, 1)
}

export function strokesUnder(scribble: Point[], strokes: Stroke[]) {
  const area = bounds(scribble)
  const touched = strokes.filter(
    (s) => coverage(bounds(s.points), area) >= SCRIBBLE_MIN_COVER && scribble.some(([x, y]) => strokeHit(s, x, y, SCRIBBLE_REACH)),
  )
  const over = scribble.filter(([x, y]) => touched.some((s) => strokeHit(s, x, y, SCRIBBLE_REACH))).length
  return over / scribble.length >= SCRIBBLE_MIN_OVERLAP ? touched : []
}

export function isClosedLoop(points: Point[]) {
  if (points.length < 10) return false
  const b = bounds(points)
  if (Math.min(b.w, b.h) < LOOP_MIN_SIZE) return false
  const [sx, sy] = points[0]
  const [ex, ey] = points[points.length - 1]
  const gap = Math.hypot(ex - sx, ey - sy)
  const length = pathLength(points)
  return gap < Math.max(b.w, b.h) * LOOP_CLOSE_RATIO && length / Math.hypot(b.w, b.h) >= LOOP_MIN_RATIO
}
