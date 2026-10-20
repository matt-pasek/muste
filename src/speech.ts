import { createContext, useContext, useSyncExternalStore } from 'react'
import { loadSpeech, saveSpeech } from './db'

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'error'
type Current = { text: string; status: SpeechStatus; message?: string }

let current: Current | null = null
let context: AudioContext | null = null
let source: AudioBufferSourceNode | null = null
let request = 0
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<ArrayBuffer>>()

const publish = (next: Current | null) => {
  current = next
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function fetchSpeech(text: string): Promise<ArrayBuffer> {
  const cached = await loadSpeech(text)
  if (cached) return cached
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const audio = await res.arrayBuffer()
  await saveSpeech(text, audio)
  return audio
}

function audio(text: string) {
  const pending = inflight.get(text) ?? fetchSpeech(text).finally(() => inflight.delete(text))
  inflight.set(text, pending)
  return pending
}

function audioContext() {
  if (!context) {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
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

export async function speak(text: string) {
  stop()
  const id = request
  const ctx = audioContext()
  publish({ text, status: 'loading' })
  try {
    const buffer = await ctx.decodeAudioData((await audio(text)).slice(0))
    if (id !== request) return
    const node = ctx.createBufferSource()
    node.buffer = buffer
    node.connect(ctx.destination)
    node.onended = () => source === node && stop()
    source = node
    node.start()
    publish({ text, status: 'playing' })
  } catch (err) {
    if (id === request) publish({ text, status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

export function useSpeech(text: string) {
  const state = useSyncExternalStore(subscribe, () => current)
  return state?.text === text ? state : { text, status: 'idle' as const }
}

export const SpeechReady = createContext(true)
export const useSpeechReady = () => useContext(SpeechReady)
