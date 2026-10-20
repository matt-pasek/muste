import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

const Item = z.object({
  n: z.string().describe('The item label as printed, e.g. "1", "a", "3." without the dot; empty if unnumbered'),
  answer: z.string().describe('The answer exactly as printed, keeping ä, ö, slashes for alternatives and line breaks as " / "'),
})

const Part = z.object({
  label: z.string().describe('Sub-part letter such as "A" or "B"; empty if the exercise has no parts'),
  items: z.array(Item),
})

const Exercise = z.object({
  section: z
    .string()
    .describe('The section heading this exercise sits under, e.g. "Kappale 3" or "Lisäharjoitukset"'),
  number: z.number().int().describe('The Harjoitus number'),
  continued: z.boolean().describe('True only for an exercise whose heading was on an earlier page'),
  parts: z.array(Part),
})

export const AnswerPage = z.object({ exercises: z.array(Exercise) })
export type AnswerPage = z.infer<typeof AnswerPage>
export type AnswerExercise = z.infer<typeof Exercise>

export type AnswersRequest = {
  image: string
  ocr: string
  context: { section: string; number: number } | null
}

const SYSTEM = `You transcribe the answer key ("Harjoitusten ratkaisut") of the Finnish textbook Suomen Mestari 1.
Each page has two or three columns. Read every column top to bottom, left column first.
Section headings sit in coloured pills ("Kappale 4", "Lisäharjoitukset"); every exercise belongs to the most recent one.
Transcribe the answers exactly; do not correct, translate or add anything.
OCR text of the page is included as a spelling hint only: its columns are interleaved and it has errors, so the image is the truth.`

export async function parseAnswerPage(apiKey: string, req: AnswersRequest, signal?: AbortSignal): Promise<AnswerPage> {
  const client = new Anthropic({ apiKey })
  const carried = req.context
    ? `The previous page ended inside ${req.context.section}, Harjoitus ${req.context.number}. Content before the first heading on this page continues it.`
    : 'This is the first page of the answer key.'
  const stream = client.beta.messages.stream(
    {
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(AnswerPage), effort: 'medium' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image } },
            { type: 'text', text: `${carried}\n\nOCR hint:\n${req.ocr}` },
          ],
        },
      ],
    },
    { signal },
  )
  const message = await stream.finalMessage()
  console.log('answers usage', JSON.stringify(message.usage))
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to read this page')
  if (message.stop_reason === 'max_tokens') throw new Error('The page was too long to transcribe')
  const text = message.content.findLast((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No transcription (stop_reason: ${message.stop_reason})`)
  return AnswerPage.parse(JSON.parse(text.text))
}

export function validateAnswers(body: unknown): AnswersRequest {
  return z
    .object({
      image: z.string().min(1).max(6_000_000),
      ocr: z.string().max(40_000),
      context: z.object({ section: z.string().max(60), number: z.number().int() }).nullable(),
    })
    .parse(body)
}
