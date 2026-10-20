import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConverseLine, ConverseTurn } from '../server/converse'
import { startRecording, type Recording } from './recorder'
import { outputLevel, primeAudio, speakUntilDone, stop as stopSpeech } from './speech'
import type { Register } from './useRegister'

export type Correction = ConverseTurn['corrections'][number]
export type Entry =
  | { role: 'partner'; text: string; en: string }
  | { role: 'learner'; heard: string; corrections: Correction[] }

export type Phase = 'idle' | 'opening' | 'recording' | 'thinking' | 'speaking'

const HISTORY = 30

const toLine = (e: Entry): ConverseLine => (e.role === 'partner' ? { role: 'partner', text: e.text } : { role: 'learner', text: e.heard })

async function post(body: object, signal: AbortSignal): Promise<ConverseTurn | { heard: '' }> {
  const res = await fetch('/api/converse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

export type Chat = ReturnType<typeof useConversation>

export function useConversation(page: () => string, register: Register) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [entries, setEntries] = useState<Entry[]>([])
  const [scene, setScene] = useState('')
  const [notice, setNotice] = useState('')
  const recording = useRef<Recording | null>(null)
  const inflight = useRef<AbortController | null>(null)
  const history = useRef<Entry[]>([])

  const append = useCallback((added: Entry[]) => {
    history.current = [...history.current, ...added]
    setEntries(history.current)
  }, [])

  const say = useCallback(async (text: string) => {
    setPhase('speaking')
    try {
      await speakUntilDone(text)
    } catch (err) {
      setNotice(`Couldn't play the reply: ${message(err)}`)
    }
    setPhase((p) => (p === 'speaking' ? 'idle' : p))
  }, [])

  const request = useCallback(
    async (audio?: string) => {
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl
      const turn = await post({ audio, history: history.current.slice(-HISTORY).map(toLine), page: page() || undefined, register }, ctrl.signal)
      return ctrl.signal.aborted ? null : turn
    },
    [page, register],
  )

  const begin = useCallback(async () => {
    try {
      const turn = await request()
      if (!turn || !('reply' in turn)) return setPhase('idle')
      setScene(turn.scene)
      append([{ role: 'partner', text: turn.reply, en: turn.reply_en }])
      await say(turn.reply)
    } catch (err) {
      if (isAbort(err)) return
      setNotice(message(err))
      setPhase('idle')
    }
  }, [append, request, say])

  const open = useCallback(() => {
    primeAudio()
    stopSpeech()
    history.current = []
    setEntries([])
    setScene('')
    setNotice('')
    setPhase('opening')
    return begin()
  }, [begin])

  const send = useCallback(async () => {
    const current = recording.current
    if (!current) return
    recording.current = null
    setPhase('thinking')
    try {
      const turn = await request(await current.stop())
      if (!turn) return
      if (!('reply' in turn)) {
        setNotice("I didn't catch that. Try again a little closer to the iPad.")
        return setPhase('idle')
      }
      append([
        { role: 'learner', heard: turn.heard, corrections: turn.corrections },
        { role: 'partner', text: turn.reply, en: turn.reply_en },
      ])
      await say(turn.reply)
    } catch (err) {
      if (isAbort(err)) return
      setNotice(message(err))
      setPhase('idle')
    }
  }, [append, request, say])

  const talk = useCallback(async () => {
    primeAudio()
    stopSpeech()
    setNotice('')
    try {
      recording.current = await startRecording(() => void send())
      setPhase('recording')
    } catch (err) {
      if (isAbort(err)) return
      setNotice(message(err))
      setPhase('idle')
    }
  }, [send])

  const cancel = useCallback(() => {
    const current = recording.current
    recording.current = null
    void current?.cancel()
    setPhase('idle')
  }, [])

  const level = useCallback(() => {
    if (phase === 'recording') return recording.current?.level() ?? 0
    if (phase === 'speaking') return outputLevel()
    return 0
  }, [phase])

  const close = useCallback(() => {
    inflight.current?.abort()
    const current = recording.current
    recording.current = null
    void current?.cancel()
    stopSpeech()
    setPhase('idle')
  }, [])

  useEffect(
    () => () => {
      inflight.current?.abort()
      void recording.current?.cancel()
      stopSpeech()
    },
    [],
  )

  return { phase, entries, scene, notice, open, close, talk, send, cancel, level }
}
