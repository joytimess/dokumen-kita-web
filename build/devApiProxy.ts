import type { Plugin, ProxyOptions } from 'vite'

export function devApiProxy(target: string, frontendOrigin: string): Plugin {
  for (const value of [target, frontendOrigin]) {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('Origin proxy development harus HTTP(S) tanpa path atau kredensial.')
  }
  const upstreamOrigin = new URL(frontendOrigin).origin
  const proxy: ProxyOptions = {
    target,
    changeOrigin: true,
    // Gunakan secure false kalo targeting local dev
    // Gunakaan secure true staging dan production
    secure: true,
    configure(server) {
      server.on('proxyReq', (request) => {
        request.setHeader('Origin', upstreamOrigin)
        request.setHeader('Referer', `${upstreamOrigin}/`)
        // Laravel 13 must validate the XSRF token, not trust the browser-to-proxy hop.
        request.removeHeader('Sec-Fetch-Site')
      })
      server.on('proxyRes', (response) => {
        const cookies = response.headers['set-cookie']
        if (cookies)
          response.headers['set-cookie'] = cookies.map((cookie) => {
            const [pair, ...attributes] = cookie.split(';')
            return [
              pair,
              ...attributes.filter(
                (attribute) => !/^(domain\s*=|secure\s*$|samesite\s*=)/i.test(attribute.trim()),
              ),
              ' SameSite=Lax',
            ].join(';')
          })
      })
    },
  }
  return {
    name: 'local-sanctum-api-proxy',
    apply: (_, { command, isPreview }) => command === 'serve' && !isPreview,
    config: () => ({
      server: {
        host: 'localhost',
        strictPort: true,
        proxy: { '^/(api|sanctum)(?:/|$)': proxy },
      },
    }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!/^\/(api|sanctum)(?:\/|\?|$)/.test(request.url ?? '')) return next()
        const host = `localhost:${request.socket.localPort}`
        const origin = `http://${host}`
        const suppliedOrigin = request.headers.origin
        const referer = request.headers.referer
        let allowed =
          request.headers.host === host &&
          request.headers['sec-fetch-site'] !== 'cross-site' &&
          (!suppliedOrigin || suppliedOrigin === origin)
        if (referer) {
          try {
            allowed = allowed && new URL(referer).origin === origin
          } catch {
            allowed = false
          }
        }
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '') &&
          !suppliedOrigin &&
          !referer
        )
          allowed = false
        if (!allowed) {
          response.writeHead(403, { 'Content-Type': 'application/json' })
          response.end(
            JSON.stringify({
              error: {
                code: 'DEV_PROXY_ORIGIN_REJECTED',
                message: 'Origin proxy development tidak diizinkan.',
              },
            }),
          )
          return
        }
        next()
      })
    },
  }
}
