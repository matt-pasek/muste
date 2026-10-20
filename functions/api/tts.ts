import { synthesize, validateSpeech } from '../../server/tts'

type Env = { ELEVENLABS_API_KEY: string; ELEVENLABS_VOICE_ID: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const speech = validateSpeech(await request.json())
    const audio = await synthesize({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID }, speech, request.signal)
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
