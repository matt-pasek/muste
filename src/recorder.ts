import { meter } from './meter'
import { audioContext, setAudioSession, stop as stopSpeech } from './speech'

const RATE = 16000
const MAX_SECONDS = 30
const RAW_MIC = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }

export type Recording = { stop: () => Promise<string>; cancel: () => Promise<void>; level: () => number }

export async function startRecording(onLimit: () => void): Promise<Recording> {
  stopSpeech()
  setAudioSession('play-and-record')
  const ctx = audioContext()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_MIC })
  } catch (err) {
    setAudioSession('playback')
    throw new Error(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone access was blocked' : String(err))
  }
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  const input = ctx.createMediaStreamSource(stream)
  input.connect(analyser)
  const level = meter(analyser)
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e) => chunks.push(e.data)
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      input.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      setAudioSession('playback')
      resolve(new Blob(chunks, { type: recorder.mimeType }))
    }
  })
  recorder.start()
  const limit = setTimeout(onLimit, MAX_SECONDS * 1000)
  const end = () => {
    clearTimeout(limit)
    if (recorder.state !== 'inactive') recorder.stop()
  }
  return {
    stop: async () => {
      end()
      return wavBase64(await toMono16k(ctx, await stopped))
    },
    cancel: async () => {
      end()
      await stopped
    },
    level,
  }
}

async function toMono16k(ctx: AudioContext, blob: Blob): Promise<Float32Array> {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const samples = (await offline.startRendering()).getChannelData(0)
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak < 0.002) throw new Error("The recording was silent. Check that the microphone isn't covered.")
  const gain = 0.9 / peak
  return samples.map((v) => v * gain)
}

function wavBase64(samples: Float32Array): string {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true))
  const bytes = new Uint8Array(view.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
