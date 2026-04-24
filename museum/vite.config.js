import { defineConfig } from 'vite'

export default defineConfig({
  base: '/museum/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  optimizeDeps: {
    include: ['three']
  }
})
