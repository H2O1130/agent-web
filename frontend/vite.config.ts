import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/backend': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/backend(?=\/|$)/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/backend': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/backend(?=\/|$)/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: id => /node_modules\/(echarts|zrender)\//.test(id) ? 'charts' : undefined },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
