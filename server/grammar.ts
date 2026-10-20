import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export const CASES = [
  'nominative',
  'genitive',
  'partitive',
  'accusative',
  'inessive',
  'elative',
  'illative',
  'adessive',
  'ablative',
  'allative',
  'essive',
  'translative',
  'abessive',
  'comitative',
  'instructive',
] as const
export type Case = (typeof CASES)[number]

const Example = z.object({ fi: z.string(), en: z.string() })

export const GrammarGuide = z.object({
  title: z.string().describe('English name with the Finnish name in brackets, e.g. "Partitive (partitiivi)"'),
  questions: z.string().describe('The Finnish question words that ask for this case, e.g. "mitä? ketä?"'),
  summary: z.string().describe('One or two sentences: what the case expresses'),
  endings: z.string().describe('The endings at a glance, e.g. "-a/-ä, -ta/-tä, -tta/-ttä"'),
  formation: z
    .array(z.object({ rule: z.string(), examples: z.array(z.string()).describe('Base form → case form, e.g. "talo → taloa"') }))
    .describe('How to form the singular, ordered from the most common pattern, including consonant gradation where relevant'),
  plural: z.object({ rule: z.string(), examples: z.array(z.string()) }),
  uses: z.array(z.object({ rule: z.string(), example: Example })).describe('When to use it, most important first'),
  pitfalls: z.array(z.string()).describe('Common learner mistakes, short'),
})
export type GrammarGuide = z.infer<typeof GrammarGuide>

export const SpokenGuide = z.object({
  title: z.string(),
  summary: z.string().describe('Two sentences: what puhekieli is and when the learner will hear it'),
  sections: z
    .array(
      z.object({
        title: z.string().describe('A theme, e.g. "Pronouns", "Olla", "Me + passive", "Vowel changes"'),
        rule: z.string(),
        pairs: z.array(z.object({ kirja: z.string(), puhe: z.string(), en: z.string() })).describe('Written → spoken pairs'),
      }),
    )
    .describe('Ordered from what a beginner hears most often'),
  tips: z.array(z.string()).describe('Short practical tips on when to use or avoid puhekieli'),
})
export type SpokenGuide = z.infer<typeof SpokenGuide>

export const TOPICS = [...CASES, 'puhekieli'] as const
export type Topic = (typeof TOPICS)[number]
export type Guide = ({ kind: 'case' } & GrammarGuide) | ({ kind: 'spoken' } & SpokenGuide)

const SYSTEM = `You write compact grammar reference cards for an English-speaking learner at the level of Suomen Mestari 1-2.
Be accurate and concrete, prefer everyday vocabulary in examples, and keep every line short.
For cases, every example is exactly "base form → inflected form" with real words, and each word appears under the rule it actually follows.`

async function writeCard<T>(apiKey: string, schema: z.ZodType<T>, request: string, signal?: AbortSignal): Promise<T> {
  const client = new Anthropic({ apiKey })
  const stream = client.beta.messages.stream(
    {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(schema), effort: 'medium' },
      messages: [{ role: 'user', content: request }],
    },
    { signal },
  )
  const message = await stream.finalMessage()
  console.log('grammar usage', request, JSON.stringify(message.usage))
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to write this guide')
  const text = message.content.findLast((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No guide (stop_reason: ${message.stop_reason})`)
  return schema.parse(JSON.parse(text.text))
}

export async function grammarGuide(apiKey: string, topic: Topic, signal?: AbortSignal): Promise<Guide> {
  if (topic === 'puhekieli') {
    const card = await writeCard(apiKey, SpokenGuide, 'Write the reference card for puhekieli, everyday spoken Finnish, as a learner first meets it.', signal)
    return { kind: 'spoken', ...card }
  }
  const card = await writeCard(apiKey, GrammarGuide, `Write the reference card for the Finnish ${topic} case.`, signal)
  return { kind: 'case', ...card }
}

export const validateTopic = (body: unknown) => z.object({ topic: z.enum(TOPICS) }).parse(body).topic
