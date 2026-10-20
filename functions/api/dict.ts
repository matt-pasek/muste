import { lookupWord, validateWord } from '../../server/dictionary'

const MONTH = 60 * 60 * 24 * 30

export const onRequestGet: PagesFunction = async ({ request }) => {
  try {
    const word = validateWord(new URL(request.url).searchParams.get('word'))
    const result = await lookupWord(word, { cf: { cacheTtl: MONTH, cacheEverything: true } } as RequestInit)
    return Response.json(result, { headers: { 'Cache-Control': `public, max-age=${MONTH}` } })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
