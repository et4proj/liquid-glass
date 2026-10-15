# M0 实现文档：glass-core

> 状态：已完成 ｜ 包：`@et4proj/liquid-glass-core` v0.1.0 ｜ 对应架构文档 §4–§6、§14-M0
>
> 验收：单元测试 57/57 通过（resolve 优先级与降级、通道化 token、风格注册表全覆盖）。
>
> 注：M1 期间两处修正——budget 降档条件由 `>=` 改为 `>`（maxSurfaces 个可同时全效，见 m1-web.md 决定表 #1）；`exports` 产物名修正为 `liquid-glass-core.js/.cjs`。
> token v2 迁移（风格包架构）：core 零风格数据（除内置 basic 安全网），ios26/ios27 拆入 `packages/styles/*`，详见下文与 `docs/proposals/token-system-v2.md`。

## 范围

- 三个契约接口的类型定义（Surface 声明 / Backend / Probe）
- 配置层：`GlassConfig`、兼容规则、默认值合并、**通道级 advanced 覆盖**
- **通道化 token 系统（v2）**：风格注册表（`registerStyle` / `resolveStyle`）、StylePack / ChannelDef、三锚点插值、降级形态
- 策略解析 `resolve`：优先级链 + 能力门控 + 预算降档
- 仓库脚手架（pnpm + Turborepo + Vite lib + Vitest）与占位包

不包含：任何 DOM 操作、后端实现、框架绑定（M1+）；**真实风格数据**（在 `packages/styles/*` 风格包维护）。

## 源文件结构

```
packages/core/src/
  types.ts     # 三契约 + Tier/ReasonCode/MaterialTokens/GlassTokens/RenderPlan 等公共类型
  config.ts    # GlassConfig / GlassAdvanced / CompatRule / defineConfig / matchesVersion(迷你 semver)
  tokens.ts    # 风格注册表 + ChannelDef/StylePack 类型 + 内置 basic + buildTokens/solidTokens/noneTokens
  resolve.ts   # resolve(input) → RenderPlan
```

## API 速查

### 类型与常量（types.ts）

```ts
type Tier = 'none' | 'solid' | 'css' | 'svg' | 'webgl' | 'native'
const TIER_ORDER: readonly Tier[]   // 档位从低到高

interface SurfaceDeclaration {
  role: SurfaceRole        // 'bar' | 'sheet' | 'overlay' | 'control' | 'card' | 'capsule'
  shape?: SurfaceShape     // { kind: 'rounded' | 'capsule' | 'circle'; radius?: number | 'auto' }
  material?: MaterialPreset // 'regular' | 'clear' | 'tinted'
  intensity?: number       // 0..1，覆盖全局
  tint?: string
  interactive?: boolean    // 按压回弹、高光跟随
  group?: string           // 相邻玻璃融合分组
  backdrop?: BackdropHint  // 'page' | 'self' | { kind: 'source'; id }
  maxTier?: Tier           // 单表面档位上限
}

interface GlassTokens {           // token v2：通道化 token 集
  material: MaterialTokens        // 形状冻结：blur/saturation/tint/border/highlight/shadow/refraction/radius
  refraction?: RefractionTokens   // strength/ior/bezelWidth/aberration/rimLight（svg/webgl 档消费）
  motion?: MotionTokens           // 液滴弹簧参数（TabBar 增强件消费，10 字段）
  [channel: string]: unknown      // 未知通道透传
}

interface RenderPlan {
  tier: Tier
  tokens: GlassTokens
  interactive: boolean
  reasons: ReasonCode[]    // 档位选择与降级原因，供 debug.explain 与线上排查
}
```

`material.refraction` = refraction 通道 `strength` 的投影（MaterialTokens 形状冻结的桥接，CSS 变量 `--glass-refraction` 因此不变）。

`ReasonCode` 枚举：`ok` / `a11y:reduce-transparency` / `a11y:increase-contrast` / `a11y:reduce-motion` / `rule:disabled` / `rule:max-tier` / `role:max-tier` / `surface:max-tier` / `cap:backdrop-filter` / `cap:backdrop-filter-svg` / `cap:webgl2` / `cap:native-glass` / `budget:max-surfaces`

Backend / Probe / BackdropSource 契约与架构文档 §4.3–§4.5 一字不差，此处不重复。

### 配置（config.ts）

