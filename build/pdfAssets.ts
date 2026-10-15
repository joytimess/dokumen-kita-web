import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// PDF.js loads fonts/CMaps/decoders by filename. Preserve those filenames in
// both Vite development and production instead of relying on a third-party CDN.
export function pdfAssets(): Plugin {
  const root = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
  const files = new Map<string, Buffer>()
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.isFile())
        files.set(`${directory}/${entry.name}`, readFileSync(join(root, directory, entry.name)))
    }
  }
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        const prefix = `${server.config.base}pdfjs/`
        if (!path.startsWith(prefix)) return next()
        const name = path.slice(prefix.length),
          data = files.get(name)
        if (!data) return next()
        response.setHeader(
          'Content-Type',
          name.endsWith('.wasm')
            ? 'application/wasm'
            : name.endsWith('.js')
              ? 'application/javascript'
              : 'application/octet-stream',
        )
        response.end(data)
      })
    },
    generateBundle() {
      for (const [name, source] of files)
        this.emitFile({ type: 'asset', fileName: `pdfjs/${name}`, source })
    },
  }
}
