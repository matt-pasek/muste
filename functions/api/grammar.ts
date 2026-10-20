import { grammarGuide, validateTopic } from '../../server/grammar'

type Env = { ANTHROPIC_API_KEY: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    return Response.json(await grammarGuide(env.ANTHROPIC_API_KEY, validateTopic(await request.json()), request.signal))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
