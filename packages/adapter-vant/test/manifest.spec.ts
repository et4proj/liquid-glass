import { describe, expect, it } from "vitest";
import { vantAdapter } from "../src";

/** manifest 结构单测：JSON-safe / 选择器合法 / 补丁合法（内核行为由 @et4proj/liquid-glass-adapter 覆盖） */

describe("vantAdapter manifest", () => {
  it("JSON-safe（可序列化远程下发）", () => {
    const round = JSON.parse(JSON.stringify(vantAdapter));
    expect(round.library).toBe("vant");
    expect(round.framework).toBe("vue");
  });

  it("surfaces 选择器全部非空且唯一", () => {
    const selectors = vantAdapter.surfaces.map((s) => s.selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect(new Set(selectors).size).toBe(selectors.length);
    for (const s of selectors) {
      expect(s).toMatch(/^\.[a-z0-9-]+$/i);
    }
  });

  it("弹层类表面带 overlay 标记", () => {
    const overlays = vantAdapter.surfaces.filter((s) => s.overlay);
    expect(overlays.map((s) => s.selector)).toContain(".van-popup");
    // Toast 深底直接值，必须 overlay + patch 双覆盖
    expect(overlays.map((s) => s.selector)).toContain(".van-toast");
  });

  it("直接值底色组件（toast/switch）必须有补丁覆盖（不走 tokenMap 别名链）", () => {
    const css = (vantAdapter.patches ?? []).map((p) => p.css).join("\n");
    expect(css).toContain(".van-toast");
    expect(css).toContain("--van-switch-background: var(--glass-tint)");
  });

  it("tokenMap：库变量名 --van-* 前缀、别名指向合法 --glass-* 变量（不瞎编）", () => {
    const tokenMap = vantAdapter.tokenMap ?? {};
    expect(Object.keys(tokenMap).length).toBeGreaterThan(0);
    // --glass-* 白名单与 web css-backend 的变量投影一致（css-backend.ts buildCssVars）
    const glassVars = [
      "--glass-blur",
      "--glass-saturation",
      "--glass-tint",
      "--glass-border",
      "--glass-highlight",
      "--glass-shadow",
      "--glass-refraction",
      "--glass-radius",
    ];
    for (const [libVar, glassVar] of Object.entries(tokenMap)) {
      expect(libVar).toMatch(/^--van-[a-z0-9-]+$/);
      expect(glassVars).toContain(glassVar);
    }
    // Vant 组件底色 fallback 链的源头必须映射（tabbar/nav-bar/popup/dialog 底全靠它）
    expect(tokenMap["--van-background-2"]).toBe("--glass-tint");
  });

  it("tokenMap 别名渲染产物挂在 :where(.lg-surface) 作用域（继承不断链）", async () => {
    const { renderTokenMapCss } = await import("@et4proj/liquid-glass-adapter");
    const css = renderTokenMapCss(vantAdapter.tokenMap ?? {});
    expect(css).toContain(":where(.lg-surface)");
    expect(css).toContain("--van-background-2: var(--glass-tint)");
    expect(css).toContain("--van-primary-color: var(--glass-tint)");
  });
});
