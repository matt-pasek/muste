import { z } from 'zod'

export type TtsConfig = { apiKey?: string; voiceId?: string }
export type Speech = { text: string; expressive: boolean }

const MODEL = 'eleven_v4'
const EXPRESSIVE_MODEL = 'eleven_v4_turbo'
const FORMAT = 'mp3_44100_96'

export const validateSpeech = (body: unknown): Speech =>
  z.object({ text: z.string().trim().min(1).max(600), expressive: z.boolean().default(false) }).parse(body)

export async function synthesize({ apiKey, voiceId }: TtsConfig, { text, expressive }: Speech, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!apiKey || !voiceId) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: expressive ? EXPRESSIVE_MODEL : MODEL }),
    signal,
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.arrayBuffer()
}
