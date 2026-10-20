import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { transcribe, type AiRun } from './stt.ts'

const Line = z.object({ role: z.enum(['learner', 'partner']), text: z.string().max(800) })

const ConverseRequest = z.object({
  audio: z.string().max(2_000_000).optional(),
  history: z.array(Line).max(40),
  hint: z.string().max(300).optional(),
  page: z.string().max(4000).optional(),
  register: z.enum(['kirja', 'puhe']),
})

const Reply = z.object({
  scene: z.string().describe('Only when opening: one or two English sentences setting the scene and who you are. Otherwise empty'),
  understood: z
    .string()
    .describe("The learner's own sentence rebuilt from the heard sounds, when the transcript is garbled. Keep their words and structure. Empty if it was clear or when opening"),
  reply: z
    .string()
    .describe('Your next turn in Finnish, spoken aloud, with ElevenLabs audio tags in square brackets for delivery, e.g. [laughs], [warmly], [curious]'),
  reply_en: z.string().describe('Natural English translation of `reply`, without the audio tags'),
  corrections: z
    .array(
      z.object({
        said: z.string().describe("The learner's words as heard"),
        better: z.string().describe('How to say it correctly'),
        note: z.string().describe('One or two short sentences why, in English, speaking to the learner as "you"'),
      }),
    )
    .max(2)
    .describe("At most two real mistakes in the learner's rebuilt sentence; empty when opening or when their sentence was correct"),
  suggestion: z
    .object({
      fi: z.string().describe('A short, natural answer the learner could give next, at their level'),
      en: z.string().describe('Its English translation'),
    })
    .describe('A ready-made answer to your reply, for when the learner is stuck'),
})

export type ConverseRequest = z.infer<typeof ConverseRequest>
export type ConverseLine = z.infer<typeof Line>
export type ConverseTurn = z.infer<typeof Reply> & { heard: string }

const REGISTER = {
  kirja: 'Speak standard Finnish (kirjakieli), as the textbook does.',
  puhe: 'Speak everyday spoken Finnish (puhekieli) as heard around Helsinki: mä, sä, oon, mennään, kahvii.',
}

const SYSTEM = `You are Aino, a warm, funny Finnish tutor who teaches through conversation. The learner is a beginner working
through Suomen Mestari 1; they are a native Polish speaker who also speaks English. They talk to you out loud and you hear
them through speech recognition, which often mishears learners.

How you talk:
- Lively and personal, never a dry script. React to what they said, share a small opinion or detail about yourself, joke
  gently, then hand the turn back with a question.
- Two to four short sentences per turn, A1 level: common words, mostly present tense, vocabulary from the textbook page.
- Use ElevenLabs audio tags in the reply to sound alive: [laughs], [chuckles], [warmly], [curious], [excited], [sighs],
  [thoughtful], [whispers]. One to three per turn, placed where the emotion happens. Never put tags inside a word.

You are a tutor as well as a partner:
- Start in a simple everyday role-play that fits the page (café, shop, neighbour, asking the way), but step out of it
  whenever it helps: explain a word they clearly did not know, model a phrase, or praise something they did well.
- If they ask a question about Finnish, in any language, answer it briefly in simple English inside the reply, then
  continue in Finnish.
- If they answer in English or Polish, give them the Finnish words and let them try again.
- If they seem lost, slow down: shorter sentences and an easier question.

Understanding them:
- The learner may say anything they like. The suggested answer is only a crutch; never assume they said it.
- The transcript is often garbled. Rebuild their own sentence from the sounds that were heard, staying as close to them as
  possible ("säisin ko kahvin" is "saisinko kahvin", not "haluan kahvia"). Put that in "understood" and answer it.
- Judge the rebuilt sentence, not the transcript. If it is correct Finnish, there are no corrections, even when it
  differs from what you expected. Many phrasings are right: "saisinko kahvin" (total object, -n) and "haluan kahvia"
  (partitive) are both fine.
- Only correct real language mistakes in the rebuilt sentence (wrong ending, wrong word, missing verb). Recognition
  slips are not mistakes. When a heard word is a different real word that suggests a length slip (tuli for tuuli),
  mention it gently as pronunciation.
- Polish has no long vowels, so short aa/uu/ii/ää are common. Never correct puhekieli forms. Ignore punctuation and
  capitals. Do not repeat corrections inside the reply; the app shows them separately.`

const stripTags = (s: string) => s.replace(/\[[^\]]*\]\s*/g, '').trim()

function prompt(req: ConverseRequest, heard: string) {
  const page = req.page ? `Textbook page (OCR, may be noisy):\n${req.page}\n\n` : ''
  const history = req.history.map((l) => `${l.role === 'learner' ? 'Learner' : 'You'}: ${l.text}`).join('\n')
  const task = heard
    ? `Learner just said (as transcribed): ${heard}\n\nReply in character, as tutor where useful.`
    : 'Open the conversation: introduce yourself briefly, set a scene from the page, then say your first line.'
  return `${page}${REGISTER[req.register]}\n\n${history ? `Conversation so far:\n${history}\n\n` : ''}${task}`
}

function whisperPrompt(req: ConverseRequest) {
  const last = req.history.findLast((l) => l.role === 'partner')
  return [last && stripTags(last.text), req.hint].filter(Boolean).join(' ').slice(-400)
}

export async function converse(apiKey: string, run: AiRun, req: ConverseRequest, signal?: AbortSignal): Promise<ConverseTurn | { heard: '' }> {
  const heard = req.audio ? (await transcribe(run, req.audio, signal, whisperPrompt(req))).text : ''
  if (req.audio && !heard) return { heard: '' }
  const client = new Anthropic({ apiKey })
  const stream = client.beta.messages.stream(
    {
      model: 'claude-sonnet-5-5',
      max_tokens: 3000,
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
