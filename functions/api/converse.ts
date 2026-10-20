import { converse, validateConverse } from '../../server/converse'

type Env = { ANTHROPIC_API_KEY: string; AI: Ai }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const run = (model: string, input: Record<string, unknown>) => env.AI.run(model as never, input as never)
    return Response.json(await converse(env.ANTHROPIC_API_KEY, run, validateConverse(await request.json()), request.signal))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
