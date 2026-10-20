import { z } from 'zod'

export type TtsConfig = { apiKey?: string; voiceId?: string }

const MODEL = 'eleven_multilingual_v2'
const FORMAT = 'mp3_44100_96'

export const validateSpeech = (body: unknown) => z.object({ text: z.string().trim().min(1).max(400) }).parse(body).text

export async function synthesize({ apiKey, voiceId }: TtsConfig, text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!apiKey || !voiceId) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL }),
    signal,
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.arrayBuffer()
}
