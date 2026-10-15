import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 直连 core/web 源码：改包内代码即时生效，无需先构建（调试用途）
      '@et4proj/liquid-glass-core': fileURLToPath(
        new URL('../packages/core/src/index.ts', import.meta.url),
      ),
      '@et4proj/liquid-glass-web': fileURLToPath(
        new URL('../packages/web/src/index.ts', import.meta.url),
      ),
    },
  },
})
