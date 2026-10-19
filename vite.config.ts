import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { explain, validate } from './server/explain.ts'

// Serves /api/explain from the dev server so the spike works over LAN
// without Wrangler. Production uses functions/api/explain.ts instead.
function devApi(apiKey: string | undefined): Plugin {
  return {
    name: 'muste-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/explain', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (!apiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Set ANTHROPIC_API_KEY in .env.local' }))
          return
        }
        try {
          let body = ''
          for await (const chunk of req) body += chunk
          res.end(JSON.stringify(await explain(apiKey, validate(JSON.parse(body)))))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), basicSsl(), devApi(env.ANTHROPIC_API_KEY)],
    server: { host: true },
  }
})
