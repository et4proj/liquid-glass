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
});
