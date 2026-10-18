# M2 · Vue 线路第一波落地：vue 绑定层 + adapter-vant + vant 演示

> 日期：2026-10-18 ｜ 状态：已落地，全量 build/test/typecheck/E2E 绿 ｜ 设计依据：[react-binding-design](../proposals/react-binding-design.md)（绑定层语义蓝本）· [adapter-system-design](../proposals/adapter-system-design.md) · [playground-federation-design](../proposals/playground-federation-design.md)

## 范围与产出

| 包/应用                 | 内容                                                                                                                                                                                                                                                   | 测试                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `packages/vue`          | **绑定层**：`liquidGlassVue` 插件（app.use + provide GLASS_KEY + v-glass 指令注册）/ `GlassSurface`（defineComponent + h 的 .ts）/ `useGlass` / `useGlassSurface`（template ref 版），语义对齐 react 绑定层（惰性创建/幂等注册/声明变化重挂/SSR 安全） | 7                       |
| `packages/adapter-vant` | **Vant 4 数据包**：6 条 surfaces（Tabbar/NavBar/Popup/Dialog/Toast/Switch）+ tokenMap 3 条别名 + 3 组 patches；纯 JSON-safe、无 auto 入口                                                                                                              | 6                       |
| `playground/vant`       | **演示包**（@et4proj/liquid-glass-playground-vant）：standalone（main.ts 自建 runtime）+ MF remote（remote.ts 挂载协议，`liquid_glass_vant`:5176）双模式；消费构建产物（R9 同 antd）                                                                   | typecheck/build + E2E 4 |
| `playground/entry`      | 目录壳 vant 卡片 + DemoCenter 升级为**双 remote 分派**（antd/vant 按库切 MF 名与前导策略；Vue remote 无 react preamble）                                                                                                                               | 手动/E2E                |
| `e2e/vant.spec.ts`      | vant 演示发布链路 4 用例（对齐 antd spec 断言链），Playwright webServer 增 :4176 preview                                                                                                                                                               | 4                       |

## API 速查

```ts
// vue 绑定层（packages/vue）
import { liquidGlassVue, GlassSurface, useGlass, useGlassSurface } from '@et4proj/liquid-glass-vue'

app.use(liquidGlassVue, { config })          // 插件：provide + v-glass 指令注册；probe/backends 缺省 web + [svg, css]
const glass = useGlass()                     // GlassRuntime | null（插件外 null；首个消费者调用时惰性创建，setup 同步即有值）
const { el, id } = useGlassSurface(decl)     // template ref 版：el 挂载注册/卸载注销（幂等）；声明变化 → unregister + re-register
                                             // 接受响应式 getter：useGlassSurface(() => decl.value)
<GlassSurface as="nav" role="bar" :shape="{ kind: 'capsule' }">…</GlassSurface>
<nav v-glass="{ role: 'bar' }">…</nav>       // 指令版（声明变化 updated 钩子重挂；空值 no-op）
ctx = inject(GLASS_KEY)                      // { ensureRuntime(), runtime, dispose() }——Vue 无 app 卸载钩子约定，dispose 显式调用

// vant 适配（packages/adapter-vant）
import { vantAdapter } from '@et4proj/liquid-glass-adapter-vant'
const handle = applyAdapter(runtime, vantAdapter)
```

## 与 react 绑定层的语义对齐与差异

| 语义点        | react（GlassProvider）                           | vue（liquidGlassVue 插件）                                                | 说明                                          |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------- |
| 惰性创建      | Provider render 期（首帧即有值）                 | 首个消费者调用 ensureRuntime（setup 同步）                                | createGlass 构造期零浏览器 API，两端 SSR 安全 |
| 声明变化重挂  | useEffect 无依赖数组 + sameDecl 浅比较           | watch(getter) + sameDecl 浅比较（shape 特判一层）                         | KISS：不做原地更新，unregister + re-register  |
| 幂等注册      | ref callback detach/attach + register 同元素幂等 | watch(el) + unmount 期 onUnmounted 兜底（unmount 时 watch 已停止）        | StrictMode 双挂载在 Vue 无对应场景            |
| 外部 ref 合并 | useMemo 稳定合并（否则无限重挂）                 | Vue template ref 天然稳定，无合并需求                                     | Vue 的响应式系统消除了 React 的此坑           |
| 卸载          | useEffect cleanup 自动 dispose                   | **不自动 dispose**（Vue 3 无 app 级卸载钩子约定），ctx.dispose() 显式调用 | 显式优于隐式（项目既有决策取向）              |
| config 更新   | config prop 引用变化 → updateConfig              | 插件 options 是一次性初始化；后续走 `useGlass().updateConfig(...)`        | app.use 是 Vue 惯例的一次性初始化             |
| 运行时形态    | 单一 runtime（Provider 持有）                    | 同一（插件闭包持有）                                                      | ——                                            |

