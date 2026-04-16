import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

// Custom Vite plugin to mount api/* handlers as dev middleware
// Production uses Vercel serverless functions from api/ directly.
function apiDevMiddleware(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      const readBody = (req: IncomingMessage): Promise<string> =>
        new Promise((resolve, reject) => {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(c as Buffer))
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          req.on('error', reject)
        })

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\.ts$/, '')
        const handlers: Record<string, string> = {
          router: '/api/_dev/router.ts',
          research: '/api/_dev/research.ts',
          editor: '/api/_dev/editor.ts',
          health: '/api/_dev/health.ts',
        }
        const modPath = handlers[route]
        if (!modPath) return next()
        try {
          const mod = await server.ssrLoadModule(modPath)
          const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {}
          const result = await mod.default(body)
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify(result))
        } catch (err: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of Object.keys(env)) {
    if (process.env[k] === undefined) process.env[k] = env[k]
  }
  return {
    plugins: [react(), apiDevMiddleware()],
    server: { port: 5173 },
  }
})
