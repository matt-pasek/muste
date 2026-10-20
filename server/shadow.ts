import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { transcribe, type AiRun } from './stt.ts'

const MISTAKE_KINDS = ['vowel length', 'consonant length', 'ending', 'vowel quality', 'missing word', 'extra word', 'other'] as const

const Feedback = z.object({
  verdict: z.enum(['close', 'off']).describe('"close" if only one or two sounds differ, "off" if much of the sentence is different'),
  summary: z.string().describe('One short, warm sentence in English about the attempt as a whole'),
  mistakes: z
    .array(
      z.object({
        expected: z.string().describe('The word as written in the target'),
        heard: z.string().describe('What the transcript has in its place; empty if the word is missing'),
        kind: z.enum(MISTAKE_KINDS),
        tip: z.string().describe('One short sentence on how to say it right, written for a Polish speaker'),
      }),
    )
    .describe('Real pronunciation differences only, in sentence order'),
})

export type ShadowRequest = { audio: string; target: string }
export type ShadowResult = { heard: string; verdict: 'match' | 'close' | 'off'; summary: string; mistakes: z.infer<typeof Feedback>['mistakes'] }

const SYSTEM = `You coach a native Polish speaker who is learning Finnish by shadowing: they hear a sentence and repeat it aloud.
You get the target sentence and what speech recognition (Whisper) heard. Compare them and explain the pronunciation differences.

- Ignore capitalisation, punctuation and spacing.
- The target may be puhekieli (spoken Finnish); judge against it as written.
- A heard word that is a different real Finnish word usually means a length or vowel mistake, e.g. tuli (fire) for tuuli (wind). Say what the heard word means.
- Polish has no long vowels, so Polish speakers tend to shorten aa, ee, ii, oo, uu, yy, ää, öö and sometimes lengthen the following consonant instead (tulli for tuuli). Double consonants exist in Polish (panna), so use that as a bridge when helpful.
- Speech recognition is not perfect. If a difference looks like a recognition glitch rather than speech, leave it out.
- Keep tips concrete and short: what to hold, shorten or add.`

export async function shadow(apiKey: string, run: AiRun, req: ShadowRequest, signal?: AbortSignal): Promise<ShadowResult> {
  const { text: heard } = await transcribe(run, req.audio, signal)
  if (!heard) return { heard, verdict: 'off', summary: "I didn't catch anything. Try again a little closer to the iPad.", mistakes: [] }
  if (normal(heard) === normal(req.target)) return { heard, verdict: 'match', summary: '', mistakes: [] }
  const client = new Anthropic({ apiKey })
  const stream = client.beta.messages.stream(
    {
      model: 'claude-sonnet-5-5',
      max_tokens: 4000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(Feedback), effort: 'low' },
      messages: [{ role: 'user', content: `Target: ${req.target}\nHeard: ${heard}` }],
    },
    { signal },
  )
  const message = await stream.finalMessage()
  console.log('shadow usage', JSON.stringify(message.usage))
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to check this attempt')
  const text = message.content.findLast((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No feedback (stop_reason: ${message.stop_reason})`)
  return { heard, ...Feedback.parse(JSON.parse(text.text)) }
}

const normal = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim()

export const validateShadow = (body: unknown): ShadowRequest =>
  z.object({ audio: z.string().min(1).max(2_000_000), target: z.string().trim().min(1).max(400) }).parse(body)
