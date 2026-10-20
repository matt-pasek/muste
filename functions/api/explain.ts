import { explainEvents } from '../../server/explain'

type Env = { ANTHROPIC_API_KEY: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const lines = explainEvents(env.ANTHROPIC_API_KEY, body, request.signal)
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await lines.next()
      if (done) controller.close()
      else controller.enqueue(encoder.encode(value))
    },
    async cancel() {
      await lines.return(undefined)
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } })
}
