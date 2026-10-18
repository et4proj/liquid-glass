import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ tsconfigPath: "./tsconfig.json", include: ["src"] })],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      // 同 react 包教训（m1-react-line #21）：vue 在 peer/dev（运行时由宿主提供），
      // Vite 库模式只自动外置 dependencies，必须显式 external，否则 vue 运行时被打进
      // dist → 宿主出现双 Vue 实例：provide/inject 的应用上下文与插件注册的指令集互不可见
      external: [/^vue($|\/)/],
    },
  },
  test: {
    // @vue/test-utils 挂载链路在 jsdom 下稳定
    environment: "jsdom",
  },
});
