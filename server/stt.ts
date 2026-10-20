import { z } from 'zod'

export type AiRun = (model: string, input: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>

const MODEL = '@cf/openai/whisper-large-v3-turbo'

const Output = z.object({
  text: z.string(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional(),
})

export type Transcript = { text: string; words: { word: string; start: number; end: number }[] }

export async function transcribe(run: AiRun, audio: string, signal?: AbortSignal): Promise<Transcript> {
  const out = Output.parse(await run(MODEL, { audio, language: 'fi', task: 'transcribe' }, signal))
  return { text: out.text.trim(), words: out.words ?? [] }
}

export const restRun =
  (accountId?: string, token?: string): AiRun =>
  async (model, input, signal) => {
    if (!accountId || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN')
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
    const body = (await res.json()) as { success?: boolean; errors?: unknown; result?: unknown }
    if (!res.ok || !body.success) throw new Error(`Workers AI ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 200)}`)
    return body.result
  }
