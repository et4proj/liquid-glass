# Token 系统 v2 提案：风格包架构

> 状态：提案（待拍板）｜ 日期：2026-10-15
> 动机：iOS 27 为主要方向后，风格参数（静态材质 + 交互 + 未来 WebGL/小程序算法参数）将持续膨胀；当前 `STYLE_PRESETS` 硬编码在 core 中，每加一个版本或一个算法维度都要动 core。
> 目标：**每套风格可独立维护、可拆独立包、算法维度可延伸**，core 保持稳定。

## 1. 现状问题

| 问题 | 现状 | v2 |
|---|---|---|
| 风格耦合 core | ios26/ios27 预设硬编码在 `tokens.ts`，新增 iOS 版本必须发 core 版 | 风格包注册，core 零风格数据 |
| token 扁平且封闭 | `MaterialTokens` 8 字段固定；折射算法参数（ior/bezel/色差）、交互弹簧参数无处安放 | 通道（channel）开放分层 |
| 强度插值绑死实现 | `buildTokens` 硬编码字段级插值 | 插值规则由通道描述符声明 |
| solid 降级形态不可定制 | `solidTokens` 硬编码 | solid 进入风格数据 |
| 一处校准一次发版 | ios27 校准改数据也要动 core 仓库结构 | 只改风格包 |

## 2. 核心概念（三个）

```
风格包 StylePack ──纯数据包（可独立发 npm）──┐
                                            │ registerStyle()
通道 Channel ──语义参数组 + 插值规则──→ 注册表 Registry（core 内）
                                            │ config.style 命中
消费者 Consumer ──后端/增强件按通道取用──→ buildTokens(): 通道化 token 集
```

1. **风格包（StylePack）**：一套完整风格数据（如 ios27）。独立 workspace 包，仅依赖 core 类型，纯数据 + 无逻辑（或极少）。
2. **通道（Channel）**：token 的语义分组，每组声明自己的静态值、强度锚点与插值器。通道 id 是消费契约（如 `material` / `refraction` / `motion`），core 不理解通道语义，只做合并与插值。
3. **注册表（Registry）**：core 内的运行时风格表 + 注册 API。`config.style` 查注册表，未注册走 fallback。

## 3. 数据模型

```ts
// ─── core：通道与风格类型 ───

/** 单个通道定义（风格包按此声明参数组） */
interface ChannelDef<T extends object = Record<string, number | string | boolean>> {
  /** 静态参数：不随强度插值（tint/shadow/ior/半径…） */
  static?: T
  /** 强度锚点：三锚点分段插值（0→subtle, 0.5→regular, 1→strong） */
  stops?: { subtle?: Partial<T>; regular?: Partial<T>; strong?: Partial<T> }
  /** 自定义插值器（缺省：数值线性、字符串/布尔取就近锚点值） */
  interpolate?: (lo: Partial<T>, hi: Partial<T>, t: number) => Partial<T>
}

/** 风格包：一组通道 + 元信息 */
interface StylePack {
  id: string                 // 'ios27'
  label: string
  /** 继承基准风格（通道级深合并覆盖）；如 ios28: base 'ios27' 只改 3 个参数 */
  base?: string
  /** 无障碍降级形态（原 solidTokens 数据化） */
  solid?: { tint: string; border: string; shadow?: string }
  channels: {
    material: ChannelDef<{ blur; saturation; tint; border; highlight; shadow; radius }>
    refraction?: ChannelDef<{ strength; ior?; bezelWidth?; aberration?; rimLight? }>
    motion?: ChannelDef<{ attraction?; stretchPerSpeed?; maxStretch? }>
    /** 开放扩展：x- 前缀自定义通道（core 原样透传） */
    [channel: string]: ChannelDef<any> | undefined
  }
}

// ─── core：注册 API ───
registerStyle(pack: StylePack): void        // 重复注册 = 覆盖（dev 热替换友好）
resolveStyle(id?: string): StylePack        // 未注册/未指定 → 内置 fallback 风格 'basic'
listStyles(): string[]

// ─── resolve 输出（RenderPlan.tokens v2）──
interface GlassTokens {
  material: MaterialTokens     // 形状同现有 MaterialTokens（css 后端零改动）
  refraction?: { strength: number; ior?: number; ... }
  motion?: { attraction: number; ... }
  [channel: string]: unknown   // 未知通道透传（前向兼容：风格包先行、消费者后到）
}
```

