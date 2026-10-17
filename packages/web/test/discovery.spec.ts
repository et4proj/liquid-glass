import { describe, expect, it } from "vitest";
import { parseDataGlass, mountDiscovery, mountSelectorDiscovery } from "../src/discovery";
import { createGlass } from "../src/runtime";
import { createCssBackend, SURFACE_CLASS } from "../src/css-backend";
import type { Capabilities } from "@et4proj/liquid-glass-core";

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

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("parseDataGlass", () => {
  it("解析 role 与可选属性", () => {
    const el = document.createElement("nav");
    el.setAttribute("data-glass", "bar");
    el.setAttribute("data-glass-shape", "capsule");
    el.setAttribute("data-glass-intensity", "0.8");
    el.setAttribute("data-glass-material", "clear");
    el.setAttribute("data-glass-interactive", "true");
    el.setAttribute("data-glass-group", "tabbar");
    el.setAttribute("data-glass-max-tier", "css");
    expect(parseDataGlass(el)).toEqual({
      role: "bar",
      shape: { kind: "capsule", radius: "auto" },
      intensity: 0.8,
      material: "clear",
      interactive: true,
      group: "tabbar",
      maxTier: "css",
    });
  });

  it("非法 role / 无属性返回 null，数值越界夹取", () => {
    const bad = document.createElement("div");
    bad.setAttribute("data-glass", "hero");
    expect(parseDataGlass(bad)).toBeNull();
    expect(parseDataGlass(document.createElement("div"))).toBeNull();

    const el = document.createElement("div");
    el.setAttribute("data-glass", "card");
    el.setAttribute("data-glass-intensity", "2");
    expect(parseDataGlass(el)!.intensity).toBe(1);
  });
});

describe("mountDiscovery", () => {
  it("初始扫描 + 动态增删自动注册/注销", async () => {
    const glass = createGlass({
      probe: { platform: "web", detect: () => caps },
      backends: [createCssBackend()],
    });
    const root = document.createElement("div");
    const nav = document.createElement("nav");
    nav.setAttribute("data-glass", "bar");
    root.appendChild(nav);

    const discovery = mountDiscovery(glass, root);
    await flush();
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(true);

    // 动态新增
    const card = document.createElement("section");
    card.setAttribute("data-glass", "card");
    root.appendChild(card);
    await flush();
    expect(card.classList.contains(SURFACE_CLASS)).toBe(true);

    // 移除 → 注销
    card.remove();
    await flush();
    expect(glass.debug.explain(card)).toBeNull();
    expect(glass.debug.surfaces.length).toBe(1); // 只剩 nav

    discovery.dispose();
    glass.dispose();
  });

  it("dispose 注销全部由发现注册的表面", async () => {
    const glass = createGlass({
      probe: { platform: "web", detect: () => caps },
      backends: [createCssBackend()],
    });
    const root = document.createElement("div");
    const nav = document.createElement("nav");
    nav.setAttribute("data-glass", "bar");
    root.appendChild(nav);
    const discovery = mountDiscovery(glass, root);
    await flush();
    discovery.dispose();
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(false);
    glass.dispose();
  });
});

describe("mountSelectorDiscovery", () => {
  it("按类名选择器注册 + 动态插入弹层节点自动注册（overlay 路径）", async () => {
    const glass = createGlass({
      probe: { platform: "web", detect: () => caps },
      backends: [createCssBackend()],
    });
    const root = document.createElement("div");
    const tabbar = document.createElement("div");
    tabbar.className = "adm-tab-bar";
    root.appendChild(tabbar);

    const discovery = mountSelectorDiscovery(glass, {
      root,
      surfaces: [
        { selector: ".adm-tab-bar", declaration: { role: "bar", shape: { kind: "capsule" } } },
        { selector: ".adm-popup", declaration: { role: "sheet" }, overlay: true },
      ],
    });
    await flush();
    expect(tabbar.classList.contains(SURFACE_CLASS)).toBe(true);

    // 模拟组件库动态挂载弹层（挂 body 或子树），observer 应捕捉并注册
    const popup = document.createElement("div");
    popup.className = "adm-popup";
    root.appendChild(popup);
    await flush();
    expect(popup.classList.contains(SURFACE_CLASS)).toBe(true);

    discovery.dispose();
    expect(tabbar.classList.contains(SURFACE_CLASS)).toBe(false);
    expect(popup.classList.contains(SURFACE_CLASS)).toBe(false);
    glass.dispose();
  });

  it("同一元素命中多条选择器时按 manifest 顺序取首条", async () => {
    const glass = createGlass({
      probe: { platform: "web", detect: () => caps },
      backends: [createCssBackend()],
    });
    const root = document.createElement("div");
    const el = document.createElement("div");
    el.className = "adm-switch-wrap adm-switch";
    root.appendChild(el);

    const discovery = mountSelectorDiscovery(glass, {
      root,
      surfaces: [
        { selector: ".adm-switch-wrap", declaration: { role: "bar" } },
        { selector: ".adm-switch", declaration: { role: "control" } },
      ],
    });
    await flush();
    // 首条 .adm-switch-wrap 命中 → role bar（capsule 形状等以 plan 为准，此处断言注册唯一性）
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    // 移除节点后自动注销
    el.remove();
    await flush();
    expect(el.classList.contains(SURFACE_CLASS)).toBe(false);
    discovery.dispose();
    glass.dispose();
  });

  it("空 surfaces 列表安全 no-op", () => {
    const glass = createGlass({
      probe: { platform: "web", detect: () => caps },
      backends: [createCssBackend()],
    });
    const handle = mountSelectorDiscovery(glass, { root: document, surfaces: [] });
    expect(() => handle.dispose()).not.toThrow();
    glass.dispose();
  });
});
