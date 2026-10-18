import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 测试配置（Playwright，docs/implementation/m1-testing.md）：
 *
 * - 消费构建产物（vite preview 起各 demo 的 dist），验证"零改动接入"的发布链路，
 *   而非 dev server 源码形态——与真实用户接入路径一致。
 * - 两个被测站点：antd-mobile 演示（真实 createGlass + probe 探测 + adapter 接管）、
 *   workbench 工作台（全量 resolve 面板交互）。降级路径（安全降级 = 核心卖点）
 *   通过 addInitScript 覆写环境 API 在真实浏览器复验，单测里的 jsdom mock 无法覆盖。
 * - 端口约定（federation 设计 R6 顺延）：preview 4174 / 4175 / 4176，避开 dev 的 5173-5179。
 *
 * 运行：`pnpm e2e`（先全量 build 再跑）；spec 调试期 `pnpm e2e:only`（要求 dist 已存在）。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
    // 移动端优先：375 宽视口（框架定位移动端组件库）
    viewport: { width: 375, height: 812 },
  },
  projects: [
    {
      name: "chromium",
      // channel: "chromium" = 用完整 chromium 的 new headless（而非默认的
      // chrome-headless-shell）——国内网络 shell/ffmpeg 二进制常下载失败，
      // 完整 chromium 可手动下载 zip 后本地镜像安装（PLAYWRIGHT_DOWNLOAD_HOST）
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @et4proj/liquid-glass-playground-antd-mobile preview --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "pnpm --filter @et4proj/liquid-glass-playground-workbench preview --port 4175 --strictPort",
      url: "http://localhost:4175",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "pnpm --filter @et4proj/liquid-glass-playground-vant preview --port 4176 --strictPort",
      url: "http://localhost:4176",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
