import type {
  Capabilities,
  MaterialPreset,
  MaterialTokens,
  MotionTokens,
  Platform,
  RefractionTokens,
  SurfaceRole,
  Tier,
} from "./types";

/** 语义强度档 */
export type IntensityPresetKey = "subtle" | "regular" | "strong";

/** 按角色的配置覆盖（§5.1 roles） */
export interface RoleOverride {
  intensity?: number;
  material?: MaterialPreset;
  maxTier?: Tier;
}

/** 按环境的兼容规则（§5.1 rules） */
export interface CompatRule {
  when: {
    platform?: Platform;
    engine?: NonNullable<Capabilities["engine"]>;
    os?: NonNullable<Capabilities["os"]>;
    /** semver 范围：支持 ^ ~ >= > < <=、精确版本、'*' 与空格分隔的 AND 组合 */
    osVersion?: string;
    /** 小程序基础库 semver 范围 */
    sdkVersion?: string;
  };
  then: { maxTier?: Tier; intensity?: number; disable?: boolean };
}

/** 通道级 token 覆盖（token v2，优先级最高，逐字段生效；原扁平 advanced 已废弃） */
export interface GlassAdvanced {
  material?: Partial<MaterialTokens>;
  refraction?: Partial<RefractionTokens>;
  motion?: Partial<MotionTokens>;
  /** 自定义通道（x- 前缀等）整体按字段覆盖 */
  [channel: string]: object | undefined;
}

/** 全局配置（保持可 JSON 序列化，便于远程下发与灰度） */
export interface GlassConfig {
  version: 1;
  /** 主题预设名 */
  preset?: string;
  /** 风格 id：风格包注册后的取用键（'ios27' 为主要开发方向，'ios26' 为历史基线；
   *  风格数据在风格包维护，未注册回退 core 内置 basic，见 tokens.ts） */
  style?: string;
  intensity: IntensityPresetKey | number;
  material: MaterialPreset;
  /** 全局档位上限 */
  maxTier: Tier;
  /** 无法达到目标档时的降级形态 */
  fallback: "solid" | "blur" | "none";
  budget: {
    /** 同屏玻璃数上限 */
    maxSurfaces: number;
    /** 分辨率倍率上限 */
    dprCap: number;
    fpsCap: number;
    /** 滚动中临时降档 */
    degradeOnScroll: boolean;
  };
  motion: {
    interactive: boolean;
    respectReducedMotion: boolean;
  };
  rules?: CompatRule[];
  roles?: Partial<Record<SurfaceRole, RoleOverride>>;
  /** 通道级 token 覆盖（优先级最高，逐字段生效；v2 结构见 GlassAdvanced） */
  advanced?: GlassAdvanced;
}

/** 默认配置：风格主方向 ios27（ultra clear，依据 docs/research/ios27-liquid-glass-spec.md）；档位上限取降级矩阵的保守值 css（§12） */
export const defaultConfig: GlassConfig = {
  version: 1,
  style: "ios27",
  intensity: "regular",
  material: "regular",
  maxTier: "css",
  fallback: "blur",
  budget: { maxSurfaces: 8, dprCap: 2, fpsCap: 60, degradeOnScroll: true },
  motion: { interactive: true, respectReducedMotion: true },
};

/** defineConfig 的入参：允许部分传入（budget / motion 也支持部分覆盖） */
export type GlassConfigInput = Omit<Partial<GlassConfig>, "budget" | "motion"> & {
  budget?: Partial<GlassConfig["budget"]>;
  motion?: Partial<GlassConfig["motion"]>;
};

/** 合并默认配置，允许部分传入 */
export function defineConfig(partial: GlassConfigInput = {}): GlassConfig {
  return {
    ...defaultConfig,
    ...partial,
    budget: { ...defaultConfig.budget, ...partial.budget },
    motion: { ...defaultConfig.motion, ...partial.motion },
    roles: partial.roles ? { ...partial.roles } : undefined,
    rules: partial.rules ? [...partial.rules] : undefined,
    advanced: partial.advanced ? { ...partial.advanced } : undefined,
  };
}

type Triple = [number, number, number];

function parseTriple(version: string): Triple {
  const parts = version.split(".");
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
}

function compareTriple(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * 极简 semver 范围匹配（M0 够用，避免引入依赖）：
 * 支持 '*'、精确版本、^、~、>=、>、<、<=，以及空格分隔的 AND 组合（如 '>=2.10.0 <3.0.0'）。
 */
export function matchesVersion(range: string, version: string | undefined): boolean {
  if (version === undefined) return false;
  if (range === "*" || range === "") return true;
  return range
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => {
      const m = /^([\^~<>=]*)(\d+(?:\.\d+){0,2})$/.exec(part);
      if (!m) return false;
      const op = m[1] || "=";
      const target = parseTriple(m[2] as string);
      const current = parseTriple(version);
      const cmp = compareTriple(current, target);
      switch (op) {
        case "=":
          return cmp === 0;
        case "^":
          return current[0] === target[0] && cmp >= 0;
        case "~":
          return current[0] === target[0] && current[1] === target[1] && cmp >= 0;
        case ">=":
          return cmp >= 0;
        case "<=":
          return cmp <= 0;
        case ">":
          return cmp > 0;
        case "<":
          return cmp < 0;
        default:
          return false;
      }
    });
}

/** 判断能力是否命中规则（when 中所有字段需同时满足） */
export function matchesRule(rule: CompatRule, caps: Capabilities): boolean {
  const { when } = rule;
  if (when.platform !== undefined && when.platform !== caps.platform) return false;
  if (when.engine !== undefined && when.engine !== caps.engine) return false;
  if (when.os !== undefined && when.os !== caps.os) return false;
  if (when.osVersion !== undefined && !matchesVersion(when.osVersion, caps.osVersion)) return false;
  if (when.sdkVersion !== undefined && !matchesVersion(when.sdkVersion, caps.mp?.sdkVersion))
    return false;
  return true;
}