**关键设计**：

- **material 通道形状冻结**：`GlassTokens.material` 与现有 `MaterialTokens` 字段一致，css-backend / playground 现有消费零改动。
- **未知字段自动插值**：数值默认线性插值、非数值取就近锚点——风格包可以先加 `aberration` 字段，WebGL 后端（M2）后实现消费，中间态数据不丢。
- **`base` 继承**：iOS 28 若与 27 相差 10%，风格包只需声明差异通道字段，深合并到 base。新版本接入成本从"复制全表"降到"差异声明"。
- **fallback 风格 `basic`**：core 内置极简安全网（约 20 行数据），保证未注册任何风格包时框架可用（solid 级观感）；真实风格永远来自风格包。

## 4. 包结构与依赖方向

```
packages/
  core/                      # 契约 + registry + resolve（零风格数据，除 basic fallback）
  styles/
    ios26/                   # @et4proj/liquid-glass-style-ios26（M0 数据迁出）
    ios27/                   # @et4proj/liquid-glass-style-ios27（主要方向，含校准迭代）
  web/ vue/ ...              # 消费 GlassTokens.<channel>
```

依赖方向（不违反架构 §3.2）：

```
style 包 → core（仅类型 + registerStyle）
后端/绑定层 → core；聚合包 @et4proj/liquid-glass → core + 官方风格包（re-export + auto-register）
```

注册两种姿势（显式优先，符合用户偏好）：

```ts
// 显式（推荐，tree-shakable）
import { registerStyle } from '@et4proj/liquid-glass-core'
import { ios27 } from '@et4proj/liquid-glass-style-ios27'
registerStyle(ios27)

// 便捷（风格包提供 side-effect 入口）
import '@et4proj/liquid-glass-style-ios27/auto'
```

## 5. resolve / buildTokens v2 算法

```
输入 config.style → resolveStyle() 得 StylePack（含 base 链解析与深合并缓存）
每通道：
  1. 取 stops[lo], stops[hi]（强度 t 的分段，语义档精确命中锚点）
  2. interpolate(lo, hi, seg)（缺省规则：数值线性 / 非数值就近）
  3. 合并 static（静态优先级低于 stops 结果？否——static 是"无 stops 字段"的兜底，
     stops 派生值覆盖同名字段）
  4. surface.material 维度：material 通道按 MaterialPreset 分别提供 static（现状行为保持）
输出 GlassTokens（通道化）
覆盖链不变：surface.declaration > rules > roles > config > 风格包
advanced v2：`advanced: { material: {...}, refraction: {...} }` 通道级逐字段覆盖（原扁平 advanced 废弃）
```

## 6. 消费者映射

| 消费者 | 读取通道 | 现状 | 增量 |
|---|---|---|---|
| css-backend | `material` | ✅ 零改动（形状冻结） | — |
| svg-backend | `material` + `refraction.strength/ior/bezelWidth` | 现读 `tokens.refraction` | 改读 `refraction.strength`；ior/bezel 从硬编码常量改为消费通道值 |
| WebGL 后端（M2） | `refraction`（全字段 + aberration/rimLight） | 未实现 | 通道数据已就绪 |
| TabBar 增强件（M1） | `motion`（弹簧参数） | 硬编码在增强件 | 规格参数（attraction 0.4 等）落入 ios27 风格包 motion 通道 |
| 小程序后端（M3） | 可新增 `x-mp` 通道 | 未实现 | 风格包先行、core 透传 |

## 7. 扩展剧本（验证架构）

**iOS 28 发布**：
```
pnpm workspace 新建 styles/ios28 → 声明 base: 'ios27' + 差异字段 → registerStyle
core/web/vue 零改动；用户 config.style: 'ios28' 即用
```

