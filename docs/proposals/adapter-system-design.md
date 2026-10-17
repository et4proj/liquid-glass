# Adapter 体系设计文档：内核 + 三库适配包（v1）

> 状态：设计定稿，待实现 ｜ 日期：2026-10-17 ｜ 上游：[react-line-roadmap.md](react-line-roadmap.md)（P1/P2/P3）
> 架构依据：架构文档 §7 适配层规范（§7.1–§7.7）、§3.2 依赖方向、§14 M1 验收标准
> 涉及包：`packages/adapter`（新，内核）· `packages/adapter-antd-mobile` / `adapter-nutui-react` / `adapter-tdesign-mobile-react`（新，数据包）· `packages/web`（两处扩展）

## 1. 定位与分级

**使命**（架构 §7.7）："新增一个库 / 版本"的成本要足够低——覆盖面是竞争力。三库共享一个内核，库包只带纯数据。

能力分级（对齐 §9.1 接入深度，v1 交付 L0 + L1）：

| 级     | 能力                                                                    | 载体                        |
| ------ | ----------------------------------------------------------------------- | --------------------------- |
| **L0** | 全局 token 桥：`--glass-*` 材质变量别名映射到库的 CSS 变量              | manifest.tokenMap           |
| **L1** | 组件玻璃化：选择器级 Surface 注册 + CSS 补丁（透明底、层叠修复）        | manifest.surfaces / patches |
| **L2** | 增强组件：气泡 TabBar、液态 Switch、按压回弹（**P4 后置，本设计不含**） | react 组件（另文）          |

### 1.1 注入手段模型："效果挂在元素上，而不是组件上"

三方组件库没有原生的玻璃交互（hover 曲面镜、按压回弹），但它们能被注入——核心机制：web 后端的一切增强都是 `register(el, declaration)` 时**给元素挂类 / 挂滤镜**实现的，事件由全局 tracker（document 级捕获，写 `--glass-px/py`）驱动而非给组件绑框架 handler。因此对库组件渲染的 DOM、自有 DOM、以及 MutationObserver 动态发现的弹层完全等价，**不需要库配合、不改库内部**。

按侵入深度分三级递进：

| 级               | 手段                                                                                                                          | 适用场景                                                        | 改动形态                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| **① 声明激活**   | surfaces 声明 `interactive: true` → css-backend 挂 `.lg-interactive` → 指针高光 / 按压回弹 / hover 透镜管线（落地后）自动生效 | 效果加在**组件根**上就够                                        | 纯 manifest 数据，零代码 |
| **② 深入选择器** | surfaces 清单登记组件**内部元素**（如 `.adm-slider-handle`）单独声明                                                          | 效果目标在组件内部更深处（滑块 handle、tab item）               | 仍是纯数据               |
| **③ 组件替换**   | L2 增强组件：渲染自有的增强层（气泡 / 液滴）叠在库组件上，接管该部分渲染与交互；库组件退化为数据源（tab 列表 + active 状态）  | 库内部 DOM 不可注入（选中指示器、动效轨道），或需接管布局（P4） | 真正的 React/Vue 组件    |

两个典型例证：

- **antd-mobile Switch + hover 高光/按压回弹**：走①。manifest 一行 `{ selector: '.adm-switch', declaration: { role: 'control', interactive: true } }`——`.adm-switch` 渲染出来就是 DOM 元素，observer 捕捉 → register → 全局事件自动覆盖。
- **Vant Tabbar + 胶囊气泡**：走③。选中指示器是库内部 div，选择器注入到不了那一层（就算选中也只是给库的 div 玻璃化，做不出液滴跟随）；须由增强组件渲染自有的 `pointer-events: none` 覆盖层，液滴物理内核（ios27-tab-interaction-spec §2.2，平台无关弹簧/squash&stretch）驱动其 transform，文字永不进被过滤子树（§2.3 双层架构，不可妥协项）。

边界说明：hover 曲面镜（指针跟随凸透镜 + 高光）的渲染（SVG 滤镜链）与交互（全局弹簧 tracker）都在 web 层，①②即可覆盖——Chromium 全效、Safari 自动降高光档（降级矩阵已有）；只有"曲面镜要长在库组件不存在的 DOM 上"（Tabbar 气泡、Slider 液态填充）才进入③的 P4 范围。

