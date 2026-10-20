import { useEffect, useRef, useState } from 'react'
import type { OcrStatus } from './ocr'

const READY_HOLD_MS = 2200

const LABELS: Partial<Record<OcrStatus, string>> = {
  queued: 'Waiting to read',
  reading: 'Reading page',
  error: 'Couldn’t read page',
}

export function OcrBadge({ status }: { status: OcrStatus }) {
  const previous = useRef(status)
  const [justFinished, setJustFinished] = useState(false)

  useEffect(() => {
    const was = previous.current
    previous.current = status
    if (status !== 'done' || was !== 'reading') return
    setJustFinished(true)
    const id = setTimeout(() => setJustFinished(false), READY_HOLD_MS)
    return () => clearTimeout(id)
  }, [status])

  if (status === 'idle') return null
  const label = status === 'done' ? (justFinished ? 'Text ready' : undefined) : LABELS[status]

  return (
    <>
      {status === 'reading' && (
        <div className="ocr-scan" aria-hidden>
          <span />
        </div>
      )}
      <div
        className="ocr-badge"
        data-status={status}
        data-collapsed={label ? undefined : ''}
        role="status"
        aria-label={label ?? 'Text ready'}
        title={label ?? 'Words on this page are recognised'}
      >
        <span className="ocr-dot" />
        <span className="ocr-label">{label}</span>
      </div>
    </>
  )
}
