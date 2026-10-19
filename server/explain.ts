import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const Explanation = z.object({
  text: z.string().describe('The selected Finnish text exactly as printed'),
  sentence: z.string().describe('The full sentence or phrase it belongs to, if visible; otherwise the same as text'),
  translation: z.string().describe('Natural English translation of the selected text'),
  words: z.array(
    z.object({
      form: z.string().describe('The word as it appears in the text'),
      lemma: z.string().describe('Dictionary (base) form'),
      pos: z.string().describe('Part of speech'),
      grammar: z.string().describe('Case/number for nominals, tense/person/mood for verbs, e.g. "inessive singular"'),
      gloss: z.string().describe('English meaning in this context'),
      why: z.string().describe('What the ending does and why it is used here, one or two sentences'),
    }),
  ),
})
export type Explanation = z.infer<typeof Explanation>

// The textbook PDFs are scans with no text layer, so the client sends a crop
// of the rendered page instead of selected text.
export type ExplainRequest = {
  kind: 'word' | 'region'
  image: string // base64 JPEG, no data: prefix
}

const SYSTEM = `You help an English-speaking learner study Finnish from the Suomen Mestari textbook.
You receive a cropped image of a textbook page. Read the Finnish text precisely (keep ä, ö and å), translate it,
and break down each Finnish word: lemma, part of speech, grammatical form, contextual meaning, and what the suffix
is doing and why it is needed here. Use nearby text only to disambiguate. Be concise and precise.`

const PROMPTS = {
  word: 'Explain only the single word marked by the red circle. Use the line it sits on as the sentence.',
  region: 'Explain all of the text in this image.',
}

export async function explain(apiKey: string, req: ExplainRequest) {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Explanation) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image } },
          { type: 'text', text: PROMPTS[req.kind] },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error(`No explanation (stop_reason: ${response.stop_reason})`)
  }
  // Logged so we can compare real per-lookup cost against the estimate.
  console.log('explain usage', JSON.stringify(response.usage))
  return response.parsed_output
}

export function validate(body: unknown): ExplainRequest {
  return z
    .object({
      kind: z.enum(['word', 'region']),
      // ~1.5 MB of base64 is far more than any crop we send.
      image: z.string().min(1).max(2_000_000),
    })
    .parse(body)
}
