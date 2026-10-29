import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    // 把 /api/* 转发到 agent/backend，前端无需处理跨域
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: id => /node_modules\/(echarts|zrender)\//.test(id) ? 'charts' : undefined },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
