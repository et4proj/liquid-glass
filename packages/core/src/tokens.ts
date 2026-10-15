import type { GlassTokens, MaterialPreset, MaterialTokens, RefractionTokens } from './types'
import type { IntensityPresetKey } from './config'

/**
 * Token 系统 v2（docs/proposals/token-system-v2.md）：
 * 风格包（StylePack，纯数据可独立成包）注册进 core 注册表，
 * 通道（Channel）是 token 的语义分组，core 不理解通道语义，只做合并与插值。
 * core 零风格数据（除内置 basic 安全网），ios26/ios27 等真实风格在风格包中维护。
 */

/* ─────────────────── 通道与风格包类型 ─────────────────── */

/** 通道数据字段值：JSON-safe 标量（风格包可序列化远程下发） */
export type ChannelValue = number | string | boolean

/** 强度锚点（0→subtle, 0.5→regular, 1→strong，三锚点分段插值） */
export interface ChannelStops<T extends object = object> {
  subtle?: Partial<T>
  regular?: Partial<T>
  strong?: Partial<T>
}

/** 单个通道定义：静态参数 + 强度锚点 + 可选自定义插值器 */
export interface ChannelDef<T extends object = object> {
  /** 静态参数：不随强度插值；同名字段以 stops 派生值优先（stops 是 static 的覆盖） */
  static?: Partial<T>
  stops?: ChannelStops<T>
  /** 自定义插值器（唯一非 JSON-safe 的可选增强）；
   *  缺省规则：数值线性插值、字符串/布尔取就近锚点值 */
  interpolate?: (lo: Partial<T>, hi: Partial<T>, t: number) => Partial<T>
}

/** material 通道动态字段（随强度插值；refraction 投影自 refraction 通道的 strength） */
export interface MaterialDynamic {
  blur: number
  saturation: number
  highlight: number
}

/** 材质基础外观（与强度无关的静态部分，按 MaterialPreset 提供） */
export interface MaterialBase {
  tint: string
  border: string
  shadow: string
  radius: number
}

/** material 通道（特化）：动态字段走强度锚点，
 *  static 按材质预设（regular/clear/tinted）提供基础外观——现状行为保持 */
export interface MaterialChannelDef {
  stops?: ChannelStops<MaterialDynamic>
  static?: Partial<Record<MaterialPreset, Partial<MaterialBase>>>
  interpolate?: ChannelDef<MaterialDynamic>['interpolate']
}

/** refraction 通道输入形状（输出见 types.ts 的 RefractionTokens） */
export interface RefractionChannelData {
  strength: number
  ior?: number
  bezelWidth?: number
  aberration?: number
  rimLight?: number
}

/** motion 通道输入形状（输出见 types.ts 的 MotionTokens） */
export interface MotionChannelData {
  attraction?: number
  stretchPerSpeed?: number
  maxStretch?: number
  dragStretchPerSpeed?: number
  dragMaxStretch?: number
  wobbleLerp?: number
  edgeResistance?: number
  settleDistance?: number
  settleWobble?: number
  labelFadeLerp?: number
}

/** 风格包：一组通道 + 元信息（纯数据、JSON-safe，可独立发 npm 包） */
export interface StylePack {
  id: string
  label: string
  /** 继承基准风格（通道级深合并覆盖；数组替换不拼接）；
   *  如 ios28: base 'ios27' 只改差异字段 */
  base?: string
  /** 无障碍降级形态（solid 档外观；缺 shadow 时沿用 material 基础外观） */
  solid?: { tint: string; border: string; shadow?: string }
  channels: {
    material: MaterialChannelDef
    refraction?: ChannelDef<RefractionChannelData>
    motion?: ChannelDef<MotionChannelData>
    /** 开放扩展：x- 前缀自定义通道（core 原样透传并做默认插值） */
    [channel: string]: unknown
  }
}

/* ─────────────────── 风格注册表 ─────────────────── */

/** core 内置极简安全网（约 20 行数据）：未注册任何风格包时框架可用；
 *  真实风格永远来自风格包（显式 registerStyle 或 side-effect auto 入口） */