## 2. 包结构与依赖

```
packages/adapter/                      # @et4proj/liquid-glass-adapter（内核）
  src/
    types.ts          # GlassAdapterManifest 及子类型
    apply.ts          # applyAdapter()：检测 → tokenMap 别名注入 → patches 注入
    discovery.ts      # mountSelectorDiscovery()：类名选择器扫描（委托 web 的 observer 机制）
    index.ts
packages/adapter-antd-mobile/          # 数据包 ×3（结构相同）
packages/adapter-nutui-react/
packages/adapter-tdesign-mobile-react/
  src/
    manifest.ts       # 纯数据：tokenMap / surfaces / patches / knownIssues
    index.ts          # export { xxxAdapter }
```

依赖方向（§3.2）：`adapter-* → adapter → core/web`。数据包**纯 JSON-safe**（对齐风格包纪律，支持未来远程下发）；内核框架无关（`framework` 字段只是元数据，vue/react 数据包同构可用）；react 绑定层与 adapter 正交——demo 中 `<GlassProvider>` 的 runtime 经 `useGlass()` 交给 `applyAdapter`。

## 3. 架构设计

### 3.1 GlassAdapterManifest（§7.2 扩展定稿）

```ts
import type { SurfaceDeclaration } from "@et4proj/liquid-glass-core";

export interface GlassAdapterManifest {
  library: string; // 'antd-mobile'
  versionRange: string; // '^5'（semver 匹配复用 core 的 ~60 行实现）
  framework: "react" | "vue" | "none"; // 元数据：识别用，内核不因它分叉
  platform: "web" | "miniprogram"; // v1 只实现 web 分支
  /** 库存在性运行时检测（数据包内联，如查 body 是否出现库的标记 class）；未命中 → no-op + dev 警告 */
  detect?: () => boolean;
  /** 变量别名映射：目标 = 库变量，来源 = --glass-* 材质变量（见 3.2 注入语义） */
  tokenMap: Record<string, string>; // { '--adm-tab-bar-bg': '--glass-surface-bg' } 形态：库变量 → glass 变量
  surfaces: GlassAdapterSurface[];
  /** CSS 补丁：透明底、层叠上下文修复等（id 幂等） */
  patches?: GlassAdapterPatch[];
  knownIssues?: string[]; // §7.7：已知问题列表，接入端可读
}

export interface GlassAdapterSurface {
  selector: string; // 库类名选择器，manifest 顺序即优先级
  declaration: SurfaceDeclaration; // role / shape / interactive / priority
  overlay?: boolean; // 挂 body 的弹层（v1 仅语义标记，用于验收清单）
}

export interface GlassAdapterPatch {
  id: string; // 注入幂等 key：`liquid-glass-adapter-<library>-<id>`
  css: string; // 注入 <style> 的内容（scoped 逻辑由内容自带 :where()）
}
```

### 3.2 tokenMap 注入语义（本设计的关键决策）

**别名而非拷贝**：不把 `--glass-*` 的**值**复制给库变量，而是生成 CSS 别名规则——库变量永远是 `var(--glass-xxx)` 的引用：

```css
/* applyAdapter 生成并注入（幂等 style 标签），作用域与 --glass-* 完全一致 */
:where(.lg-surface) {
  --adm-tab-bar-bg: var(--glass-surface-bg);
  --nut-tabbar-color: var(--glass-tint);
}
```

由此获得三个性质：

1. **自动跟随**：`updateConfig`（换风格 ios26↔ios27、调强度）后 css-backend 重写 `--glass-*`，库变量零成本跟随，adapter 不重注入。
2. **弹层继承不断链**：`--glass-*` 由 css-backend 写在 `.lg-surface` 元素自身（runtime register 时逐表面投影），别名规则同作用域 `.lg-surface`——弹层 surface 挂 `document.body` 也不受影响（变量长在表面根上，不依赖 DOM 祖先）。**这是 overlay 问题的解法，落在内核而非三库各自打补丁。**
3. **声明作用域最小**：`:where(.lg-surface)` 零特异性（specificity 0），不打架库自身样式；未玻璃化的组件完全不受别名影响。

### 3.3 选择器发现（web 包扩展，P0 实现）

现状：web 的 `mountDiscovery` 只认 `data-glass` 属性。新增**声明源**抽象：

