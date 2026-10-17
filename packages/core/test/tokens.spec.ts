import { describe, expect, it } from "vitest";
import {
  BASIC_STYLE,
  buildTokens,
  defaultInterpolate,
  listStyles,
  normalizeIntensity,
  noneTokens,
  registerStyle,
  resolveStyle,
  solidTokens,
} from "../src/tokens";
import type { StylePack } from "../src/tokens";

/** 测试风格：数值与旧 ios26 基线一致，便于沿用既有断言直觉 */
const testStyle: StylePack = {
  id: "test",
  label: "Test（单测夹具）",
  solid: {
    tint: "rgba(255,255,255,0.9)",
    border: "rgba(255,255,255,0.5)",
    shadow: "0 1px 2px rgba(0,0,0,0.2)",
  },
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
    motion: {
      static: { attraction: 0.4, maxStretch: 0.35 },
    },
  },
};

registerStyle(testStyle);

describe("normalizeIntensity", () => {
  it("语义档归一化为 0 / 0.5 / 1", () => {
    expect(normalizeIntensity("subtle")).toBe(0);
    expect(normalizeIntensity("regular")).toBe(0.5);
    expect(normalizeIntensity("strong")).toBe(1);
  });

  it("数值强度夹取到 0..1", () => {
    expect(normalizeIntensity(-1)).toBe(0);
    expect(normalizeIntensity(2)).toBe(1);
  });
});

describe("defaultInterpolate", () => {
  it("数值线性插值；非数值取就近锚点；单侧缺失取存在的一侧", () => {
    const out = defaultInterpolate({ blur: 8, tint: "a" }, { blur: 24, tint: "c" }, 0.5);
    expect(out.blur).toBe(16);
    expect(out.tint).toBe("c"); // t ≥ 0.5 取 hi
    expect(defaultInterpolate({ tint: "a" }, {}, 0).tint).toBe("a");
    expect(defaultInterpolate({}, { tint: "c" }, 0).tint).toBe("c");
  });
});

describe("风格注册表", () => {
  it("registerStyle 后 resolveStyle 命中，listStyles 含注册项与 basic", () => {
    expect(resolveStyle("test")).not.toBe(BASIC_STYLE);
    expect(resolveStyle("test").label).toBe("Test（单测夹具）");
    expect(listStyles()).toContain("test");
    expect(listStyles()).toContain("basic");
  });

  it("重复注册 = 覆盖（dev 热替换语义）", () => {
    const overridden: StylePack = { ...testStyle, label: "Test v2" };
    registerStyle(overridden);
    expect(resolveStyle("test").label).toBe("Test v2");
    registerStyle(testStyle); // 还原
    expect(resolveStyle("test").label).toBe("Test（单测夹具）");
  });

  it("未注册 / 未指定回退内置 basic（D1 安全网）", () => {
    expect(resolveStyle("ios99")).toBe(BASIC_STYLE);
    expect(resolveStyle(undefined)).toBe(BASIC_STYLE);
    expect(resolveStyle("basic")).toBe(BASIC_STYLE);
  });

  it("base 链深合并：子风格只声明差异字段，其余继承基准", () => {
    registerStyle({
      id: "test-child",
      label: "Test Child",
      base: "test",
      channels: {
        material: { stops: { strong: { blur: 40 } } },
      },
    });
    const pack = resolveStyle("test-child");
    // 子覆盖：strong blur 40
    const strong = buildTokens({ material: "regular", intensity: "strong", style: "test-child" });
    expect(strong.material.blur).toBe(40);
    // 继承：regular 仍是 base 的 16；solid 继承 base；refraction 通道整体继承
    const regular = buildTokens({ material: "regular", intensity: "regular", style: "test-child" });
    expect(regular.material.blur).toBe(16);
    expect(pack.solid).toBe(testStyle.solid);
    expect(regular.refraction!.strength).toBe(0.5);
    expect(regular.refraction!.ior).toBe(1.5);
  });
});