export const BASIC_STYLE: StylePack = {
  id: 'basic',
  label: 'Basic（内置安全网）',
  solid: { tint: 'rgba(255,255,255,0.92)', border: 'rgba(255,255,255,0.55)' },
  channels: {
    material: {
      stops: {
        subtle: { blur: 4, saturation: 1.1, highlight: 0.2 },
        regular: { blur: 8, saturation: 1.2, highlight: 0.4 },
        strong: { blur: 12, saturation: 1.3, highlight: 0.6 },
      },
      static: {
        regular: { tint: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.32)', shadow: '0 8px 24px rgba(0,0,0,0.12)', radius: 16 },
        clear: { tint: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.22)', shadow: '0 8px 24px rgba(0,0,0,0.08)', radius: 16 },
        tinted: { tint: 'rgba(255,255,255,0.28)', border: 'rgba(255,255,255,0.42)', shadow: '0 8px 24px rgba(0,0,0,0.16)', radius: 16 },
      },
    },
  },
}

/** 已注册风格表（运行时，模块级单例） */
const registry = new Map<string, StylePack>()
/** base 链解析（深合并）缓存：registerStyle 时全量失效 */
const resolvedCache = new Map<string, StylePack>()

const isDev = (): boolean =>
  typeof process !== 'undefined' && (process as { env?: Record<string, string> }).env?.NODE_ENV === 'development'

/** 已知通道集合；非 x- 前缀的未知通道 dev 警告（宽松校验：透传不报错，D4） */
const KNOWN_CHANNELS = new Set(['material', 'refraction', 'motion'])

/** 注册风格包；重复注册 = 覆盖（dev 热替换友好） */
export function registerStyle(pack: StylePack): void {
  registry.set(pack.id, pack)
  resolvedCache.clear() // base 链可能受影响，全量失效
  if (isDev()) {
    for (const key of Object.keys(pack.channels)) {
      if (!KNOWN_CHANNELS.has(key) && !key.startsWith('x-')) {
        console.warn(
          `[liquid-glass] 风格 "${pack.id}" 含未知通道 "${key}"：将原样透传（自定义通道建议 x- 前缀）`,
        )
      }
    }
  }
}

/** 列出可用风格 id（含内置 basic） */
export function listStyles(): string[] {
  return [...registry.keys(), ...(!registry.has(BASIC_STYLE.id) ? [BASIC_STYLE.id] : [])]
}

/** 对象深合并：override 优先；嵌套对象递归，数组与标量整体替换（提案 §11） */
function deepMerge<T>(base: T, override: T): T {
  if (typeof base !== 'object' || base === null || typeof override !== 'object' || override === null) {
    return override
  }
  if (Array.isArray(base) || Array.isArray(override)) return override // 数组是替换不是拼接
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = key in out ? deepMerge(out[key], value) : value
  }
  return out as T
}

/** 通道级深合并：base 链继承用 */
function mergeChannelDef(base: unknown, override: unknown): unknown {
  if (
    typeof base !== 'object' || base === null ||
    typeof override !== 'object' || override === null
  ) {
    return override
  }
  const b = base as Record<string, unknown>
  const o = override as Record<string, unknown>
  return {
    ...b,
    ...o,
    static: b.static !== undefined || o.static !== undefined
      ? deepMerge(b.static ?? {}, o.static ?? {})
      : undefined,
    stops: b.stops !== undefined || o.stops !== undefined
      ? deepMerge(b.stops ?? {}, o.stops ?? {})
      : undefined,
    // interpolate 是函数：子定义优先，缺省回落 base
    interpolate: o.interpolate ?? b.interpolate,
  }
}

/** 解析 base 继承链：向上取 base 并深合并（子覆盖父）；防环、防超深 */
function resolveBaseChain(pack: StylePack, seen = new Set<string>()): StylePack {
  if (!pack.base || seen.has(pack.id)) return pack
  seen.add(pack.id)
  let base: StylePack
  if (registry.has(pack.base)) {
    base = resolveBaseChain(registry.get(pack.base)!, seen)
  } else if (pack.base === BASIC_STYLE.id) {
    base = BASIC_STYLE
  } else {
    if (isDev()) console.warn(`[liquid-glass] 风格 "${pack.id}" 的 base "${pack.base}" 未注册，忽略继承`)
    return pack
  }
  const channels: StylePack['channels'] = { ...base.channels }
  for (const [key, def] of Object.entries(pack.channels)) {
    channels[key] = def === undefined ? undefined : mergeChannelDef(base.channels[key], def)
  }
  return { ...pack, solid: pack.solid ?? base.solid, channels }
}