```
声明源 = data-glass 属性（已有） | selector manifest（本设计新增）
```

```ts
// packages/web/src/discovery.ts 新增导出（机制复用：MutationObserver + 防抖批处理 + 断连清理）
export function mountSelectorDiscovery(
  runtime: GlassRuntime<HTMLElement>,
  options: { surfaces: GlassAdapterSurface[]; root?: ParentNode },
): DiscoveryHandle;
```

- 匹配：`el.matches(selector)`，一次 DOM 变更批处理内对所有 selector 求值；同一元素命中多条时按 **manifest 顺序先到先得**（首条生效），数据包编写时保证选择器互斥（内核用单测覆盖重叠告警）。
- 动态弹层：弹层节点插入 body → observer 捕捉 → matches → register，天然覆盖 overlay。
- `DiscoveryHandle.dispose()`：反注册 + observer 断开（adapter dispose 时级联）。

### 3.4 工作流程（applyAdapter 全时序）

```
用户 bootstrap（react-demo 的唯一接入文件）：
  const glass = useGlass()                        // 或自建 runtime
  const handle = applyAdapter(glass, antdMobileAdapter)
  return () => handle.dispose()                   // 热更新/卸载安全

applyAdapter(runtime, manifest) 内部：
  1. detect?() === false → console.warn(knownIssues) + 返回 no-op handle（库未安装，静默失败）
  2. 注入 tokenMap 别名样式（幂等 style 标签，id = library 名）
  3. 注入 patches 样式（逐 patch 幂等）
  4. mountSelectorDiscovery(runtime, { surfaces }) → 存 handle
  5. 返回 GlassAdapterHandle { dispose(), refresh() }
     dispose：observer 断开 + 反注册已登记 surface + 摘除注入的 style 标签
     refresh：手动全量重扫（一般不需要；给 SSR 水合后 / 特殊挂载场景兜底）
```

## 4. 三库数据包设计

### 4.1 共性组件集（架构 §7.4）与 Surface 初稿

三库组件结构同源（TabBar / NavBar / Popup / Dialog / Toast / Switch / Slider / 分段控件），manifest 骨架一致，差异只在类名前缀与少量补丁。**选择器初稿**（实现时以各库当前版本 DOM 实测核实，标注核实日期）：

| 组件        | antd-mobile v5      | NutUI React        | TDesign React     | SurfaceDeclaration                            |
| ----------- | ------------------- | ------------------ | ----------------- | --------------------------------------------- |
| TabBar      | `.adm-tab-bar`      | `.nut-tabbar`      | `.t-tab-bar`      | `{ role: 'bar', shape: { kind: 'capsule' } }` |
| NavBar      | `.adm-nav-bar`      | `.nut-navbar`      | `.t-nav-bar`      | `{ role: 'bar' }`                             |
| Popup       | `.adm-popup`        | `.nut-popup`       | `.t-popup`        | `{ role: 'sheet', overlay: true }`            |
| Dialog      | `.adm-dialog`       | `.nut-dialog`      | `.t-dialog`       | `{ role: 'sheet', overlay: true }`            |
| Toast       | `.adm-toast`        | `.nut-toast`       | `.t-toast`        | `{ role: 'chip', overlay: true }`             |
| Switch      | `.adm-switch`       | `.nut-switch`      | `.t-switch`       | `{ role: 'control', interactive: true }`      |
| Slider      | `.adm-slider`       | `.nut-slider`      | `.t-slider`       | `{ role: 'control', interactive: true }`      |
| ActionSheet | `.adm-action-sheet` | `.nut-actionsheet` | `.t-action-sheet` | `{ role: 'sheet', overlay: true }`            |

SurfaceDeclaration 细节（shape/priority/intensity 覆盖）由 **ios27 校准值**驱动（refraction/material 通道默认即风格包值），manifest 不重复写数值——只写结构语义，效果归 token 体系。这是"token v2 与 adapter 正交"的边界。

### 4.2 tokenMap 初稿与核实流程

tokenMap 方向：**库变量 → glass 变量**（值引用）。各库变量清单实现时对照官方 CSS 变量文档核实（架构 §7.3 警告过变量名漂移）。示例（antd-mobile，待核实）：

