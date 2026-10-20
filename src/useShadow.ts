import { useEffect, useRef, useState } from 'react'
import type { ShadowResult } from '../server/shadow'
import { startRecording, type Recording } from './recorder'

export type ShadowState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'recording' }
  | { status: 'checking' }
  | { status: 'done'; result: ShadowResult }
  | { status: 'error'; message: string }

async function check(audio: string, target: string): Promise<ShadowResult> {
  const res = await fetch('/api/shadow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio, target }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function useShadow(target: string) {
  const [state, setState] = useState<{ target: string; value: ShadowState }>({ target, value: { status: 'idle' } })
  const recording = useRef<Recording | null>(null)
  const value = state.target === target ? state.value : { status: 'idle' as const }
  const update = (next: ShadowState) => setState({ target, value: next })

  useEffect(() => () => void recording.current?.cancel(), [])

  const finish = async () => {
    const current = recording.current
    if (!current) return
    recording.current = null
    update({ status: 'checking' })
    try {
      update({ status: 'done', result: await check(await current.stop(), target) })
    } catch (err) {
      update({ status: 'error', message: message(err) })
    }
  }

  const start = async () => {
    update({ status: 'starting' })
    try {
      recording.current = await startRecording(() => void finish())
      update({ status: 'recording' })
    } catch (err) {
      update({ status: 'error', message: message(err) })
    }
  }

  const discard = async () => {
    const current = recording.current
    recording.current = null
    await current?.cancel()
  }

  const toggle = () => (value.status === 'recording' ? finish() : start())
  const reset = () => update({ status: 'idle' })
  const cancel = () => {
    void discard()
    reset()
  }
  const restart = async () => {
    update({ status: 'starting' })
    await discard()
    await start()
  }

  return { state: value, toggle, reset, cancel, restart }
}
