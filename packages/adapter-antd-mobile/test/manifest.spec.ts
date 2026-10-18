import { describe, expect, it } from "vitest";
import { antdMobileAdapter } from "../src";

/** manifest 结构单测：JSON-safe / 选择器合法 / 补丁合法（内核行为由 @et4proj/liquid-glass-adapter 覆盖） */

describe("antdMobileAdapter manifest", () => {
  it("JSON-safe（可序列化远程下发）", () => {
    const round = JSON.parse(JSON.stringify(antdMobileAdapter));
    expect(round.library).toBe("antd-mobile");
    expect(round.framework).toBe("react");
  });

  it("surfaces 选择器全部非空且唯一", () => {
    const selectors = antdMobileAdapter.surfaces.map((s) => s.selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect(new Set(selectors).size).toBe(selectors.length);
    for (const s of selectors) {
      expect(s).toMatch(/^\.[a-z0-9-]+$/i);
    }
  });

  it("弹层类表面带 overlay 标记", () => {
    const overlays = antdMobileAdapter.surfaces.filter((s) => s.overlay);
    expect(overlays.map((s) => s.selector)).toContain(".adm-popup");
  });

  it("patches 用 :where() 控制特异性（不压 .lg-surface 玻璃样式）", () => {
    for (const p of antdMobileAdapter.patches ?? []) {
      expect(p.css).toMatch(/:where\(/);
    }
  });

  it("tokenMap：库变量名 --adm-* 前缀、别名指向合法 --glass-* 变量（不瞎编）", () => {
    const tokenMap = antdMobileAdapter.tokenMap ?? {};
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
      expect(libVar).toMatch(/^--adm-[a-z0-9-]+$/);
      expect(glassVars).toContain(glassVar);
    }
  });

  it("tokenMap 别名渲染产物挂在 :where(.lg-surface) 作用域（继承不断链）", async () => {
    const { renderTokenMapCss } = await import("@et4proj/liquid-glass-adapter");
    const css = renderTokenMapCss(antdMobileAdapter.tokenMap ?? {});
    expect(css).toContain(":where(.lg-surface)");
    expect(css).toContain("--adm-color-background: var(--glass-tint)");
    expect(css).toContain("--adm-color-primary: var(--glass-tint)");
  });
});