```ts
defineConfig(partial?: GlassConfigInput): GlassConfig
// GlassConfigInput 允许部分传入，budget / motion 支持逐字段覆盖

defaultConfig = {
  style: 'ios27',          // 风格 id：风格包注册后的取用键；未注册回退内置 basic
  intensity: 'regular', material: 'regular', maxTier: 'css', fallback: 'blur',
  budget: { maxSurfaces: 8, dprCap: 2, fpsCap: 60, degradeOnScroll: true },
  motion: { interactive: true, respectReducedMotion: true },
}

interface GlassAdvanced {  // 通道级 token 覆盖（v2；原扁平 advanced 已废弃）
  material?: Partial<MaterialTokens>
  refraction?: Partial<RefractionTokens>
  motion?: Partial<MotionTokens>
  [channel: string]: object | undefined
}

matchesVersion(range: string, version: string | undefined): boolean
// 迷你 semver：'*'、精确、^、~、>=、>、<、<=、空格 AND（如 '>=2.10.0 <3.0.0'）
// 版本缺失 → false（除 '*'）。注意：无 ||、无预发布标签支持。

matchesRule(rule: CompatRule, caps: Capabilities): boolean
// when 中所有字段 AND 匹配；platform/engine/os/osVersion/sdkVersion
```

### Token 系统 v2（tokens.ts）

**JS 对象 = 运行时唯一权威；JSON = 交换格式；CSS 变量 / uniforms = 投影。** core 不理解通道语义，只做注册、合并与插值。

```ts
// 风格注册表
registerStyle(pack: StylePack): void   // 重复注册 = 覆盖（dev 热替换）；dev 下非 x- 前缀未知通道警告
resolveStyle(id?: string): StylePack   // 未注册/未指定 → 内置 BASIC_STYLE；含 base 链深合并（缓存，注册时失效）
listStyles(): string[]                 // 已注册 id + 'basic'
const BASIC_STYLE: StylePack           // 内置极简安全网（~20 行数据，未注册风格包时框架可用）

// token 生成
buildTokens({ material, intensity, style? }): GlassTokens
// 三锚点分段插值（subtle=0 / regular=0.5 / strong=1，语义档精确命中锚点）
// material 通道形状冻结；material.refraction 投影自 refraction 通道 strength
// motion / x-* 通道按风格包声明透传（默认插值）

solidTokens(material?, style?): GlassTokens  // 不透明、无模糊/折射/高光（无障碍降级形态；外观取 StylePack.solid）
noneTokens(): GlassTokens                    // 全透明（disable 形态）

normalizeIntensity(intensity): number        // 语义档/数值 → 0..1
defaultInterpolate(lo, hi, t): Partial<T>    // 缺省插值：数值线性、非数值就近锚点、单侧缺失取存在的一侧
```

StylePack / ChannelDef 形状：

```ts
interface StylePack {
  id: string
  label: string
  base?: string            // 继承基准风格：通道级深合并（子覆盖父；数组替换不拼接；interpolate 子优先）
  solid?: { tint: string; border: string; shadow?: string }
  channels: {
    material: MaterialChannelDef    // 特化：stops（blur/saturation/highlight）+ static 按 MaterialPreset 提供基础外观
    refraction?: ChannelDef         // strength 走 stops；ior/bezelWidth/aberration/rimLight 走 static
    motion?: ChannelDef             // 全 static（弹簧参数与强度无关）
    [channel: string]: unknown      // x- 前缀自定义通道原样透传
  }
}

interface ChannelDef<T> {
  static?: Partial<T>     // 静态参数；stops 派生值覆盖同名字段（static 是"无 stops 字段"的兜底）
  stops?: ChannelStops<T> // { subtle?, regular?, strong? } 三锚点
  interpolate?: (lo, hi, t) => Partial<T>  // 唯一非 JSON-safe 的可选增强
}
```

风格包数据约束：**channels 数据必须 JSON-safe**（可序列化远程下发）。真实风格包：`packages/styles/ios26`（历史基线）与 `packages/styles/ios27`（主要方向，校准值依据 `docs/research/ios27-liquid-glass-spec.md` §5）。

### 策略解析（resolve.ts）

```ts
resolve(input: {
  config: GlassConfig
  caps: Capabilities
  surface: SurfaceDeclaration
  budget?: { activeSurfaces: number }   // 缺省 0
}): RenderPlan
```

解析流程（顺序即优先级，架构 §5.2）：

