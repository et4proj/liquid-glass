import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ tsconfigPath: "./tsconfig.json", include: ["src"] })],
  // jsx 转换由 tsconfig 的 "jsx": "react-jsx" 驱动（vite/esbuild 自动读取）
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      // Vite 6+ 库模式只自动外置 dependencies；react 在 peer/dev（运行时由宿主提供），
      // 必须显式 external，否则 react 连同 jsx-runtime 会被打进 dist——页面随即出现
      // 双 React 实例：react-dom 用页面那份接线，绑定层却调内联份的 dispatcher（
      // 永远为 null）→ null.useContext 崩溃（standalone/MF 挂载均复现，2026-10-17）
      external: [/^react($|\/)/, /^react-dom($|\/)/],
    },
  },
  test: {
    // react-dom 调度器在 jsdom 下才与 RTL/act 语义稳定（happy-dom + node timer 会崩）
    environment: "jsdom",
  },
});
