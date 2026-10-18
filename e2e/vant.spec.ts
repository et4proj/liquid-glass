import { test, expect } from "@playwright/test";

/**
 * vant 演示 E2E（preview :4176，standalone 零改动接入验收形态）：
 *
 * 消费构建产物 + 真实 createGlass 探测 + adapter manifest 接管——
 * 即 Vue 线路用户真实项目接入 liquid-glass 后的最终形态（产品代码对 glass 零感知）。
 * 断言链与 antd-mobile spec 对齐：css-backend 全局注入 → GlassSurface/Tabbar 玻璃化
 * → 弹层继承 → 别名链 → 交互可用。
 */

const demo = "http://localhost:4176";

test.beforeEach(async ({ page }) => {
  await page.goto(demo);
  await page.waitForLoadState("networkidle");
});

test("css-backend 全局样式已注入（#liquid-glass-web-style 单例）", async ({ page }) => {
  await expect(page.locator("#liquid-glass-web-style")).toHaveCount(1);
});

test("GlassSurface 与 Tabbar 均被玻璃化（.lg-surface 且带 backdrop-filter）", async ({ page }) => {
  // vue 绑定层 GlassSurface + adapter 选择器发现的 vant Tabbar
  const surfaces = page.locator(".lg-surface");
  await expect(surfaces.first()).toBeVisible();
  expect(await surfaces.count()).toBeGreaterThanOrEqual(2);

  const backdrop = await surfaces.first().evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(backdrop).not.toBe("none"); // 真实 Chromium 支持 backdrop-filter
});

test("Switch 交互可用（interactive 声明不影响组件行为）", async ({ page }) => {
  const switchEl = page.locator(".van-switch").first();
  await expect(switchEl).toHaveClass(/van-switch--on/);
  await switchEl.click();
  await expect(switchEl).not.toHaveClass(/van-switch--on/);
});

test("挂 body 的弹层：glass 变量挂元素自身 + tokenMap 别名链生效", async ({ page }) => {
  await page.getByRole("button", { name: "打开 Dialog" }).click();
  const surface = page.locator(".van-dialog");
  await expect(surface).toBeVisible();

  // ① manifest surfaces 命中：--glass-* 由 runtime 挂 surface 元素自身（弹层继承不断链）
  const blur = await surface.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--glass-blur"),
  );
  expect(blur.trim()).toMatch(/^[\d.]+px$/);

  // ② tokenMap 别名（--van-background-2 → --glass-tint）：Chromium 的 custom property
  // computed 值已替换 var()——别名与 --glass-tint 同值即证明链路端到端打通
  //（vant 组件底色变量 --van-dialog-background 的值经 var(--van-background-2) 链取到玻璃着色）
  const aliased = await surface.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--van-background-2"),
  );
  const tint = await surface.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--glass-tint"),
  );
  expect(aliased.trim()).toBe(tint.trim());
  expect(aliased.trim()).toMatch(/^rgba?\(/); // 且为真实色值（ios27 tint rgba(255,255,255,0.16)）

  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText("玻璃 Dialog")).toBeHidden();
});