```ts
tokenMap: {
  // 列表/弹层背景走玻璃表面色（透明度交给 --glass-* 侧）
  '--adm-color-background': '--glass-surface-bg',
  // 弹层圆角跟随玻璃形状 token
  '--adm-popup-border-radius': 'var-shape:' ...  // 非变量类 token 不进 tokenMap——
}
```

规则（写入 manifest 校验单测）：tokenMap 的 value 必须以 `--glass-` 开头（只别名材质变量）；圆角/尺寸类映射不进 tokenMap（属 patches CSS 范畴或 L2 增强）。

### 4.3 patches 初稿（每库预计 1–3 条）

- 透明底：组件默认实底背景改 `transparent`，让玻璃材质透出（`.adm-tab-bar { background: transparent }` 级别的补丁，`:where()` 包裹保持低特异性）。
- 层叠修复：弹层与 surface 的 stacking context 修复（按实测补）。
- 去补丁开关：patches 按 id 可被 manifest 消费端过滤（v1 简化：applyAdapter options.enablePatches?: string[]，缺省全开）。

### 4.4 TDesign 特殊观察项

TDesign 官方仓库有 Tabbar 悬浮胶囊液态玻璃 issue（架构 §2.3）——若官方落地液态玻璃，本库数据包定位调整为"兼容层"（保 L0/L1，官方做 L2），manifest 的 knownIssues 跟踪记录。

## 5. API 设计（packages/adapter）

```ts
export type { GlassAdapterManifest, GlassAdapterSurface, GlassAdapterPatch } from "./types";
export { applyAdapter } from "./apply";
export type { GlassAdapterHandle, ApplyAdapterOptions } from "./apply";

export interface ApplyAdapterOptions {
  root?: ParentNode; // 扫描根，缺省 document.body
  /** 补丁白名单（patch.id），缺省全部启用 */
  enablePatches?: string[];
  /** 供 SSR 水合 / 特殊场景手动触发首扫（observer 也会自动补，此处只是兜底） */
  immediate?: boolean; // 缺省 true（首扫一次 + observer 常驻）
}

export interface GlassAdapterHandle {
  dispose(): void; // 幂等
  refresh(): void; // 全量重扫（跳过已注册）
}

export function applyAdapter(
  runtime: GlassRuntime<HTMLElement>,
  manifest: GlassAdapterManifest,
  options?: ApplyAdapterOptions,
): GlassAdapterHandle;
```

数据包消费侧（react-demo 的 bootstrap.ts）：

```ts
import { applyAdapter } from "@et4proj/liquid-glass-adapter";
import { antdMobileAdapter } from "@et4proj/liquid-glass-adapter-antd-mobile";
// glass 来自 useGlass() 或自建 runtime —— 显式调用，不提供 auto side-effect 入口
const adapter = applyAdapter(glass, antdMobileAdapter);
```

**决定：数据包不提供 auto 副作用入口**（区别于风格包的 auto.ts）——皮肤生效时机与预算行为是业务决策，显式优于隐式。

## 6. 测试策略

1. **内核单测**（Vitest + jsdom）：manifest 校验（tokenMap value 前缀 / surfaces 选择器互斥告警 / JSON-safe 序列化往返）；applyAdapter 幂等（二次 apply 不重复注入）；detect 失败 no-op；dispose 后 style 标签移除 + surface 反注册。
2. **选择器发现单测**：动态插入节点 → register 触发；节点移除 → unregister；同元素多 selector 命中按首条。
3. **弹层链路**：jsdom 模拟弹层挂 body → 注册成功 + `.lg-surface` 内别名变量可解析（getComputedStyle 断言）。
4. **三库数据包**：manifest 快照测试（结构不漂移）+ 与 react-demo 页面的真机验收（M1 标准：iOS Safari、Android WebView，用户自验）。

## 7. 范围边界（v1 不做）

- L2 增强组件（气泡 TabBar / 液态 Switch）——P4 另文设计（Tab 交互规格已备：ios27-tab-interaction-spec.md）。
- miniprogram 分支（`platform` 字段已留位）。
- unplugin 编译期产物（patches/tokenMap 的 CSS 可以构建期预生成，纯优化，P4 与插件一起做）。
- 库版本截图回归基线工具（§7.7 的半自动工具链）——P3 后视三库稳定性决定投入。
- Vue 系库（Vant / NutUI Vue / Varlet）——本线路 React 优先。
