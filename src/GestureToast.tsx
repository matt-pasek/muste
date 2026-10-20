import { useSyncExternalStore } from 'react'
import { getNotice, subscribeNotice } from './history'

export function GestureToast() {
  const notice = useSyncExternalStore(subscribeNotice, getNotice)
  if (!notice) return null
  return (
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-toast flex justify-center px-4">
      <div key={notice.id} role="status" className="gesture-toast rounded-full border border-border bg-overlay px-4 py-1.5 text-sm font-medium text-ink shadow-floating">
        {notice.label}
      </div>
    </div>
  )
}