## vant tokenMap 的映射策略（与 antd 的关键差异）

antd-mobile 的组件底色直接引用**全局变量**（`--adm-color-background` 挂 :root），别名注入 `:where(.lg-surface)` 后经"元素直接定义胜过 :root 继承"生效。**Vant 不同**：组件背景走**组件局部变量**（`--van-tabbar-background` 等定义在组件根类上，特异性 0,1,0 > `:where` 的 0,0,0，别名无法直接压过），但其值全部 fallback 到全局层 `--van-background-2`（定义在 :root）。

因此 vant 的映射目标是**全局 fallback 层**，沿 var() 引用链生效：

```
.van-dialog 元素（带 .lg-surface）：
  --van-dialog-background = var(--van-background-2)   ← vant 原定义（0,1,0 直接定义，胜）
  --van-background-2 = var(--glass-tint)               ← 别名注入（0,0,0 但直接定义，胜过 :root 继承）
  ⇒ --van-dialog-background 解析为玻璃着色 ✓
```

- tokenMap 3 条：`--van-background-2 → --glass-tint`（组件实底 fallback 源头）、`--van-border-color → --glass-border`、`--van-primary-color → --glass-tint`（switch on 态 `--van-switch-on-background` 引用它）
- **直接值底色不走变量链**，必须 patches 覆盖：Toast（`rgba(0,0,0,.7)` 深底，overlay-transparent 交玻璃接管）、Switch off 态（`rgba(120,120,128,.16)`，`.lg-surface.van-switch` 以 0,2,0 压 0,1,0 局部定义）
- 变量清单从 vant 4.10.2 源码 `lib/style/css-variables.css` + `lib/<comp>/index.css` 实证提取（同 antd 的源码实证法，2026-10-18）

## 决定表（编号续 m1-react-line.md）

