import { test, expect, type Page } from "@playwright/test";

/**
 * 安全降级 E2E（安全降级 = 框架核心卖点，单测 jsdom mock 无法覆盖真实浏览器探测）：
 *
 * addInitScript 在页面脚本执行前覆写环境 API → createGlass 内真实 probe 探测
 * 走低能力分支 → resolve 降档 → 断言玻璃滤镜消失且页面仍可正常交互
 * （降级承诺 = 无效果但可用，绝不是白屏/异常）。
 */

const demo = "http://localhost:4174";

/** 伪造"不支持 backdrop-filter"环境：探针 css 档门槛失效 */
async function gotoNoBackdropFilter(page: Page) {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    window.CSS.supports = ((prop: string | string[], value?: string) => {
      const p = Array.isArray(prop) ? prop.join(":") : prop;
      if (p.includes("backdrop-filter")) return false;
      return value === undefined ? supports(p) : supports(p, value);
    }) as typeof CSS.supports;
  });
  await page.goto(demo);
  await page.waitForLoadState("networkidle");
}

/** 伪造"用户开启减少透明度"环境：无障碍优先级最高，应压过一切效果 */
async function gotoReducedTransparency(page: Page) {
  await page.addInitScript(() => {
    const raw = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query.includes("prefers-reduced-transparency")) {
        // matches: true 让 probe 的 a11y 探测命中（结构兼容桩）
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return raw(query);
    }) as typeof window.matchMedia;
  });
  await page.goto(demo);
  await page.waitForLoadState("networkidle");
}

test("低能力环境：玻璃效果关闭但页面完整可用（降级 ≠ 白屏）", async ({ page }) => {
  await gotoNoBackdropFilter(page);

  // 页面骨架完整：antd 组件正常渲染、可交互
  await expect(page.locator(".adm-tab-bar")).toBeVisible();
  const switchEl = page.locator(".adm-switch").first();
  await switchEl.click();

  // 玻璃滤镜必须消失（安全降级的核心承诺）
  const backdrop = await page
    .locator(".lg-surface, .adm-tab-bar")
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(backdrop).toBe("none");
});

test("prefers-reduced-transparency：无障碍降级优先级最高", async ({ page }) => {
  await gotoReducedTransparency(page);

  const backdrop = await page
    .locator(".lg-surface, .adm-tab-bar")
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(backdrop).toBe("none");
  await expect(page.locator(".adm-tab-bar")).toBeVisible();
});
