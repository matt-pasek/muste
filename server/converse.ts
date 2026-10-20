import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { transcribe, type AiRun } from './stt.ts'

const Line = z.object({ role: z.enum(['learner', 'partner']), text: z.string().max(600) })

const ConverseRequest = z.object({
  audio: z.string().max(2_000_000).optional(),
  history: z.array(Line).max(40),
  page: z.string().max(4000).optional(),
  register: z.enum(['kirja', 'puhe']),
})

const Reply = z.object({
  scene: z.string().describe('Only when opening: one English sentence setting the scene and your role. Otherwise empty'),
  reply: z.string().describe('Your next line, in Finnish, in character: one or two short sentences, usually ending with a question'),
  reply_en: z.string().describe('Natural English translation of `reply`'),
  corrections: z
    .array(
      z.object({
        said: z.string().describe('The learner\'s words as heard'),
        better: z.string().describe('How to say it correctly'),
        note: z.string().describe('One short sentence why, in English, speaking to the learner as "you"'),
      }),
    )
    .max(2)
    .describe('At most two real mistakes in the learner\'s last line; empty when opening or when it was fine'),
})

export type ConverseRequest = z.infer<typeof ConverseRequest>
export type ConverseLine = z.infer<typeof Line>
export type ConverseTurn = z.infer<typeof Reply> & { heard: string }

const REGISTER = {
  kirja: 'Speak standard written Finnish (kirjakieli), as the textbook does.',
  puhe: 'Speak everyday spoken Finnish (puhekieli) as heard around Helsinki: mä, sä, oon, mennään, kahvii.',
}

const SYSTEM = `You are a friendly conversation partner for a beginner learning Finnish with the textbook Suomen Mestari 1.
The learner is a native Polish speaker who also speaks English. They talk to you out loud; you hear them through speech
recognition (Whisper), so their line may contain recognition errors.

- Stay in a simple everyday role-play (a café, a shop, meeting a neighbour, asking the way) that fits the textbook page you are given.
- Use vocabulary and grammar from that page where you can, at A1 level: short sentences, common words, present tense mostly.
- Keep every reply to one or two short sentences, and usually end with a question so the learner has to answer.
- If the learner switches to English or Polish, gently answer in Finnish and give them the words they were looking for.
- Corrections: only real mistakes that matter (wrong case ending, wrong word, missing verb, or a heard word that is a
  different real word, which usually means a vowel or consonant length slip such as tuli for tuuli). Polish has no long
  vowels, so short aa/uu/ii are common. Ignore punctuation, capitals and likely recognition glitches. Never correct puhekieli
  forms as mistakes.
- Do not repeat the correction inside your in-character reply; keep the conversation flowing.`

function prompt(req: ConverseRequest, heard: string) {
  const page = req.page ? `Textbook page (OCR, may be noisy):\n${req.page}\n\n` : ''
  const history = req.history.map((l) => `${l.role === 'learner' ? 'Learner' : 'You'}: ${l.text}`).join('\n')
  const task = heard
    ? `Learner just said: ${heard}\n\nReply in character and list any corrections.`
    : 'Open the conversation: set a scene from the page, then say your first line.'
  return `${page}${REGISTER[req.register]}\n\n${history ? `Conversation so far:\n${history}\n\n` : ''}${task}`
}

export async function converse(apiKey: string, run: AiRun, req: ConverseRequest, signal?: AbortSignal): Promise<ConverseTurn | { heard: '' }> {
  const heard = req.audio ? (await transcribe(run, req.audio, signal)).text : ''
  if (req.audio && !heard) return { heard: '' }
  const client = new Anthropic({ apiKey })
  const stream = client.beta.messages.stream(
    {
      model: 'claude-sonnet-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(Reply), effort: 'low' },
      messages: [{ role: 'user', content: prompt(req, heard) }],
    },
    { signal },
  )
  const message = await stream.finalMessage()
  console.log('converse usage', JSON.stringify(message.usage))
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to continue this conversation')
  const text = message.content.findLast((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No reply (stop_reason: ${message.stop_reason})`)
  return { heard, ...Reply.parse(JSON.parse(text.text)) }
}

export const validateConverse = (body: unknown): ConverseRequest => ConverseRequest.parse(body)
