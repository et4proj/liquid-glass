import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

export default defineConfig({
  plugins: [
    vue(),
    // MF host（docs/proposals/playground-federation-design.md §5.2）：
    // H1 remotes 清单（端口约定 5174）；H2 shared 在 playground 源码 alias 模式下
    // 不参与匹配（core/web 被 alias 改写），一致性由 ctx.runtime 直传保证（见 DemoCenter.vue 注释）
    federation({
      name: "liquid_playground",
      remotes: {
        // dev 模式 remoteEntry 是 ESM（顶层 import + export { init, get }），
        // 必须声明 type: 'module' 走原生 import() 加载；字符串 'name@url' 形式
        // 默认按 type 'var' 用 <script> 标签注入，ESM 顶层 import 直接 SyntaxError，
        // 容器注册不上 → MF Runtime #RUNTIME-001（调试踩坑，2026-10-17）
        liquid_react_demo: {
          type: "module",
          name: "liquid_react_demo",
          entry: "http://localhost:5174/remoteEntry.js",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      // 直连 core/web 源码：改包内代码即时生效，无需先构建（调试用途）
      "@et4proj/liquid-glass-core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@et4proj/liquid-glass-web": fileURLToPath(
        new URL("../../packages/web/src/index.ts", import.meta.url),
      ),
    },
  },
});
