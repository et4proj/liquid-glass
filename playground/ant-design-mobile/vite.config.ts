import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
// MF remote 配置（docs/proposals/playground-federation-design.md §5.1）：
// R1 名称 / R3 唯一出口 / R4 shared singleton（core/web/styles）/ R6 端口 5174
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "liquid_react_demo",
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
  server: { port: 5174 },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
