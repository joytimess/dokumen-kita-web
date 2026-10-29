import { fileURLToPath, URL } from 'node:url'

import { createServer, defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { pdfAssets } from './build/pdfAssets.ts'
import { devApiProxy } from './build/devApiProxy.ts'

function prerenderLanding(): Plugin {
  return {
    name: 'prerender-landing',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('HTML landing tidak ditemukan')
      const html = String(index.source)
      const seo = html.match(/<!-- public-seo-start -->([\s\S]*?)<!-- public-seo-end -->/)
      if (!seo) throw new Error('Metadata landing tidak ditemukan')
      const landingCss = Object.keys(bundle).find((file) => /^assets\/LandingView-.*\.css$/.test(file))
      if (!landingCss) throw new Error('CSS landing tidak ditemukan')
      const markedSeo = seo[1]!.replace(/<(link|meta|script)\b/g, '<$1 data-public-seo')
      const template = `<template id="public-seo">${markedSeo}</template>`
      const server = await createServer({
        configFile: false,
        plugins: [vue()],
        resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
        server: { middlewareMode: true },
        appType: 'custom',
        logLevel: 'error',
      })
      try {
        const [{ createSSRApp }, { renderToString }, { createPinia }, { createMemoryHistory, createRouter }, landing] = await Promise.all([
          import('vue'), import('@vue/server-renderer'), import('pinia'), import('vue-router'),
          server.ssrLoadModule('/src/views/LandingView.vue'),
        ])
        const app = createSSRApp(landing.default)
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: landing.default }] })
        app.use(createPinia()).use(router)
        await router.push('/')
        await router.isReady()
        const content = await renderToString(app)
        index.source = html.replace(seo[0], `${markedSeo}${template}<link rel="stylesheet" href="/${landingCss}">`).replace('<div id="app"></div>', `<div id="app">${content}</div>`)
        this.emitFile({ type: 'asset', fileName: 'spa.html', source: html.replace(seo[0], template).replace('content="index, follow"', 'content="noindex, nofollow"') })
      } finally {
        await server.close()
      }
    },
  }
}

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyEnabled = command === 'serve' && !isPreview && mode === 'development' &&
    env.VITE_DEV_API_PROXY === 'true'

  return {
    plugins: [tailwindcss(), vue(), vueDevTools(), pdfAssets(), prerenderLanding(),
      ...(proxyEnabled ? [devApiProxy(env.VITE_API_BASE_URL!, env.VITE_DEV_PROXY_ORIGIN!)] : [])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
  }
})
