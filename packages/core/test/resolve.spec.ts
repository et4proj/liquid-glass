import { describe, expect, it } from "vitest";
import { defineConfig } from "../src/config";
import type { GlassConfig } from "../src/config";
import { resolve } from "../src/resolve";
import { registerStyle } from "../src/tokens";
import type { StylePack } from "../src/tokens";
import type { Capabilities, SurfaceDeclaration } from "../src/types";

/** 测试风格：数值与旧 ios26 基线一致（regular blur 16 / subtle 8 / strong 24） */
const testStyle: StylePack = {
  id: "test",
  label: "Test（单测夹具）",
  solid: { tint: "rgba(255,255,255,0.9)", border: "rgba(255,255,255,0.5)" },
  channels: {
    material: {
      stops: {
        subtle: { blur: 8, saturation: 1.2, highlight: 0.3 },
        regular: { blur: 16, saturation: 1.4, highlight: 0.6 },
        strong: { blur: 24, saturation: 1.6, highlight: 0.9 },
      },
      static: {
        regular: {
          tint: "rgba(255,255,255,0.18)",
          border: "rgba(255,255,255,0.35)",
          shadow: "0 8px 24px rgba(0,0,0,0.12)",
          radius: 24,
        },
        clear: {
          tint: "rgba(255,255,255,0.06)",
          border: "rgba(255,255,255,0.25)",
          shadow: "0 8px 24px rgba(0,0,0,0.08)",
          radius: 24,
        },
        tinted: {
          tint: "rgba(255,255,255,0.30)",
          border: "rgba(255,255,255,0.45)",
          shadow: "0 8px 24px rgba(0,0,0,0.16)",
          radius: 24,
        },
      },
    },
    refraction: {
      stops: { subtle: { strength: 0.2 }, regular: { strength: 0.5 }, strong: { strength: 0.8 } },
      static: { ior: 1.5, bezelWidth: 0.18 },
    },
  },
};

registerStyle(testStyle);

const makeCaps = (overrides: Partial<Capabilities> = {}): Capabilities => ({
  platform: "web",
  engine: "blink",
  os: "android",
  osVersion: "14",
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  device: { tier: "high", dpr: 3 },
  ...overrides,
  a11y: {
    reduceTransparency: false,
    reduceMotion: false,
    increaseContrast: false,
    ...overrides.a11y,
  },
});

const cfg = (partial: Partial<GlassConfig> = {}): GlassConfig =>
  defineConfig({ style: "test", ...partial });
const surface = (partial: Partial<SurfaceDeclaration> = {}): SurfaceDeclaration => ({
  role: "bar",
  ...partial,
});