/** 取风格包：未注册 / 未指定 → 内置 basic（D1 安全网）；含 base 链深合并（缓存） */
export function resolveStyle(id?: string): StylePack {
  if (id === undefined || id === BASIC_STYLE.id) return BASIC_STYLE
  const cached = resolvedCache.get(id)
  if (cached) return cached
  const pack = registry.get(id)
  if (!pack) {
    if (isDev()) console.warn(`[liquid-glass] 风格 "${id}" 未注册，回退内置 basic（显式 registerStyle 或 import '风格包/auto'）`)
    return BASIC_STYLE
  }
  const resolved = resolveBaseChain(pack)
  resolvedCache.set(id, resolved)
  return resolved
}

/* ─────────────────── 插值 ─────────────────── */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** 把语义档或数值强度归一化为 0..1（subtle=0, regular=0.5, strong=1） */
export function normalizeIntensity(intensity: IntensityPresetKey | number): number {
  if (typeof intensity === 'number') return Math.min(1, Math.max(0, intensity))
  return { subtle: 0, regular: 0.5, strong: 1 }[intensity]
}

/** 缺省插值规则（提案 §5）：数值线性插值；非数值取就近锚点值；
 *  单侧缺失字段取存在的一侧 */
export function defaultInterpolate<T extends object>(
  lo: Partial<T>,
  hi: Partial<T>,
  t: number,
): Partial<T> {
  const out: Record<string, ChannelValue> = {}
  for (const key of new Set([...Object.keys(lo), ...Object.keys(hi)])) {
    const a = (lo as Record<string, unknown>)[key]
    const b = (hi as Record<string, unknown>)[key]
    if (typeof a === 'number' && typeof b === 'number') out[key] = lerp(a, b, t)
    else if (a !== undefined && b !== undefined) out[key] = (t < 0.5 ? a : b) as ChannelValue
    else out[key] = (a ?? b) as ChannelValue
  }
  return out as Partial<T>
}

/** 三锚点分段：下半段 subtle→regular，上半段 regular→strong（语义档精确命中锚点） */
function segment<T extends object>(t: number, stops: ChannelStops<T>): {
  lo: Partial<T>
  hi: Partial<T>
  seg: number
} {
  const subtle = stops.subtle ?? {}
  const regular = stops.regular ?? {}
  const strong = stops.strong ?? {}
  if (t < 0.5) return { lo: subtle, hi: regular, seg: t * 2 }
  return { lo: regular, hi: strong, seg: (t - 0.5) * 2 }
}

/** 单通道求值：stops 插值结果覆盖 static 同名字段（static 是无 stops 字段的兜底） */
function buildChannelValues<T extends object>(def: ChannelDef<T>, t: number): Record<string, ChannelValue> {
  const { lo, hi, seg } = segment(t, def.stops ?? {})
  const interpolate = (def.interpolate ?? defaultInterpolate) as (
    lo: Partial<T>,
    hi: Partial<T>,
    t: number,
  ) => Partial<T>
  const dyn = interpolate(lo, hi, seg) as Record<string, ChannelValue>
  const statics = (def.static ?? {}) as Record<string, ChannelValue>
  return { ...statics, ...dyn }
}

/* ─────────────────── token 生成 ─────────────────── */

/** material 通道字段兜底（风格包数据缺字段时的安全缺省，对齐 basic） */
const MATERIAL_DEFAULTS: Required<Pick<MaterialTokens, 'blur' | 'saturation' | 'highlight' | 'tint' | 'border' | 'shadow' | 'radius'>> = {
  blur: 0,
  saturation: 1,
  highlight: 0,
  tint: 'rgba(255,255,255,0.16)',
  border: 'rgba(255,255,255,0.32)',
  shadow: '0 8px 24px rgba(0,0,0,0.12)',
  radius: 16,
}

