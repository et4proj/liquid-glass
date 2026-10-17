import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ tsconfigPath: "./tsconfig.json", include: ["src"] })],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
    },
  },
  test: {
    environment: "happy-dom",
  },
});
