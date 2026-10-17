import { describe, expect, it } from "vitest";
import { applyAdapter, renderTokenMapCss } from "../src";
import { createGlass, createCssBackend, SURFACE_CLASS } from "@et4proj/liquid-glass-web";
import type { Capabilities } from "@et4proj/liquid-glass-core";
import type { GlassAdapterManifest } from "../src";

/**
 * adapter 内核单测（docs/proposals/adapter-system-design.md §6）：
 * detect no-op / tokenMap 别名注入与引用计数 / patches / surfaces 注册与 dispose 全链路。
 */

const caps: Capabilities = {
  platform: "web",
  engine: "blink",
  os: "android",
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  a11y: { reduceTransparency: false, reduceMotion: false, increaseContrast: false },
  device: { tier: "high", dpr: 3 },
};
const probe = { platform: "web" as const, detect: () => caps };
const flush = () => new Promise((r) => setTimeout(r, 0));

const manifest: GlassAdapterManifest = {
  library: "test-lib",
  framework: "react",
  tokenMap: { "--testlib-bar-bg": "--glass-tint" },
  surfaces: [
    { selector: ".testlib-tabbar", declaration: { role: "bar", shape: { kind: "capsule" } } },
    { selector: ".testlib-popup", declaration: { role: "sheet" }, overlay: true },
  ],
  patches: [{ id: "transparent", css: ":where(.testlib-tabbar){background:transparent}" }],
};

describe("applyAdapter", () => {
  it("tokenMap 别名规则 + patches 注入，surfaces 注册生效", async () => {
    const glass = createGlass({ probe, backends: [createCssBackend()] });
    const tabbar = document.createElement("div");
    tabbar.className = "testlib-tabbar";
    document.body.appendChild(tabbar);

    const handle = applyAdapter(glass, manifest);
    await flush();

    // 表面注册（.lg-surface 挂类）
    expect(tabbar.classList.contains(SURFACE_CLASS)).toBe(true);

    // tokenMap 别名样式
    const tokenStyle = document.getElementById("lg-adapter-test-lib-tokens") as HTMLStyleElement;
    expect(tokenStyle).toBeTruthy();
    expect(tokenStyle.textContent).toContain("--testlib-bar-bg: var(--glass-tint)");
    expect(tokenStyle.textContent).toContain(":where(.lg-surface)");

    // patches 样式
    const patchStyle = document.getElementById("lg-adapter-test-lib-patches") as HTMLStyleElement;
    expect(patchStyle?.textContent).toContain("background:transparent");

    // dispose：注销表面 + 引用计数归零移除样式
    handle.dispose();
    await flush();
    expect(tabbar.classList.contains(SURFACE_CLASS)).toBe(false);
    expect(document.getElementById("lg-adapter-test-lib-tokens")).toBeNull();
    expect(document.getElementById("lg-adapter-test-lib-patches")).toBeNull();

    // 库样式前缀（:where 0 特异）不覆盖 .lg-surface 玻璃背景 —— 由 css-backend 单测覆盖，此处验证别名链存在即可
    glass.dispose();
  });

  it("重复 apply 同一 manifest 幂等（style 标签不重复），引用计数下双 runtime 共享", async () => {
    const g1 = createGlass({ probe, backends: [createCssBackend()] });
    const g2 = createGlass({ probe, backends: [createCssBackend()] });
    const h1 = applyAdapter(g1, manifest);
    const h2 = applyAdapter(g2, manifest);
    expect(document.querySelectorAll("style#lg-adapter-test-lib-tokens").length).toBe(1);

    h1.dispose();
    expect(document.getElementById("lg-adapter-test-lib-tokens")).toBeTruthy(); // g2 仍持有
    h2.dispose();
    expect(document.getElementById("lg-adapter-test-lib-tokens")).toBeNull();
    g1.dispose();
    g2.dispose();
  });

  it("detect 返回 false 时 no-op（不注入不注册）", async () => {
    const glass = createGlass({ probe, backends: [createCssBackend()] });
    const tabbar = document.createElement("div");
    tabbar.className = "testlib2-tabbar";
    document.body.appendChild(tabbar);

    // 用独立 library 名隔离用例（避免其他用例异常中断时残留的注入）
    const handle = applyAdapter(glass, {
      ...manifest,
      library: "test-lib-absent",
      detect: () => false,
      tokenMap: { "--x": "--glass-tint" },
    });
    await flush();
    expect(tabbar.classList.contains(SURFACE_CLASS)).toBe(false);
    expect(document.getElementById("lg-adapter-test-lib-absent-tokens")).toBeNull();
    expect(() => handle.dispose()).not.toThrow();

    tabbar.remove();
    glass.dispose();
  });

  it("renderTokenMapCss 生成 :where(.lg-surface) 作用域的别名规则", () => {
    const css = renderTokenMapCss({ "--a": "--glass-tint", "--b": "--glass-blur" });
    expect(css).toContain(":where(.lg-surface)");
    expect(css).toContain("--a: var(--glass-tint);");
    expect(css).toContain("--b: var(--glass-blur);");
  });
});