/** 由材质预设 + 强度 + 风格生成通道化 token（v2）：
 *  - material 形状冻结（MaterialTokens 契约不变，css 后端零改动）
 *  - material.refraction = refraction 通道 strength 的投影（--glass-refraction 变量）
 *  - motion / x-* 等其余通道按风格包声明透传（默认插值） */
export function buildTokens(options: {
  material: MaterialPreset
  intensity: IntensityPresetKey | number
  /** 风格 id，缺省 basic；未注册风格回退 basic */
  style?: string
}): GlassTokens {
  const pack = resolveStyle(options.style)
  const t = normalizeIntensity(options.intensity)

  // material 通道：动态字段（blur/saturation/highlight）插值 + 按材质预设的静态外观
  const matDef = pack.channels.material
  const matStops: ChannelStops<MaterialDynamic> = matDef?.stops ?? {}
  const { lo, hi, seg } = segment(t, matStops)
  const matInterp = (matDef?.interpolate ?? defaultInterpolate) as (
    lo: Partial<MaterialDynamic>,
    hi: Partial<MaterialDynamic>,
    t: number,
  ) => Partial<MaterialDynamic>
  const dyn = matInterp(lo, hi, seg)
  const base = matDef?.static?.[options.material] ?? {}
  const material: MaterialTokens = {
    blur: typeof dyn.blur === 'number' ? dyn.blur : MATERIAL_DEFAULTS.blur,
    saturation: typeof dyn.saturation === 'number' ? dyn.saturation : MATERIAL_DEFAULTS.saturation,
    highlight: typeof dyn.highlight === 'number' ? dyn.highlight : MATERIAL_DEFAULTS.highlight,
    tint: base.tint ?? MATERIAL_DEFAULTS.tint,
    border: base.border ?? MATERIAL_DEFAULTS.border,
    shadow: base.shadow ?? MATERIAL_DEFAULTS.shadow,
    radius: base.radius ?? MATERIAL_DEFAULTS.radius,
    refraction: 0, // 占位，下方由 refraction 通道投影
  }

  // refraction 通道（无声明时为无折射形态）
  const refDef = pack.channels.refraction
  let refraction: RefractionTokens = { strength: 0 }
  if (refDef) {
    const values = buildChannelValues(refDef, t) as Partial<RefractionTokens>
    refraction = { strength: typeof values.strength === 'number' ? values.strength : 0, ...values }
  }

  const tokens: GlassTokens = { material, refraction }

  // 其余通道透传（motion / x-*；core 不理解语义，只做默认插值与合并）
  for (const [key, def] of Object.entries(pack.channels)) {
    if (key === 'material' || key === 'refraction') continue
    if (def && typeof def === 'object') {
      tokens[key] = buildChannelValues(def as ChannelDef<object>, t)
    }
  }

  // material.refraction 投影（MaterialTokens 形状冻结的桥接）
  material.refraction = refraction.strength
  return tokens
}

/** solid 档（无障碍降级形态）：不透明、无模糊、无折射、无高光；
 *  外观来自风格包 solid 数据（shadow 缺省沿用 material 基础外观） */
export function solidTokens(material: MaterialPreset = 'regular', style?: string): GlassTokens {
  const pack = resolveStyle(style)
  const base = pack.channels.material.static?.[material] ?? {}
  const solid = pack.solid
  return {
    material: {
      blur: 0,
      saturation: 1,
      tint: solid?.tint ?? 'rgba(255,255,255,0.92)',
      border: solid?.border ?? 'rgba(255,255,255,0.55)',
      highlight: 0,
      shadow: solid?.shadow ?? base.shadow ?? MATERIAL_DEFAULTS.shadow,
      refraction: 0,
      radius: base.radius ?? MATERIAL_DEFAULTS.radius,
    },
    refraction: { strength: 0 },
  }
}

/** none 档：完全不渲染玻璃 */
export function noneTokens(): GlassTokens {
  return {
    material: {
      blur: 0,
      saturation: 1,
      tint: 'transparent',
      border: 'transparent',
      highlight: 0,
      shadow: 'none',
      refraction: 0,
      radius: 0,
    },
    refraction: { strength: 0 },
  }
}
