import { describe, expect, it } from "vitest";
import { createSvgBackend, displacementCurve, refractionToScale } from "../src/svg-backend";
import { SURFACE_CLASS } from "../src/css-backend";
import { defineConfig, registerStyle, resolve } from "@et4proj/liquid-glass-core";
import type { Capabilities, GlassConfig, SurfaceHandle } from "@et4proj/liquid-glass-core";
import { ios27 } from "@et4proj/liquid-glass-style-ios27";

// 默认 config.style = 'ios27'，须注册风格包（refraction 通道：strength/ior/bezelWidth）
registerStyle(ios27);

const caps: Capabilities = {
  platform: "web",
  engine: "blink",
  os: "desktop",
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  a11y: { reduceTransparency: false, reduceMotion: false, increaseContrast: false },
  device: { tier: "high", dpr: 2 },
};

const makeSurface = (id = "s1"): SurfaceHandle<HTMLElement> => ({
  id,
  target: document.createElement("div"),
  declaration: { role: "card" },
});

const planWith = (intensity: "subtle" | "regular" | "strong") => {
  const config: GlassConfig = defineConfig({ intensity });
  return resolve({ config, caps, surface: { role: "card" } });
};

const filterEl = (id: string): Element | null => document.getElementById(id);

describe("displacementCurve（Snell + squircle，规格 §3.1）", () => {
  it("边缘最强、bezel 内界归零、单调衰减", () => {
    expect(displacementCurve(0)).toBe(0); // 边界定义
    expect(displacementCurve(1)).toBe(0); // bezel 内界：平面无折射
    const near = displacementCurve(0.05);
    const mid = displacementCurve(0.5);
    expect(near).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(mid); // 越靠边缘越强
  });

  it("IOR>1 时位移恒为正（凸透镜向心弯折）", () => {
    for (let i = 1; i < 20; i++) expect(displacementCurve(i / 20)).toBeGreaterThanOrEqual(0);
  });
});

describe("refractionToScale（短边自适应，规格 §5）", () => {
  it("尺寸不可得回退 48px 小件基准", () => {
    // 48 × 0.28 = 13.44 → clamp(13.44) ；ios27 regular refraction 0.7 → 9
    expect(refractionToScale(0.7, 0, 0)).toBe(9);
    expect(refractionToScale(1.0, 0, 0)).toBe(13);
  });

  it("大件有上限、小件有下限", () => {
    expect(refractionToScale(1.0, 1000, 300)).toBe(42); // 上限 42
    expect(refractionToScale(1.0, 20, 20)).toBe(8); // 20×0.28=5.6 → 下限 8
    // 短边为准：宽 300 高 48 与 48×48 同值
    expect(refractionToScale(1.0, 300, 48)).toBe(refractionToScale(1.0, 48, 48));
  });
});

describe("svgBackend", () => {
  it("supports 需要 backdropFilter + backdropFilterWithSvg 双能力", () => {
    const backend = createSvgBackend();
    const surface = makeSurface();
    expect(backend.supports(caps, surface)).toBe(true);
    expect(backend.supports({ ...caps, backdropFilterWithSvg: false }, surface)).toBe(false);
    expect(backend.supports({ ...caps, backdropFilter: false }, surface)).toBe(false);
  });

  it("mount 注入滤镜 defs 并串联 backdrop-filter 链", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t1");
    const inst = backend.mount(surface, planWith("strong"));
    const el = surface.target;
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    // happy-dom 无 canvas 2d → 回退渐变贴图；scale = refraction(1.0) × clamp(48×0.28) = 13
    const filter = filterEl("lg-refraction-svg-t1")!;
    expect(filter).not.toBeNull();
    expect(filter.querySelector("feDisplacementMap")!.getAttribute("scale")).toBe("13");
    expect(filter.querySelector("feImage")!.getAttribute("href")).toContain("data:image/");
    expect(el.style.getPropertyValue("backdrop-filter")).toContain("url(#lg-refraction-svg-t1)");
    expect(el.style.getPropertyValue("backdrop-filter")).toContain("blur(var(--glass-blur))");
    inst.unmount();
  });

  it("update 变更强度时按新 scale 重建滤镜", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t2");
    const inst = backend.mount(surface, planWith("strong")); // scale 13
    inst.update(planWith("subtle")); // refraction 0.35 → 0.35×13.44 ≈ 4.7 → 5
    expect(
      filterEl("lg-refraction-svg-t2")!.querySelector("feDisplacementMap")!.getAttribute("scale"),
    ).toBe("5");
    inst.unmount();
  });

  it("pause 显式置 none（内联优先级高于类规则），resume 恢复", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t3");
    const inst = backend.mount(surface, planWith("regular"));
    inst.pause();
    expect(surface.target.style.getPropertyValue("backdrop-filter")).toBe("none");
    inst.resume();
    expect(surface.target.style.getPropertyValue("backdrop-filter")).toContain(
      "url(#lg-refraction-svg-t3)",
    );
    inst.unmount();
  });

  it("unmount 清理内联滤镜与滤镜节点（幂等）", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t4");
    const inst = backend.mount(surface, planWith("regular"));
    inst.unmount();
    inst.unmount();
    expect(surface.target.style.getPropertyValue("backdrop-filter")).toBe("");
    expect(filterEl("lg-refraction-svg-t4")).toBeNull();
  });

  it("interactive plan 挂 lg-interactive class", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t5");
    const config = defineConfig({ intensity: "regular" });
    const plan = resolve({ config, caps, surface: { role: "control", interactive: true } });
    const inst = backend.mount(surface, plan);
    expect(surface.target.classList.contains("lg-interactive")).toBe(true);
    inst.unmount();
  });

  it("refraction 通道 ior/bezelWidth 变化触发滤镜重建（token v2）", () => {
    const backend = createSvgBackend();
    const surface = makeSurface("svg-t6");
    const inst = backend.mount(surface, planWith("strong"));
    const href1 = filterEl("lg-refraction-svg-t6")!.querySelector("feImage")!.getAttribute("href");
    inst.update(
      resolve({
        config: defineConfig({
          intensity: "strong",
          advanced: { refraction: { bezelWidth: 0.25 } },
        }),
        caps,
        surface: { role: "card" },
      }),
    );
    const href2 = filterEl("lg-refraction-svg-t6")!.querySelector("feImage")!.getAttribute("href");
    expect(href2).not.toBe(href1); // bezelWidth 0.18 → 0.25：贴图按 (ior, bezel) 重新生成
    inst.unmount();
  });
});
