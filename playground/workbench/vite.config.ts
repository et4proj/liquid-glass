import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// MF remote 配置（docs/proposals/playground-federation-design.md）：
// 名称 / 唯一出口（./app → mount/unmount 协议）/ shared singleton / 端口 5175
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "liquid_glass_workbench",
      filename: "remoteEntry.js",
      exposes: {
        "./app": "./src/remote",
      },
      shared: {
        "@et4proj/liquid-glass-core": { singleton: true, requiredVersion: false },
        "@et4proj/liquid-glass-web": { singleton: true, requiredVersion: false },
        "@et4proj/liquid-glass-style-ios27": { singleton: true, requiredVersion: false },
      },
    }),
  ],
  resolve: {
    alias: {
      // 直连 core/web 源码：改包内代码即时生效，无需先构建（工作台的立身之本）
      "@et4proj/liquid-glass-core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@et4proj/liquid-glass-web": fileURLToPath(
        new URL("../../packages/web/src/index.ts", import.meta.url),
      ),
    },
  },
  server: { port: 5175 },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
