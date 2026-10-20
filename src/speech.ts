import { createContext, useContext, useSyncExternalStore } from 'react'
import { loadSpeech, saveSpeech } from './db'

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'error'
type Current = { key: string; status: SpeechStatus; message?: string }

let current: Current | null = null
let context: AudioContext | null = null
let source: AudioBufferSourceNode | null = null
let request = 0
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<ArrayBuffer>>()

export const speechKey = (text: string, slow = false) => (slow ? `slow:${text}` : text)

const publish = (next: Current | null) => {
  current = next
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function fetchSpeech(text: string, slow: boolean): Promise<ArrayBuffer> {
  const key = speechKey(text, slow)
  const cached = await loadSpeech(key)
  if (cached) return cached
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, slow }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const audio = await res.arrayBuffer()
  await saveSpeech(key, audio)
  return audio
}

function audio(text: string, slow: boolean) {
  const key = speechKey(text, slow)
  const pending = inflight.get(key) ?? fetchSpeech(text, slow).finally(() => inflight.delete(key))
  inflight.set(key, pending)
  return pending
}

export function setAudioSession(type: 'playback' | 'play-and-record') {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = type
}

export function audioContext() {
  if (!context) {
    setAudioSession('playback')
    context = new AudioContext()
  }
  void context.resume()
  return context
}

export function stop() {
  request++
  source?.stop()
  source = null
  publish(null)
}

export async function speak(text: string, slow = false) {
  stop()
  const id = request
  const key = speechKey(text, slow)
  const ctx = audioContext()
  publish({ key, status: 'loading' })
  try {
    const buffer = await ctx.decodeAudioData((await audio(text, slow)).slice(0))
    if (id !== request) return
    const node = ctx.createBufferSource()
    node.buffer = buffer
    node.connect(ctx.destination)
    node.onended = () => source === node && stop()
    source = node
    node.start()
    publish({ key, status: 'playing' })
  } catch (err) {
    if (id === request) publish({ key, status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

export function useSpeech(key: string) {
  const state = useSyncExternalStore(subscribe, () => current)
  return state?.key === key ? state : { key, status: 'idle' as const }
}

export const SpeechReady = createContext(true)
export const useSpeechReady = () => useContext(SpeechReady)
