import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const DISGUISE_API = '192.168.30.101:80'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/session/liveupdate': {
        target: `ws://${DISGUISE_API}`,
        ws: true,
        rewriteWsOrigin: true,
      },
      '/api': {
        target: `http://${DISGUISE_API}`,
      },
      '/docs': {
        target: `http://${DISGUISE_API}`,
      },
      '/projects': {
        target: `http://${DISGUISE_API}`,
      },
    },
  },
})
