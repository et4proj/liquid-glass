import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { federation } from "@module-federation/vite";

// MF remote 配置（docs/proposals/playground-federation-design.md §5.1）：
// R1 名称 / R3 唯一出口 / R4 shared singleton（core/web/styles；vue 不进 shared，
// 与 workbench 一致：Vue remote 自带独立 vue 实例，createApp 挂 el 无碍）/ R6 端口 5176
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: "liquid_glass_vant",
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
  server: { port: 5176 },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