1. **无障碍**（强制，业务不可覆盖）：`reduceTransparency` / `increaseContrast` → 上限压至 `solid`
2. **兼容规则 rules**：命中多条时取最严格（`disable` → `none`；`maxTier` 取最小；`intensity` 后命中覆盖）
3. **显式 maxTier**（只压不抬，每级记录 reason）：`config.maxTier` < `roles[role].maxTier` < `surface.maxTier` < 规则 maxTier
4. **能力门控**：从上限逐档向下找第一个平台支持的档位（`backdropFilter` → css；`backdropFilterWithSvg` → svg；`webgl2` → webgl；`nativeGlass` → native），降级记录 `cap:*` reason
5. **预算**：`activeSurfaces > maxSurfaces` → 降一档（不低于 solid），记录 `budget:max-surfaces`（activeSurfaces 含当前表面；恰好达到上限不降档）
6. **交互**：`surface.interactive ?? config.motion.interactive`；`reduceMotion` + `respectReducedMotion` → false
7. **强度**（高 → 低）：规则 > surface > role > config；**材质**：surface > role > config
8. **Token 组装**：tier 为 none/solid 用对应降级形态（通道化：material 用降级数据、refraction 清零、motion 不输出），否则 `buildTokens`；`surface.tint` 覆盖 material.tint；`config.advanced` 通道级逐字段最后覆盖（不存在的通道则创建）

reasons 为空时输出 `['ok']`。

## 实现期的最简决定（可调整）

| # | 决定 | 备选 |
|---|---|---|
| 1 | 预算超限降一档而非摘除最旧表面 | LRU 摘除（需运行时状态，M1 调度器实现时重估） |
| 2 | 规则 intensity 后命中覆盖前命中 | 取最严格（改动小） |
| 3 | maxTier 链"只压不抬"：surface 声明高于全局时不抬升 | 允许抬升（会破坏全局预算控制） |
| 4 | `matchesVersion` 自写 | 引 semver-regex 等（M0 无依赖原则） |
| 5 | ios27 独立预设（非共享引用）：依据 Apple 公开方向（更通透/暗化边缘/亮高光/强折射）拟定，待真机校准 | 用户观感反馈"磨砂感过重"与 iOS 27 官方方向一致；WWDC26 SOTU 确认 ultra clear 取向 |
| 6 | **token v2（D1–D5 拍板，见提案）**：core 内置极简 basic fallback；旧扁平 plan.tokens 一步到位切 plan.tokens.material；风格包先 workspace 目录不发 npm；未知通道宽松校验（透传 + dev 警告）；motion 通道进 v2 首版 | 详见 docs/proposals/token-system-v2.md §9 |
| 7 | `material.refraction` 投影自 refraction 通道 strength（MaterialTokens 形状冻结，css 后端与 --glass-refraction 零改动） | material 通道自带 refraction 字段（数据重复，否决） |
| 8 | 单侧缺失插值取存在的一侧（field 声明于任一锚点即视为 stops 管理，static 不再兜底） | 缺失侧回退 static（破坏"stops 覆盖 static"的锚点命中语义，否决） |

## 测试覆盖

`test/resolve.spec.ts`（23）：优先级链 9（a11y 强制、规则 disable/未命中/os+osVersion/sdkVersion、surface 与 role maxTier 压低/不抬升）；能力门控 4；预算与交互 5（含"恰好达到上限不降档"边界）；强度与 token 7（语义档/数值插值、规则与角色强度、tint + advanced 通道级覆盖、none/solid 形态、材质预设优先级、config.style 贯穿（重复注册覆盖即生效）、未注册风格回退 basic）。

`test/config.spec.ts`（10）：默认值、budget/motion 逐字段合并、matchesVersion 全操作符、style 默认与显式指定。

`test/tokens.spec.ts`（24）：归一化、缺省插值三规则、注册表（命中/覆盖/未注册回退 basic/base 链深合并）、buildTokens（语义档命中、分段插值、材质预设只影响外观、refraction 通道 + material.refraction 投影、motion 透传、stops 覆盖 static、x- 通道透传、无 refraction 通道清零、basic 兜底）、solid/none 形态。

风格包数据测试：`packages/styles/ios27`（7）+ `packages/styles/ios26`（5）——校准值、暗环、refraction/motion 通道参数、solid 形态。

## 构建

- 产物：`dist/liquid-glass-core.js`（ESM / gzip ~2.4kB）+ `.cjs` + d.ts
- `exports` 映射 types/import/require 三条件
- TS ^5.9（TS 7 与 unplugin-dts 不兼容，见 AGENTS.md 决策表）

## M0 → M1 衔接点

- `resolve` 尚无运行时调度器包装：`createGlass()`（架构 §6）在 glass-web 落地，M0 的 resolve 是它的纯函数内核
- `ReasonCode` 已为 `glass.debug.explain` 预留全部枚举
- CSS 变量 `--glass-*` 与 `material` 通道字段一一对应（架构 §4.1），CSS 后端直接消费 `plan.tokens.material` 生成内联样式；svg 后端消费 `tokens.refraction`（strength/ior/bezelWidth）
- 降级矩阵（架构 §12）的保守默认 `maxTier: 'css'` 已进 `defaultConfig`
- 新增 iOS 风格（如 ios28）= 新建风格包 `packages/styles/ios28`（base 可指 ios27 只声明差异字段），core 与既有包零改动