| #   | 决定                                                                                                           | 原因                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | vue 绑定层用**插件形态**（app.use + provide）而非 Provider 组件                                                | Vue 无 children-props 模式；插件 install 是 Vue 惯例的应用级注入点，ctx（ensureRuntime/runtime/dispose）经 InjectionKey 类型化 provide/inject                                                                                            |
| 23  | `useGlassSurface` 返回 **template ref**（`{ el, id }`），watch(el) 驱动注册/注销                               | 对应 React 版的 ref callback；Vue 的 template ref 天然稳定（无 React"每 render 新 ref → 无限重挂"坑），`onUnmounted` 兜底注销（unmount 期 watch 已停止）                                                                                 |
| 24  | `GlassSurface` 用 **defineComponent + h 的纯 .ts**（非 SFC）                                                   | 避免 SFC 编译链进库构建（vite-plugin-dts 对 SFC 产 d.ts 需 vue-tsc 通道）；react 版同理由用 .tsx                                                                                                                                         |
| 25  | v-glass 指令**空值 no-op**（`v-glass="null"` 安全跳过）                                                        | 运行时值可能是空（条件绑定），与"插件外 useGlassSurface no-op"同一安全语义                                                                                                                                                               |
| 26  | 插件**不自动 dispose**：Vue 3 无 app 级卸载钩子约定（3.5 的 `app.onUnmount` 不覆盖全版本），ctx.dispose() 显式 | 显式优于隐式（项目既有决策取向）；长生命周期 SPA 语义下 runtime 与 app 同寿命即正确                                                                                                                                                      |
| 27  | vant adapter 的 tokenMap 映射**全局 fallback 层**（--van-background-2），不映射组件局部变量                    | 局部变量定义在组件根类（特异性 0,1,0），`:where(.lg-surface)`（0,0,0）压不过；映射 :root 全局层后经"元素直接定义胜过继承"沿 var() 链生效（详见上节链路图）                                                                               |
| 28  | vant demo 里 **vue 绑定层 runtime 与 adapter runtime 双轨并存**（各自 createGlass）                            | 绑定层 v1 语义：插件自持 runtime（GlassSurface 演示卡用）；adapter runtime 由入口注入（standalone 自建 / remote 取 host 的）。两 runtime 均消费同一风格注册表与默认配置，视觉一致；统一注入点留待 v2（插件 options 加 runtime 复用入口） |
| 29  | vue 包构建 external `/^vue($                                                                                   | \//`（同 react 包 #21 教训）                                                                                                                                                                                                             | peer 不显式 external 会内联 vue 运行时 → 双 Vue 实例（provide/inject 上下文与指令集互不可见） |
| 30  | vant 演示的 **@mf-types 过渡断言**（DemoCenter 收敛 DemoRemote 最小形状，string 重载退化 any）                 | vant remote 的 dts 待其 dev server 首跑流转（workbench 同款过渡策略，§4.1）；antd 通道保持 @mf-types 推导不动                                                                                                                            |
| 31  | DemoCenter 升级为**双 remote 分派表**（REMOTE_OF/PORT_OF/PLATFORM_OF），react preamble 仅 antd 分支 await      | Vue remote 无 react-refresh 前导需求；分派表让新增库只加一行（P3 nutui/tdesign 直接受益）                                                                                                                                                |
| 32  | vant demo 消费 vant 样式 `vant/lib/index.css` **全量引入**（bootstrap.ts 双模式共用）                          | demo 从简；产品侧可用 unplugin-vue-components 按需（knownIssues 不涉）                                                                                                                                                                   |
| 33  | VTU 单测需 `attachTo: document.body`                                                                           | @vue/test-utils 默认挂 detached div，`document.querySelector` 查不到；对齐 RTL 的"渲染进 document"语义                                                                                                                                   |

## 挂载协议（playground-federation-design §4 落地形态，Vue 系）

```ts
// playground/vant/src/remote.ts —— 唯一远程出口（exposes './app'）
export function mount(el: HTMLElement, ctx: DemoHostContext): void; // ctx.runtime = host runtime；插件 config 取 ctx.config
export function unmount(): void; // app.unmount + detachAdapter
```

- dev 编排：`pnpm playground:vant`（5176 standalone）或 `pnpm playground:all`；host（5173）目录选"vant 演示"→ DemoCenter `initial-library="vant"` 锁定挂载。
- Vue remote 无前导；vue 不进 shared（与 workbench 一致）：独立 vue 实例 createApp 挂 el 无碍。
- entry 侧 `liquid_glass_vant` remote 以 `type: 'module'` 声明（#19 同款，dev remoteEntry 是 ESM）。
- E2E（2026-10-18）：preview :4176 发布链路 4 用例绿——style 单例 / GlassSurface+Tabbar 双 surface / Switch 交互 / Dialog 弹层别名链（`--van-background-2` 与 `--glass-tint` 同值，Chromium computed 替换 var() 特性复用 antd 的断言策略）。

## 遗留（下一步）

- **绑定层 runtime 复用入口**：插件 options 增加 `runtime?: GlassRuntime` 传入（决定表 #28 的 v2 统一），供宿主把绑定层与 adapter 挂同一 runtime
- vant `@mf-types` 流转后撤 DemoCenter 的过渡断言（#30；vant dev server 首跑后 @module-federation/dts-plugin 自动生成）
- Switch/Toast 玻璃化观感真机打磨（knownIssues：Toast 深底白字对比度、switch on 态着色在深色背景）
- React 系 P3：adapter-nutui / adapter-tdesign（DemoCenter 分派表 #31 已为其铺路）
- P4：unplugin + Vite 插件、胶囊 TabBar 增强件
- 真机验收：用户明天统一验所有 adapter 实现（antd-mobile + vant）
