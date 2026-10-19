// Cloudflare Pages Function: POST /api/explain. Put the whole Pages project
// behind Cloudflare Access so only you can reach it; the key lives in the
// ANTHROPIC_API_KEY secret and never ships to the browser.
import { explain, validate } from '../../server/explain'

type Env = { ANTHROPIC_API_KEY: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const result = await explain(env.ANTHROPIC_API_KEY, validate(await request.json()))
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