**WebGL 色差落地（M2）**：ios27 风格包 refraction 通道加 `aberration: 0.08` → webgl-backend 读取；css/svg 路径忽略该字段，无害。

**交互参数调优**：只改 ios27 包 motion 通道数据，发 `@et4proj/liquid-glass-style-ios27@0.x+1`，core 不动。

## 8. 迁移步骤（建议 4 步，均小步可验证）

1. **core 通道化**：`tokens.ts` 重写为 registry + ChannelDef + GlassTokens；`resolve` 输出 `plan.tokens.material`（MaterialTokens 形状不变）+ 透传通道；`solidTokens` 数据化进 StylePack.solid；内置 `basic` fallback。测试重写（当前中断的 6 个旧值断言测试直接按 v2 结构写）。
2. **风格包拆出**：`packages/styles/ios26` + `packages/styles/ios27`（workspace 包，暂不发 npm）；两包测试断言各自数据形状。
3. **web 侧切换**：svg-backend 改读 `tokens.refraction.strength`（Snell 贴图逻辑不动）；css-backend 零改动验证。
4. **文档与知识库**：架构文档 §5 改写为通道模型；m0-core.md/m1-web.md 同步；AGENTS 决策表 + 仓库地图更新。

## 9. 决策点（附推荐）

| # | 决策点 | 推荐 | 备选 |
|---|---|---|---|
| D1 | core 是否内置 fallback 风格 | **内置极简 `basic`**（未注册时可用，约 20 行数据） | 零内置（未注册即报错/全 solid，更纯粹但对新手不友好） |
| D2 | 兼容旧扁平 `plan.tokens` | **不兼容**（项目未发布无包袱，一步到位 `plan.tokens.material`） | 顶层 getter 兼容层（多一层歧义） |
| D3 | 风格包即刻独立 npm 包 or 先 workspace 目录 | **先 workspace**（结构就位，发布等 M1 聚合包时一起定） | 立刻发布（校准未完成，发版噪音） |
| D4 | 通道校验严格度 | **宽松**（未知通道/未知字段透传不报错，dev 警告） | 严格 schema 校验（安全但阻碍风格包先行） |
| D5 | motion 通道是否进 v2 首版 | **进**（类型占位 + ios27 数据落 motion；增强件 M1 末接入） | 等 M1 增强件时再加（类型返工） |

## 10. Token 形态与投影（三层分离，2026-10-15 补充）

**CSS 变量不是 token 的形态，只是投影之一**。三层各自定位：

```
定义层   风格包 StylePack ──── TS/JS 模块（可独立发布）
运行时层 GlassTokens ──────── JS 对象（唯一权威，平台无关）
投影层   CSS 变量（css 后端）· uniforms（webgl）· JS 直消费（小程序）· JSON（bridge）
```

| 形态 | 定位 | 关键边界 |
|---|---|---|
| JS/TS 对象 | 运行时权威 + 风格包源码 | 唯一能表达 `interpolate` 函数的形态 |
| JSON | 交换格式 | 配置文件（`liquid-glass.config.json`）/ 风格远程下发 / M4 bridge |
| CSS 变量 | DOM 渲染投影 | 运行时可变、级联可覆盖、per-element 隔离；仅扁平标量 |
| 静态 CSS | 编译期投影 | unplugin L0 产物；不能动态 |
| uniforms | WebGL 投影 | M2 |

**硬约束：StylePack 的 channels 数据必须 JSON-safe**（纯数据，可序列化远程下发），`interpolate` 是唯一非序列化的可选增强。通道对象进 CSS 语境按 `--glass-<channel>-<field>` 拍平（如 `--glass-refraction-strength`），仅投影消费方需要的字段。

## 11. 风险

- **注册时序**：SSR/早注册场景，`resolveStyle` 在注册前被调用 → resolve 层缓存 fallback 结果，注册后 invalidate（runtime 已有全量重渲染机制，天然支持）。
- **深合并语义**：`base` 继承 + 通道覆盖的合并规则需要测试锚定（数组是替换不是拼接）。
- **文档漂移**：通道 id 是新的对外契约（风格包作者视角），架构文档需立"通道注册表"章节作为唯一权威清单。
