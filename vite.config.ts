import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * Local dev mode (`npm run dev:local`): stands in for the Yellowscribe Lambda by running its handler
 * inside the dev server, so export works without AWS. Dev server only, never in a build.
 */
function localYellowscribe(): Plugin {
  return {
    name: 'local-yellowscribe',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local/yellowscribe', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { error: 'POST only' })
        let raw = ''
        req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')))
        req.on('end', () => {
          void (async () => {
            try {
              const event = JSON.parse(raw) as { fieldName?: string; arguments?: Record<string, unknown> }
              const mod = (await server.ssrLoadModule('/amplify/functions/yellowscribe/handler.ts')) as {
                handler: (e: typeof event) => Promise<string>
              }
              send(200, { data: await mod.handler(event) })
            } catch (e) {
              send(200, { error: e instanceof Error ? e.message : 'Something went wrong.' })
            }
          })()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'offline' ? [localYellowscribe()] : [])],
}))
