import { test, expect, type Page } from "@playwright/test";

/**
 * workbench 工作台 E2E（preview :4175，消费构建产物）：
 *
 * 验证 resolve → token → CSS 变量的完整决策链路在真实浏览器的工作形态：
 * 风格切换（ios27↔ios26 校准锚点值）、强度插值、a11y/能力模拟降档。
 * 数值断言来自风格包校准表（ios27: 2/6/12px，ios26: 4/16/36px）。
 */

const workbench = "http://localhost:4175";

/** 取第一张玻璃卡片上内联挂载的 --glass-blur（token v2：material 通道投影） */
async function glassBlur(page: Page): Promise<string> {
  const card = page.locator(".glass-card").first();
  return card.evaluate((el) => getComputedStyle(el).getPropertyValue("--glass-blur").trim());
}

/** 取第一张卡片的档位徽章文本（css / solid / none …） */
async function tier(page: Page): Promise<string> {
  return page.locator(".glass-card .tier").first().innerText();
}

test.beforeEach(async ({ page }) => {
  await page.goto(workbench);
  // 工作台挂载完成 + resolve 首帧就绪的标志：卡片与档位徽章渲染
  await expect(page.locator(".glass-card .tier").first()).not.toHaveText("");
});

test("三张玻璃卡片（bar / card / control）全部渲染", async ({ page }) => {
  await expect(page.locator(".glass-card.variant-bar")).toHaveCount(1);
  await expect(page.locator(".glass-card.variant-card")).toHaveCount(1);
  await expect(page.locator(".glass-card.variant-control")).toHaveCount(1);
});

test("默认 ios27 regular：blur 命中校准锚点 6px，档位 css", async ({ page }) => {
  expect(await tier(page)).toBe("css");
  expect(await glassBlur(page)).toBe("6px");
});

test("风格切换 ios27→ios26：blur 6px→16px（校准表数值）", async ({ page }) => {
  const styleSelect = page.locator("aside.panel select").first();
  await styleSelect.selectOption("ios26");
  expect(await glassBlur(page)).toBe("16px");
  // 切回 ios27 数值还原（updateConfig 等价路径，状态无残留）
  await styleSelect.selectOption("ios27");
  expect(await glassBlur(page)).toBe("6px");
});

test("强度插值：preset strong 命中 ios27 上锚点 12px", async ({ page }) => {
  const preset = (label: string) => page.locator("aside.panel button.preset", { hasText: label });
  await preset("strong").click();
  expect(await glassBlur(page)).toBe("12px");
  await preset("subtle").click();
  expect(await glassBlur(page)).toBe("2px");
});

test("能力模拟：关闭 backdropFilter 降档 solid，blur 归零", async ({ page }) => {
  const checkbox = page.locator("aside.panel label.check input").first(); // caps.backdropFilter（css 档门槛）
  await checkbox.uncheck();
  expect(await tier(page)).toBe("solid");
  // GlassCard 的 .glass 样式固定（demo 卡非后端接管），降档体现为 token 归零：
  // solid 档 blur = 0px（内联 --glass-blur 由 plan.tokens.material 驱动）
  expect(await glassBlur(page)).toBe("0px");
});

test("无障碍优先：勾选 prefers-reduced-transparency 压档 solid（resolve 语义）", async ({
  page,
}) => {
  // core resolve 语义：reduceTransparency → maxTier 压到 solid（非 none——
  // 用户要的是不透明材质而非无效果，见 resolve.ts a11y 分支）
  const checkbox = page.locator("aside.panel label.check input").nth(4); // a11y.reduceTransparency（能力区 4 个 checkbox 之后）
  await checkbox.check();
  expect(await tier(page)).toBe("solid");
  // 降级原因徽章带 a11y: 前缀（reason 通道）
  await expect(page.locator(".glass-card .reason.a11y").first()).toBeVisible();
  expect(await glassBlur(page)).toBe("0px");
});
