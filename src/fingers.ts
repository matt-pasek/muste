import { useEffect } from 'react'

const TAP_MS = 350
const TAP_SLOP = 12

type Touch = { x: number; y: number; t: number }

const active = new Map<number, Touch>()
let gesture: { max: number; start: number; moved: boolean } | null = null

export const fingersDown = () => active.size
export const multiFingerGesture = () => (gesture?.max ?? 0) > 1

export function useFingerTaps(handlers: { two: () => void; three: () => void }) {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!active.size) gesture = { max: 0, start: e.timeStamp, moved: false }
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      if (gesture) gesture.max = Math.max(gesture.max, active.size)
    }
    const move = (e: PointerEvent) => {
      const t = active.get(e.pointerId)
      if (t && gesture && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) gesture.moved = true
    }
    const up = (e: PointerEvent) => {
      if (!active.delete(e.pointerId) || active.size || !gesture) return
      const g = gesture
      queueMicrotask(() => {
        if (gesture === g) gesture = null
      })
      if (g.moved || e.timeStamp - g.start > TAP_MS) return
      if (g.max === 2) handlers.two()
      else if (g.max === 3) handlers.three()
    }
    const cancel = (e: PointerEvent) => {
      active.delete(e.pointerId)
      if (gesture) gesture.moved = true
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [handlers])
}
