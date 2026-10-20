import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { CASES } from './grammar.ts'

const Word = z.object({
  form: z.string().describe('The word exactly as printed (keep ä, ö, å)'),
  gloss: z.string().describe('English meaning in this context, a few words'),
  lemma: z.string().describe('Dictionary (base) form'),
  case: z.enum([...CASES, 'none']).describe('The case of a noun, adjective, pronoun or numeral; "none" for verbs and uninflected words'),
  number: z.enum(['singular', 'plural', 'none']),
  grammar: z.string().describe('Case/number for nominals, tense/person/mood for verbs, e.g. "inessive singular"'),
  pos: z.string().describe('Part of speech, lowercase, e.g. "noun"'),
  why: z.string().describe('What the ending does and why it is used here, one or two short sentences'),
  spoken: z.string().describe('How this word is usually said in puhekieli in this sentence; the same as form if it does not change'),
})

const WordLookup = z.object({
  word: Word,
  sentence: z.string().describe('The printed sentence or phrase the word belongs to'),
  sentence_spoken: z.string().describe('The same sentence as it would naturally be said in puhekieli'),
  sentence_en: z.string().describe('Natural English translation of that sentence'),
})

const RegionLookup = z.object({
  kind: z.enum(['text', 'exercise']).describe('"exercise" if the image is a task to fill in or answer, otherwise "text"'),
  fi: z.string().describe('text: the passage as printed. exercise: only its title and instruction, not the items'),
  en: z.string().describe('Natural English translation of `fi`'),
  sentences: z
    .array(
      z.object({
        fi: z.string(),
        spoken: z.string().describe('The sentence as naturally said in puhekieli'),
        en: z.string(),
      }),
    )
    .describe('text: each sentence with its puhekieli version and translation. exercise: empty'),
  rule: z
    .string()
    .describe('exercise: the grammar point being practised, 1-3 sentences, never revealing any item\'s answer. text: empty'),
  example: z
    .string()
    .describe('exercise: one worked example that is NOT one of the items, e.g. "talo → talossa". text: empty'),
  words: z
    .array(Word)
    .describe('text: the content words worth learning. exercise: vocabulary from the items, in their printed form, without solving them'),
})

export type Word = z.infer<typeof Word>
export type WordLookup = z.infer<typeof WordLookup>
export type RegionLookup = z.infer<typeof RegionLookup>
export type Explanation = ({ kind: 'word' } & WordLookup) | RegionLookup

export type ExplainRequest = {
  kind: 'word' | 'region'
  image?: string
  text?: { word: string; line: string }
}

export type ExplainEvent =
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; result: Explanation }
  | { type: 'error'; message: string }

const SYSTEM = `You help an English-speaking learner study Finnish from the Suomen Mestari textbook.
You receive a cropped image of a textbook page, or a word and its line as read by OCR.
Read the printed Finnish precisely (keep ä, ö and å); OCR text may contain small misreadings, so fix
obvious ones, and leave out stray letters or symbols that OCR picked up from graphics, banners or
page edges (a lone "H" or "K" before a heading is noise, not part of the text). Ignore any handwriting: it is the learner's own answers. Never give away the answers to
an exercise; explain the rule so the learner can solve it. Be concise: short glosses, no filler.
Puhekieli means everyday spoken Finnish as heard around Helsinki: mä, sä, se, me, te, ne; oon, oot;
passive for "we" (me mennään); shortened forms (kahvii, tääl, mis); dropped final sounds. Keep it natural
and common, not slang-heavy.`

const ROUTES = {
  word: {
    model: 'claude-sonnet-5-5',
    schema: WordLookup,
    prompt: 'Explain only the single word marked in red. Use the line it sits on as the sentence.',
  },
  region: {
    model: 'claude-opus-5-5',
    schema: RegionLookup,
    prompt: 'Explain the content of this image.',
  },
} as const

function content(req: ExplainRequest, prompt: string): Anthropic.Beta.BetaContentBlockParam[] {
  if (req.text) {
    return [{ type: 'text', text: `Explain the word «${req.text.word}» as used in this line: «${req.text.line}»` }]
  }
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image! } },
    { type: 'text', text: prompt },
  ]
}

export async function* explain(apiKey: string, req: ExplainRequest, signal?: AbortSignal): AsyncGenerator<ExplainEvent> {
  const route = ROUTES[req.kind]
  const client = new Anthropic({ apiKey })
  const stream = client.beta.messages.stream(
    {
      model: route.model,
      max_tokens: 16000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(route.schema), effort: 'low' },
      messages: [{ role: 'user', content: content(req, route.prompt) }],
    },
    { signal },
  )

  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'fallback') yield { type: 'reset' }
    else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'delta', text: event.delta.text }
  }

  const message = await stream.finalMessage()
  console.log('explain usage', route.model, JSON.stringify(message.usage))
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to explain this')
  if (message.stop_reason === 'max_tokens') throw new Error('The explanation was cut off')
  const text = message.content.findLast((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No explanation (stop_reason: ${message.stop_reason})`)
  const parsed = route.schema.parse(JSON.parse(text.text))
  yield { type: 'done', result: req.kind === 'word' ? { kind: 'word', ...(parsed as WordLookup) } : (parsed as RegionLookup) }
}

export async function* explainEvents(apiKey: string, body: unknown, signal?: AbortSignal): AsyncGenerator<string> {
  try {
    for await (const event of explain(apiKey, validate(body), signal)) yield JSON.stringify(event) + '\n'
  } catch (err) {
    if (signal?.aborted) return
    yield JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) }) + '\n'
  }
}

export function validate(body: unknown): ExplainRequest {
  return z
    .object({
      kind: z.enum(['word', 'region']),
      image: z.string().min(1).max(2_000_000).optional(),
      text: z.object({ word: z.string().min(1).max(80), line: z.string().min(1).max(400) }).optional(),
    })
    .refine((r) => r.image || (r.kind === 'word' && r.text), 'Send an image, or text for a word lookup')
    .parse(body)
}
