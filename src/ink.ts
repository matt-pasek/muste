import { getStroke } from 'perfect-freehand'

export type Stroke = { points: [number, number, number][]; color?: string }

export const INKS = [
  { name: 'Blue', color: '#1b3a8a' },
  { name: 'Graphite', color: '#26262b' },
  { name: 'Red', color: '#c0362c' },
  { name: 'Green', color: '#2d7a3e' },
] as const

export const DEFAULT_INK = INKS[0].color

export const INK_SIZE = 1.7

const OPTIONS = {
  size: INK_SIZE,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.35,
  simulatePressure: false,
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number, last = false) {
  const outline = getStroke(
    stroke.points.map(([x, y, p]) => [x * scale, y * scale, p]),
    { ...OPTIONS, size: OPTIONS.size * scale, last },
  )
  if (outline.length < 2) return
  const path = new Path2D()
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1]
    const [x1, y1] = outline[i]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  ctx.fillStyle = stroke.color ?? DEFAULT_INK
  ctx.fill(path)
}

export function strokeHit(stroke: Stroke, x: number, y: number, radius: number) {
  const r2 = radius * radius
  return stroke.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= r2)
}
