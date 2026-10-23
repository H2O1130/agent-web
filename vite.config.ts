import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: { manualChunks: id => /node_modules\/(echarts|zrender)\//.test(id) ? 'charts' : undefined },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
