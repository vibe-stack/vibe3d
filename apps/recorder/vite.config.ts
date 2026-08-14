import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const TERRAIN_ARTIFACT_ROUTE = '/__terrain-artifacts/'
const TERRAIN_ARTIFACTS = resolve(import.meta.dirname, '../../assets/terrain')

/**
 * Serve freshly compiled terrain artifacts during development.
 *
 * Vite expands import.meta.glob when it transforms a scene module. If a compiler
 * adds or atomically replaces a file after that transform, an already-running dev
 * server can retain the old URL map until it restarts. This narrow route lets the
 * scene loader recover the exact named artifact immediately. Production builds
 * still use Vite's fingerprinted asset URLs and never depend on this middleware.
 */
function terrainArtifacts() {
  return {
    name: 'recorder-terrain-artifacts',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(TERRAIN_ARTIFACT_ROUTE, async (
        request: { url?: string },
        response: { statusCode: number; setHeader(name: string, value: string): void; end(value?: unknown): void },
        next: () => void,
      ) => {
        const pathname = decodeURIComponent((request.url ?? '').split('?')[0] ?? '')
        const match = pathname.match(
          /^\/(glacial-granite-boulder\/cliff|red-sandstone-canyon\/canyon)\/([a-z0-9-]+\.(?:vtopo|vbake))$/,
        )
        if (!match) {
          next()
          return
        }
        const file = resolve(TERRAIN_ARTIFACTS, match[1]!, match[2]!)
        try {
          const bytes = await readFile(file)
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(bytes)
        } catch {
          response.statusCode = 404
          response.end()
        }
      })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [terrainArtifacts(), react()],
  resolve: {
    alias: [
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
})
