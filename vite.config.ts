import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseAnswerPage, validateAnswers } from './server/answers.ts'
import { lookupWord, validateWord } from './server/dictionary.ts'
import { explainEvents } from './server/explain.ts'
import { grammarGuide, validateTopic } from './server/grammar.ts'

type Handler = (apiKey: string, body: unknown, signal: AbortSignal, res: ServerResponse) => Promise<void>

const sendJson = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(value))
}

const explainHandler: Handler = async (apiKey, body, signal, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson')
  for await (const line of explainEvents(apiKey, body, signal)) res.write(line)
  res.end()
}

const jsonHandler =
  (run: (apiKey: string, body: unknown, signal: AbortSignal) => Promise<unknown>): Handler =>
  async (apiKey, body, signal, res) => {
    try {
      sendJson(res, 200, await run(apiKey, body, signal))
    } catch (err) {
      if (!signal.aborted) sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }

const answersHandler = jsonHandler((key, body, signal) => parseAnswerPage(key, validateAnswers(body), signal))
const grammarHandler = jsonHandler((key, body, signal) => grammarGuide(key, validateTopic(body), signal))

async function dictRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const word = validateWord(new URL(req.url ?? '', 'http://localhost').searchParams.get('word'))
    sendJson(res, 200, await lookupWord(word))
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

function devApi(apiKey: string | undefined): Plugin {
  const route = (handler: Handler) => async (req: IncomingMessage, res: ServerResponse) => {
    if (!apiKey) return sendJson(res, 500, { error: 'Set ANTHROPIC_API_KEY in .env.local' })
    const ctrl = new AbortController()
    res.on('close', () => !res.writableEnded && ctrl.abort())
    let body = ''
    for await (const chunk of req) body += chunk
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' })
    }
    await handler(apiKey, parsed, ctrl.signal, res)
  }
  return {
    name: 'muste-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/explain', route(explainHandler))
      server.middlewares.use('/api/answers', route(answersHandler))
      server.middlewares.use('/api/grammar', route(grammarHandler))
      server.middlewares.use('/api/dict', dictRoute)
    },
  }
}

const pwa = VitePWA({
  registerType: 'autoUpdate',
  pwaAssets: { config: true, overrideManifestIcons: true },
  manifest: {
    name: 'muste',
    short_name: 'muste',
    description: 'Suomen Mestari with a pencil and a patient tutor',
    display: 'standalone',
    orientation: 'any',
    start_url: '/',
    background_color: '#e7dcc8',
    theme_color: '#e7dcc8',
  },
  workbox: {
    globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data)/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'tesseract',
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), basicSsl(), devApi(env.ANTHROPIC_API_KEY), pwa],
    server: { host: true },
  }
})
