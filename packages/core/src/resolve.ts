import { matchesRule } from "./config";
import type { GlassAdvanced, GlassConfig } from "./config";
import { buildTokens, noneTokens, solidTokens } from "./tokens";
import type {
  Capabilities,
  GlassTokens,
  ReasonCode,
  RenderPlan,
  SurfaceDeclaration,
  Tier,
} from "./types";
import { TIER_ORDER } from "./types";

export interface ResolveInput {
  config: GlassConfig;
  caps: Capabilities;
  surface: SurfaceDeclaration;
  budget?: { activeSurfaces: number };
}

const rank = (tier: Tier): number => TIER_ORDER.indexOf(tier);
const lowerTier = (a: Tier, b: Tier): Tier => (rank(a) <= rank(b) ? a : b);

function tierSupported(tier: Tier, caps: Capabilities): boolean {
  switch (tier) {
    case "native":
      return caps.nativeGlass;
    case "webgl":
      return caps.webgl2;
    case "svg":
      return caps.backdropFilterWithSvg;
    case "css":
      return caps.backdropFilter;
    default:
      return true;
  }
}

function capabilityReason(tier: Tier): ReasonCode {
  switch (tier) {
    case "native":
      return "cap:native-glass";
    case "webgl":
      return "cap:webgl2";
    case "svg":
      return "cap:backdrop-filter-svg";
    default:
      return "cap:backdrop-filter";
  }
}

/**
 * 策略解析（§6）：
 * 能力探测结果 + 优先级链 → 该表面可用的最高档 → 检查预算 → 输出 RenderPlan。
 *
 * 优先级（高 → 低，§5.2）：
 * 1. 系统无障碍设置（强制，业务不可覆盖）
 * 2. 兼容规则 rules
 * 3. 开发者显式配置（全局 maxTier < 角色 roles < 表面 surface）
 * 4. 主题预设 / 默认值
 */
export function resolve(input: ResolveInput): RenderPlan {
  const { config, caps, surface } = input;
  const activeSurfaces = input.budget?.activeSurfaces ?? 0;
  const reasons: ReasonCode[] = [];

  // 1. 无障碍设置：solid 为安全形态，只能压低档位，业务配置不可覆盖
  if (caps.a11y.reduceTransparency) reasons.push("a11y:reduce-transparency");
  if (caps.a11y.increaseContrast) reasons.push("a11y:increase-contrast");

  // 2. 兼容规则：命中则取各规则的最严格结果
  let ruleMaxTier: Tier | undefined;
  let ruleIntensity: number | undefined;
  let disabled = false;
  for (const rule of config.rules ?? []) {
    if (!matchesRule(rule, caps)) continue;
    if (rule.then.disable) disabled = true;
    if (rule.then.maxTier !== undefined) {
      ruleMaxTier =
        ruleMaxTier === undefined ? rule.then.maxTier : lowerTier(ruleMaxTier, rule.then.maxTier);
    }
    if (rule.then.intensity !== undefined) ruleIntensity = rule.then.intensity;
  }
  if (disabled) reasons.push("rule:disabled");

  // 3. 显式配置上限：全局 < 角色覆盖 < 表面声明 < 规则，取最小
  const roleOverride = config.roles?.[surface.role];
  let maxTier = config.maxTier;
  if (roleOverride?.maxTier !== undefined && rank(roleOverride.maxTier) < rank(maxTier)) {
    maxTier = roleOverride.maxTier;
    reasons.push("role:max-tier");
  }
  if (surface.maxTier !== undefined && rank(surface.maxTier) < rank(maxTier)) {
    maxTier = surface.maxTier;
    reasons.push("surface:max-tier");
  }
  if (ruleMaxTier !== undefined && rank(ruleMaxTier) < rank(maxTier)) {
    maxTier = ruleMaxTier;
    reasons.push("rule:max-tier");
  }

  // 无障碍压低到 solid（仅当下限更低时）
  if (
    (caps.a11y.reduceTransparency || caps.a11y.increaseContrast) &&
    rank("solid") < rank(maxTier)
  ) {
    maxTier = "solid";
  }
  if (disabled) maxTier = "none";

  // 4. 能力门控：从上限向下找到第一个平台支持的档位
  let tier = maxTier;
  while (!tierSupported(tier, caps)) {
    reasons.push(capabilityReason(tier));
    const next = rank(tier) - 1;
    if (next < 0) break;
    tier = TIER_ORDER[next];
  }

  // 5. 预算：activeSurfaces 含当前表面；maxSurfaces 个可同时全效，超出才降档（M0 简化语义，不触碰 solid/none）
  if (activeSurfaces > config.budget.maxSurfaces && rank(tier) > rank("solid")) {
    tier = TIER_ORDER[rank(tier) - 1];
    reasons.push("budget:max-surfaces");
  }

  // 6. 交互：减少动态时关闭交互效果
  let interactive = surface.interactive ?? config.motion.interactive;
  if (interactive && config.motion.respectReducedMotion && caps.a11y.reduceMotion) {
    interactive = false;
    reasons.push("a11y:reduce-motion");
  }

  // 7. 强度与 token：规则 > 表面 > 角色 > 全局；advanced 通道级逐字段最后覆盖
  const intensity =
    ruleIntensity ?? surface.intensity ?? roleOverride?.intensity ?? config.intensity;
  const material = surface.material ?? roleOverride?.material ?? config.material;
  let tokens: GlassTokens;
  if (tier === "none") {
    tokens = noneTokens();
  } else if (tier === "solid") {
    tokens = solidTokens(material, config.style);
  } else {
    tokens = buildTokens({ material, intensity, style: config.style });
  }
  if (surface.tint !== undefined) {
    tokens = { ...tokens, material: { ...tokens.material, tint: surface.tint } };
  }
  if (config.advanced) tokens = applyAdvanced(tokens, config.advanced);

  if (reasons.length === 0) reasons.push("ok");
  return { tier, tokens, interactive, reasons };
}

/** advanced 通道级覆盖：逐通道合并字段（不存在的通道则创建，供消费者直接取用） */
function applyAdvanced(tokens: GlassTokens, advanced: GlassAdvanced): GlassTokens {
  const out: GlassTokens = { ...tokens };
  for (const [channel, fields] of Object.entries(advanced)) {
    if (!fields || typeof fields !== "object") continue;
    const current = out[channel];
    const base = current && typeof current === "object" ? { ...(current as object) } : {};
    out[channel] = { ...base, ...fields };
  }
  return out;
}