describe("resolve 优先级链", () => {
  it("默认解析为 css 档，reasons 为 ok", () => {
    const plan = resolve({ config: cfg(), caps: makeCaps(), surface: surface() });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toEqual(["ok"]);
    expect(plan.interactive).toBe(true);
  });

  it("降低透明度时强制 solid，即使全局上限为 native 且平台支持", () => {
    const plan = resolve({
      config: cfg({ maxTier: "native" }),
      caps: makeCaps({
        nativeGlass: true,
        a11y: { reduceTransparency: true, reduceMotion: false, increaseContrast: false },
      }),
      surface: surface(),
    });
    expect(plan.tier).toBe("solid");
    expect(plan.reasons).toContain("a11y:reduce-transparency");
    expect(plan.tokens.material.blur).toBe(0);
  });

  it("增强对比度时强制 solid", () => {
    const plan = resolve({
      config: cfg(),
      caps: makeCaps({
        a11y: { reduceTransparency: false, reduceMotion: false, increaseContrast: true },
      }),
      surface: surface(),
    });
    expect(plan.tier).toBe("solid");
    expect(plan.reasons).toContain("a11y:increase-contrast");
  });

  it("规则 disable 命中时输出 none", () => {
    const rules = [{ when: { engine: "webkit" as const }, then: { disable: true } }];
    const plan = resolve({
      config: cfg({ rules }),
      caps: makeCaps({ engine: "webkit" }),
      surface: surface(),
    });
    expect(plan.tier).toBe("none");
    expect(plan.reasons).toContain("rule:disabled");
  });

  it("规则未命中时不生效", () => {
    const rules = [{ when: { engine: "webkit" as const }, then: { disable: true } }];
    const plan = resolve({
      config: cfg({ rules }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(plan.tier).toBe("css");
  });

  it("规则按 os + osVersion 匹配并压低档位", () => {
    const rules = [
      { when: { os: "ios" as const, osVersion: "^18" }, then: { maxTier: "css" as const } },
    ];
    const plan = resolve({
      config: cfg({ maxTier: "svg", rules }),
      caps: makeCaps({ os: "ios", osVersion: "18.2" }),
      surface: surface(),
    });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toContain("rule:max-tier");
  });

  it("规则按小程序基础库版本匹配", () => {
    const rules = [
      {
        when: { platform: "miniprogram" as const, sdkVersion: ">=2.10.0" },
        then: { maxTier: "css" as const },
      },
    ];
    const plan = resolve({
      config: cfg({ maxTier: "svg", rules }),
      caps: makeCaps({ platform: "miniprogram", mp: { sdkVersion: "2.12.1" } }),
      surface: surface(),
    });
    expect(plan.tier).toBe("css");
  });

  it("表面 maxTier 压低全局上限", () => {
    const plan = resolve({
      config: cfg({ maxTier: "webgl" }),
      caps: makeCaps(),
      surface: surface({ maxTier: "css" }),
    });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toContain("surface:max-tier");
  });

  it("表面 maxTier 高于全局时不抬升、不记录原因", () => {
    const plan = resolve({
      config: cfg({ maxTier: "css" }),
      caps: makeCaps(),
      surface: surface({ maxTier: "webgl" }),
    });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toEqual(["ok"]);
  });

  it("角色覆盖 maxTier 生效", () => {
    const plan = resolve({
      config: cfg({ maxTier: "svg", roles: { bar: { maxTier: "css" } } }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toContain("role:max-tier");
  });
});

describe("resolve 能力门控降级", () => {
  it("backdropFilter 不支持时 css 降为 solid", () => {
    const plan = resolve({
      config: cfg(),
      caps: makeCaps({ backdropFilter: false }),
      surface: surface(),
    });
    expect(plan.tier).toBe("solid");
    expect(plan.reasons).toContain("cap:backdrop-filter");
  });

  it("backdropFilterWithSvg 不支持时 svg 降为 css", () => {
    const plan = resolve({
      config: cfg({ maxTier: "svg" }),
      caps: makeCaps({ backdropFilterWithSvg: false }),
      surface: surface(),
    });
    expect(plan.tier).toBe("css");
    expect(plan.reasons).toContain("cap:backdrop-filter-svg");
  });

  it("webgl2 不支持时 webgl 降为 svg", () => {
    const plan = resolve({
      config: cfg({ maxTier: "webgl" }),
      caps: makeCaps({ webgl2: false }),
      surface: surface(),
    });
    expect(plan.tier).toBe("svg");
    expect(plan.reasons).toContain("cap:webgl2");
  });

  it("native 档需要 nativeGlass 能力", () => {
    const plan = resolve({
      config: cfg({ maxTier: "native" }),
      caps: makeCaps({ nativeGlass: false }),
      surface: surface(),
    });
    expect(plan.tier).toBe("webgl");
    expect(plan.reasons).toContain("cap:native-glass");
  });
});

describe("resolve 预算与交互", () => {
  it("同屏超预算时降一档并记录原因", () => {
    const plan = resolve({
      config: cfg({ budget: { maxSurfaces: 2, dprCap: 2, fpsCap: 60, degradeOnScroll: true } }),
      caps: makeCaps(),
      surface: surface(),
      budget: { activeSurfaces: 3 },
    });
    expect(plan.tier).toBe("solid");
    expect(plan.reasons).toContain("budget:max-surfaces");
  });

  it("恰好达到上限不降档（maxSurfaces 个可同时全效）", () => {
    const plan = resolve({
      config: cfg({ budget: { maxSurfaces: 2, dprCap: 2, fpsCap: 60, degradeOnScroll: true } }),
      caps: makeCaps(),
      surface: surface(),
      budget: { activeSurfaces: 2 },
    });
    expect(plan.tier).toBe("css");
  });

  it("预算未超时不降档", () => {
    const plan = resolve({
      config: cfg({ budget: { maxSurfaces: 2, dprCap: 2, fpsCap: 60, degradeOnScroll: true } }),
      caps: makeCaps(),
      surface: surface(),
      budget: { activeSurfaces: 1 },
    });
    expect(plan.tier).toBe("css");
  });

  it("reduceMotion 时关闭交互效果", () => {
    const plan = resolve({
      config: cfg(),
      caps: makeCaps({
        a11y: { reduceTransparency: false, reduceMotion: true, increaseContrast: false },
      }),
      surface: surface({ interactive: true }),
    });
    expect(plan.interactive).toBe(false);
    expect(plan.reasons).toContain("a11y:reduce-motion");
  });

  it("表面 interactive 显式 false 优先于全局 true", () => {
    const plan = resolve({
      config: cfg(),
      caps: makeCaps(),
      surface: surface({ interactive: false }),
    });
    expect(plan.interactive).toBe(false);
  });
});

describe("resolve 强度与 token（v2 通道化）", () => {
  it("语义强度档映射到对应物理参数（注册风格）", () => {
    const subtle = resolve({
      config: cfg({ intensity: "subtle" }),
      caps: makeCaps(),
      surface: surface(),
    });
    const regular = resolve({ config: cfg(), caps: makeCaps(), surface: surface() });
    const strong = resolve({
      config: cfg({ intensity: "strong" }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(subtle.tokens.material.blur).toBe(8);
    expect(regular.tokens.material.blur).toBe(16);
    expect(strong.tokens.material.blur).toBe(24);
    expect(regular.tokens.material.saturation).toBeCloseTo(1.4);
    expect(strong.tokens.refraction!.strength).toBeCloseTo(0.8);
  });

  it("数值强度在 subtle..strong 间线性插值", () => {
    const mid = resolve({
      config: cfg({ intensity: 0.5 }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(mid.tokens.material.blur).toBe(16);
  });

  it("规则强度优先于表面强度", () => {
    const plan = resolve({
      config: cfg({ rules: [{ when: {}, then: { intensity: 0 } }] }),
      caps: makeCaps(),
      surface: surface({ intensity: 1 }),
    });
    expect(plan.tokens.material.blur).toBe(8);
  });

  it("角色强度覆盖全局", () => {
    const plan = resolve({
      config: cfg({ roles: { bar: { intensity: 1 } } }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(plan.tokens.material.blur).toBe(24);
  });

  it("表面 tint 与 advanced 通道级逐字段覆盖", () => {
    const plan = resolve({
      config: cfg({ advanced: { material: { blur: 33 }, refraction: { strength: 0.5 } } }),
      caps: makeCaps(),
      surface: surface({ tint: "rgba(0,0,0,0.2)" }),
    });
    expect(plan.tokens.material.tint).toBe("rgba(0,0,0,0.2)");
    expect(plan.tokens.material.blur).toBe(33);
    expect(plan.tokens.material.radius).toBe(24); // 未覆盖字段保持风格包值
    expect(plan.tokens.refraction!.strength).toBe(0.5);
  });

  it("none 档输出透明 token，solid 档输出不透明 token", () => {
    const none = resolve({
      config: cfg({ rules: [{ when: {}, then: { disable: true } }] }),
      caps: makeCaps(),
      surface: surface(),
    });
    expect(none.tokens.material.tint).toBe("transparent");
    expect(none.tokens.material.shadow).toBe("none");

    const solid = resolve({
      config: cfg(),
      caps: makeCaps({ backdropFilter: false }),
      surface: surface(),
    });
    expect(solid.tokens.material.blur).toBe(0);
    expect(solid.tokens.refraction!.strength).toBe(0);
    expect(solid.tokens.material.tint).toBe("rgba(255,255,255,0.9)");
  });

  it("表面材质预设优先于全局材质", () => {
    const plan = resolve({
      config: cfg({ material: "regular" }),
      caps: makeCaps(),
      surface: surface({ material: "clear" }),
    });
    expect(plan.tokens.material.tint).toBe("rgba(255,255,255,0.06)");
  });

  it("config.style 贯穿 token 生成（重复注册覆盖即生效）", () => {
    registerStyle({
      ...testStyle,
      channels: {
        ...testStyle.channels,
        material: {
          ...testStyle.channels.material,
          stops: {
            ...testStyle.channels.material.stops,
            strong: { blur: 40, saturation: 1.6, highlight: 0.9 },
          },
        },
      },
    });
    try {
      const plan = resolve({
        config: cfg({ style: "test", intensity: "strong" }),
        caps: makeCaps(),
        surface: surface(),
      });
      expect(plan.tokens.material.blur).toBe(40);
    } finally {
      registerStyle(testStyle); // 还原
    }
  });

  it("未注册风格回退 basic（D1：默认 ios27 未注册时框架仍可用）", () => {
    const plan = resolve({
      config: defineConfig({ intensity: "regular" }), // style 默认 ios27，未注册
      caps: makeCaps(),
      surface: surface(),
    });
    expect(plan.tokens.material.blur).toBe(8); // basic regular
    expect(plan.tokens.material.tint).toBe("rgba(255,255,255,0.16)");
  });
});
