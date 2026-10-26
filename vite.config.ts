import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { pdfAssets } from './build/pdfAssets.ts'
import { devApiProxy } from './build/devApiProxy.ts'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyEnabled = command === 'serve' && !isPreview && mode === 'development' &&
    env.VITE_DEV_API_PROXY === 'true'

  return {
    plugins: [tailwindcss(), vue(), vueDevTools(), pdfAssets(),
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
