import { createContext, useContext, useSyncExternalStore } from 'react'
import { loadSpeech, saveSpeech } from './db'
import { meter } from './meter'

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'error'
type Current = { key: string; status: SpeechStatus; message?: string }
type PitchAudio = HTMLAudioElement & { webkitPreservesPitch?: boolean }

const SLOW_RATE = 0.7
const SPEED_KEY = 'muste:speed'
export const SPEEDS = [1, 0.9, 0.8] as const
export type Speed = (typeof SPEEDS)[number]

function loadSpeed(): Speed {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY))
    return SPEEDS.find((s) => s === saved) ?? 1
  } catch {
    return 1
  }
}

let speed: Speed = loadSpeed()
const speedListeners = new Set<() => void>()

export function setSpeed(next: Speed) {
  speed = next
  speedListeners.forEach((l) => l())
  try {
    localStorage.setItem(SPEED_KEY, String(next))
  } catch {
    return
  }
}

export const useSpeed = () =>
  useSyncExternalStore(
    (listener) => {
      speedListeners.add(listener)
      return () => speedListeners.delete(listener)
    },
    () => speed,
  )

let current: Current | null = null
let context: AudioContext | null = null
let source: AudioBufferSourceNode | null = null
let sourceClock = { start: 0, duration: 0 }
let element: PitchAudio | null = null
let output: { node: AnalyserNode; level: () => number } | null = null
let elementUrl = ''
let request = 0
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<ArrayBuffer>>()

const audioKey = (text: string, expressive: boolean) => (expressive ? `x:${text}` : text)
export const speechKey = (text: string, slow = false, expressive = false) => `${slow ? 'slow:' : ''}${audioKey(text, expressive)}`

const publish = (next: Current | null) => {
  current = next
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function fetchSpeech(text: string, expressive: boolean): Promise<ArrayBuffer> {
  const key = audioKey(text, expressive)
  const cached = await loadSpeech(key)
  if (cached) return cached
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, expressive }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const audio = await res.arrayBuffer()
  await saveSpeech(key, audio)
  return audio
}

function audio(text: string, expressive: boolean) {
  const key = audioKey(text, expressive)
  const pending = inflight.get(key) ?? fetchSpeech(text, expressive).finally(() => inflight.delete(key))
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

function silentWav() {
  const view = new DataView(new ArrayBuffer(46))
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 38, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, 2, true)
  return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }))
}

function outputNode(ctx: AudioContext) {
  if (!output) {
    const node = ctx.createAnalyser()
    node.fftSize = 1024
    node.connect(ctx.destination)
    output = { node, level: meter(node) }
  }
  return output.node
}

export const outputLevel = () => output?.level() ?? 0

function stretchElement(ctx: AudioContext) {
  if (!element) {
    element = new Audio() as PitchAudio
    element.preservesPitch = true
    element.webkitPreservesPitch = true
    element.src = silentWav()
    void element.play().catch(() => undefined)
    ctx.createMediaElementSource(element).connect(outputNode(ctx))
  }
  return element
}

export function primeAudio() {
  stretchElement(audioContext())
}

export function playbackProgress() {
  if (source && context && sourceClock.duration) return Math.min(1, (context.currentTime - sourceClock.start) / sourceClock.duration)
  if (element && !element.paused && element.duration) return Math.min(1, element.currentTime / element.duration)
  return 0
}

export function stop() {
  request++
  source?.stop()
  source = null
  element?.pause()
  publish(null)
}

async function playFast(ctx: AudioContext, data: ArrayBuffer, id: number) {
  const buffer = await ctx.decodeAudioData(data.slice(0))
  if (id !== request) return false
  const node = ctx.createBufferSource()
  node.buffer = buffer
  node.connect(outputNode(ctx))
  node.onended = () => source === node && stop()
  source = node
  sourceClock = { start: ctx.currentTime, duration: buffer.duration }
  node.start()
  return true
}

async function playStretched(player: PitchAudio, data: ArrayBuffer, rate: number, id: number) {
  if (id !== request) return false
  if (elementUrl) URL.revokeObjectURL(elementUrl)
  elementUrl = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }))
  player.src = elementUrl
  player.playbackRate = rate
  player.onended = () => id === request && stop()
  await player.play()
  return id === request
}

export async function speak(text: string, slow = false, expressive = false) {
  stop()
  const id = request
  const key = speechKey(text, slow, expressive)
  const ctx = audioContext()
  const rate = slow ? SLOW_RATE : speed
  const player = rate === 1 ? null : stretchElement(ctx)
  publish({ key, status: 'loading' })
  try {
    const data = await audio(text, expressive)
    const started = player ? await playStretched(player, data, rate, id) : await playFast(ctx, data, id)
    if (started) publish({ key, status: 'playing' })
  } catch (err) {
    if (id === request) publish({ key, status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

export async function speakUntilDone(text: string, expressive = false) {
  const key = speechKey(text, false, expressive)
  await speak(text, false, expressive)
  if (current?.key !== key || current.status !== 'playing') {
    if (current?.key === key && current.status === 'error') throw new Error(current.message)
    return
  }
  await new Promise<void>((resolve) => {
    const unsubscribe = subscribe(() => {
      if (current?.key === key && current.status === 'playing') return
      unsubscribe()
      resolve()
    })
  })
}

export function useSpeech(key: string) {
  const state = useSyncExternalStore(subscribe, () => current)
  return state?.key === key ? state : { key, status: 'idle' as const }
}

export const SpeechReady = createContext(true)
export const useSpeechReady = () => useContext(SpeechReady)