describe("buildTokens（通道化）", () => {
  it("语义档精确命中锚点值", () => {
    const cases = [
      ["subtle", 8, 1.2, 0.3],
      ["regular", 16, 1.4, 0.6],
      ["strong", 24, 1.6, 0.9],
    ] as const;
    for (const [key, blur, saturation, highlight] of cases) {
      const tokens = buildTokens({ material: "regular", intensity: key, style: "test" });
      expect(tokens.material.blur).toBe(blur);
      expect(tokens.material.saturation).toBe(saturation);
      expect(tokens.material.highlight).toBe(highlight);
    }
  });

  it("数值强度在锚点间分段线性插值", () => {
    const quarter = buildTokens({ material: "regular", intensity: 0.25, style: "test" });
    expect(quarter.material.blur).toBe(12); // subtle→regular 的中点
  });

  it("材质预设只影响 tint/border/shadow/radius", () => {
    const regular = buildTokens({ material: "regular", intensity: "regular", style: "test" });
    const clear = buildTokens({ material: "clear", intensity: "regular", style: "test" });
    expect(clear.material.blur).toBe(regular.material.blur);
    expect(clear.material.highlight).toBe(regular.material.highlight);
    expect(clear.material.tint).not.toBe(regular.material.tint);
  });

  it("refraction 通道：strength 插值并投影到 material.refraction（形状冻结桥接）", () => {
    const strong = buildTokens({ material: "regular", intensity: "strong", style: "test" });
    expect(strong.refraction!.strength).toBe(0.8);
    expect(strong.material.refraction).toBe(strong.refraction!.strength);
    // static 字段原样透传
    expect(strong.refraction!.ior).toBe(1.5);
    expect(strong.refraction!.bezelWidth).toBe(0.18);
  });

  it("motion 通道透传（无 stops 时纯 static）", () => {
    const tokens = buildTokens({ material: "regular", intensity: "regular", style: "test" });
    expect(tokens.motion).toEqual({ attraction: 0.4, maxStretch: 0.35 });
  });

  it("stops 派生值覆盖 static 同名字段", () => {
    registerStyle({
      id: "test-override",
      label: "Override",
      channels: {
        material: { stops: { regular: { blur: 16 } }, static: { regular: { radius: 24 } } },
        refraction: { stops: { strong: { strength: 0.8 } }, static: { strength: 0.9, ior: 1.5 } },
      },
    });
    const strong = buildTokens({
      material: "regular",
      intensity: "strong",
      style: "test-override",
    });
    expect(strong.refraction!.strength).toBe(0.8); // 命中锚点：stops 覆盖 static
    expect(strong.refraction!.ior).toBe(1.5); // 非 stops 字段：static 兜底
    // 单侧缺失取存在的一侧：strength 声明于 strong，regular 段沿用该值
    const regular = buildTokens({
      material: "regular",
      intensity: "regular",
      style: "test-override",
    });
    expect(regular.refraction!.strength).toBe(0.8);
  });

  it("x- 自定义通道透传并做默认插值", () => {
    registerStyle({
      id: "test-x",
      label: "X",
      channels: {
        material: { stops: { regular: { blur: 10 } } },
        "x-glow": {
          stops: { subtle: { glow: 0.1 }, strong: { glow: 0.9 } },
          static: { color: "cyan" },
        },
      },
    });
    const tokens = buildTokens({ material: "regular", intensity: "strong", style: "test-x" });
    expect(tokens["x-glow"]).toEqual({ glow: 0.9, color: "cyan" });
  });

  it("无 refraction 通道的风格：refraction 强度为 0", () => {
    registerStyle({
      id: "test-flat",
      label: "Flat",
      channels: { material: { stops: { regular: { blur: 10 } } } },
    });
    const tokens = buildTokens({ material: "regular", intensity: "regular", style: "test-flat" });
    expect(tokens.refraction!.strength).toBe(0);
    expect(tokens.material.refraction).toBe(0);
  });

  it("style 缺省与未注册风格都走 basic", () => {
    const tokens = buildTokens({ material: "regular", intensity: "regular" });
    expect(tokens.material.blur).toBe(8);
    expect(tokens.material.tint).toBe("rgba(255,255,255,0.16)");
    expect(buildTokens({ material: "regular", intensity: "regular", style: "nope" })).toEqual(
      tokens,
    );
  });
});

describe("solidTokens / noneTokens", () => {
  it("solid：无模糊、无折射、无高光，外观来自风格包 solid 数据", () => {
    const tokens = solidTokens("regular", "test");
    expect(tokens.material.blur).toBe(0);
    expect(tokens.material.refraction).toBe(0);
    expect(tokens.material.highlight).toBe(0);
    expect(tokens.refraction!.strength).toBe(0);
    expect(tokens.material.tint).toBe("rgba(255,255,255,0.9)");
    expect(tokens.material.shadow).toBe("0 1px 2px rgba(0,0,0,0.2)");
    expect(tokens.material.radius).toBe(24); // 沿用 material 基础外观
  });

  it("solid（basic）：solid 数据缺 shadow 时沿用 material 基础外观", () => {
    const tokens = solidTokens("regular", "basic");
    expect(tokens.material.shadow).toBe(BASIC_STYLE.channels.material.static!.regular!.shadow);
  });

  it("none：完全透明形态", () => {
    const tokens = noneTokens();
    expect(tokens.material.tint).toBe("transparent");
    expect(tokens.material.shadow).toBe("none");
    expect(tokens.refraction!.strength).toBe(0);
  });
});
