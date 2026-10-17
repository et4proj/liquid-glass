import { describe, expect, it } from "vitest";
import { defineConfig, matchesVersion } from "../src/config";

describe("defineConfig", () => {
  it("空入参返回默认配置", () => {
    const config = defineConfig();
    expect(config.maxTier).toBe("css");
    expect(config.intensity).toBe("regular");
    expect(config.budget.maxSurfaces).toBe(8);
  });

  it("budget / motion 浅层字段逐项合并", () => {
    const config = defineConfig({ budget: { maxSurfaces: 2 } });
    expect(config.budget.maxSurfaces).toBe(2);
    expect(config.budget.fpsCap).toBe(60);
    expect(config.motion.interactive).toBe(true);
  });

  it("风格版本默认 ios27（主要方向），可显式指定", () => {
    expect(defineConfig().style).toBe("ios27");
    expect(defineConfig({ style: "ios27" }).style).toBe("ios27");
  });
});

describe("matchesVersion", () => {
  it("通配符匹配任意版本", () => {
    expect(matchesVersion("*", "1.2.3")).toBe(true);
  });

  it("版本缺失时不匹配（除通配符）", () => {
    expect(matchesVersion("^18", undefined)).toBe(false);
  });

  it("脱字号 ^ 匹配同主版本", () => {
    expect(matchesVersion("^18", "18.2")).toBe(true);
    expect(matchesVersion("^18", "18.0.0")).toBe(true);
    expect(matchesVersion("^18", "19.0")).toBe(false);
  });

  it("波浪号 ~ 匹配同次版本", () => {
    expect(matchesVersion("~2.10.0", "2.10.3")).toBe(true);
    expect(matchesVersion("~2.10.0", "2.11.0")).toBe(false);
  });

  it("比较运算符", () => {
    expect(matchesVersion(">=2.10.0", "2.9.0")).toBe(false);
    expect(matchesVersion(">=2.10.0", "2.10.0")).toBe(true);
    expect(matchesVersion("<3.0.0", "2.12.1")).toBe(true);
    expect(matchesVersion("<3.0.0", "3.0.0")).toBe(false);
  });

  it("空格分隔的 AND 组合", () => {
    expect(matchesVersion(">=2.10.0 <3.0.0", "2.12.1")).toBe(true);
    expect(matchesVersion(">=2.10.0 <3.0.0", "3.0.0")).toBe(false);
  });

  it("精确匹配需要完全相等", () => {
    expect(matchesVersion("4.9.0", "4.9.0")).toBe(true);
    expect(matchesVersion("4.9", "4.9.1")).toBe(false);
  });
});
