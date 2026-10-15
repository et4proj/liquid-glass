# M1 实现文档（一）：glass-web

> 状态：已完成 ｜ 包：`@et4proj/liquid-glass-web` v0.1.0 ｜ 对应架构文档 §4、§6
>
> 验收：单元测试 28/28（css-backend 6 / svg-backend 11 / runtime 7 / discovery 4）；playground 真实运行时面板浏览器验证通过。
>
> 覆盖范围：Web 探针、CSS 渲染后端、SVG 折射后端、交互动效（高光跟随 + 按压回弹）、createGlass 运行时、data-glass 声明式发现。适配包 / 构建插件 / 增强件见后续 M1 文档。
>
> token v2 迁移：后端改为消费通道化 token（css 读 `plan.tokens.material`，svg 读 `tokens.refraction` 通道），测试按 ios27 校准值重写（devDependency `@et4proj/liquid-glass-style-ios27`，测试内注册）。

## 源文件结构

```
packages/web/src/
  probe.ts        # createWebProbe / detectWebCapabilities
  css-backend.ts  # createCssBackend + ensureGlobalStyle + tokensToCssVars + 交互动效（css/svg 共用）
  svg-backend.ts  # createSvgBackend：边缘透镜折射（feImage 置换贴图 + feDisplacementMap）
  runtime.ts      # createGlass（GlassRuntime / SurfaceHandleApi）
  discovery.ts    # parseDataGlass / mountDiscovery
```

依赖：`@et4proj/liquid-glass-core`（dependencies，非 peer——内部包直接依赖，M1 简化）。测试环境 happy-dom。

## API 速查

### 探针（probe.ts）

```ts
createWebProbe(): PlatformProbe          // detect 同步返回（Promise 包装由运行时处理）
detectWebCapabilities(): Capabilities    // 也可单独调用

// 探测逻辑：
// engine: UA 检测（注意 iOS 上的 Chrome 也是 webkit；edgios 是 webkit）
// os/osVersion: iphone|ipad → ios；android → android；其余 desktop
// backdropFilter: CSS.supports('backdrop-filter' / '-webkit-backdrop-filter')
// backdropFilterWithSvg: 仅 blink（架构 §12，Safari/Firefox 保守 false）
// webgl2: canvas.getContext('webgl2') 试探
// nativeGlass: web 平台恒 false（混合应用由 bridge 提供探针）
// a11y: matchMedia 三个 prefers-*；device.tier: dpr+cores 粗分
// subscribe: 监听 prefers-* 变化（兼容旧 Safari addListener）
// 全部环境防御：SSR / 缺 API 不抛错，返回保守值
```

### CSS 后端（css-backend.ts）

```ts
createCssBackend(): GlassBackend<HTMLElement>
// tier 'css'；solid/none 档也由它渲染（token 已是降级形态）
// mount: ensureGlobalStyle() + 加 .lg-surface class + 写 --glass-* 内联变量
// update: 刷新变量；pause/resume: 切 .lg-paused（backdrop-filter: none 降开销）
// unmount: 幂等（React StrictMode 安全），清 class + 变量

ensureGlobalStyle(doc?): void      // 单例注入 <style id="liquid-glass-web-style">，幂等
tokensToCssVars(t: MaterialTokens): Record<string, string>  // material 通道 → --glass-* 映射（架构 §4.1）
applyPlan(el, plan): void          // token v2：读 plan.tokens.material（形状冻结，零逻辑变化）
SURFACE_CLASS = 'lg-surface'       // PAUSED_CLASS = 'lg-paused'
```

全局样式要点：`backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation))`；`::before` 顶部 135° 高光渐变（`--glass-highlight` 驱动）；`box-shadow` 三层叠加（投影 + 上下内描边高光）。

**交互动效（css/svg 后端共用）**：`plan.interactive` 驱动 `.lg-interactive` class——`:active` 弹性回缩（cubic-bezier 回弹曲线）、`::after` 指针跟随径向高光（pointermove 更新 `--glass-px/--glass-py`，`createInteractiveTracker` 管理监听器挂摘）。

### SVG 折射后端（svg-backend.ts，tier 'svg'）

```ts
createSvgBackend(): GlassBackend<HTMLElement>
// supports: backdropFilter && backdropFilterWithSvg（仅 Chromium，架构 §12）
// 原理：feImage（边缘置换贴图，R/G 通道 = x/y 偏移，128 = 中性）+ feDisplacementMap
//       位移背景像素 → 中心不动、边缘内收的透镜折射；再串联 blur/saturate
// backdrop-filter: url(#lg-refraction-<surfaceId>) blur(var(--glass-blur)) saturate(var(--glass-saturation))
// token v2：折射参数消费 refraction 通道——strength → displacement scale(0..42px 短边自适应)、
//           ior / bezelWidth 参与 Snell 贴图生成（缺省 1.5 / 0.18）
// 贴图与曲线按 (ior, bezel) 缓存；scale/ior/bezel 任一变化时重建滤镜
// color-interpolation-filters: sRGB（默认 linearRGB 会偏移中性灰导致整体平移）
// pause 时显式置 none（内联优先级高于 .lg-paused 类规则）；unmount 移除滤镜节点防泄漏

displacementCurve(d, ior = 1.5): number   // 1D 位移曲线（导出，纯函数可测）
refractionToScale(strength, w, h): number // 强度 → 位移像素（导出，纯函数可测）
```

暗化边缘说明：ios27 风格的 `shadow` 含 `inset 0 0 0 1px` 暗环（WWDC26 "darkened edge"），由全局样式的 `box-shadow: var(--glass-shadow), ...` 多层叠加自然渲染，后端无需分支。

### 运行时（runtime.ts，架构 §6）

```ts
createGlass<T>({ config?, probe, backends }): GlassRuntime<T>

glass.register(target, declaration): SurfaceHandleApi  // 同 target 重复 register 返回同一句柄
glass.updateConfig(partial)                            // 浅合并历史 config，全部表面重渲染
glass.debug.explain(target) / .caps / .config / .surfaces
glass.dispose()

handle.refresh() / .pause() / .resume() / .unregister()
```

关键语义（M1 决定）：

- **异步初始化**：probe.detect 完成前 register 排队，完成后 flush；探针失败保持无渲染（安全缺省）
- **后端选择**：取 tier 不高于 plan.tier 的最高档后端（css 后端可渲染 solid 档 token）
- **none 档**：不挂后端（no-op），已有实例卸载
- **预算视角**：按注册顺序"先到先得"，每个表面 resolve 时的 `activeSurfaces` = 自己的顺位（含自己）；unregister 后其余表面重算（靠前者可回升档位）
- **能力变化**：probe.subscribe 回调 → 全量重渲染（如系统开启"降低透明度"实时降 solid）

### 声明式发现（discovery.ts）

```ts
parseDataGlass(el): SurfaceDeclaration | null   // data-glass / -shape / -radius / -intensity / -material / -group / -max-tier / -interactive
mountDiscovery(glass, root?): DiscoveryHandle   // 初始扫描 + MutationObserver（childList subtree）增删自动注册/注销
```

## 实现决定（含对 core 的修正）

| # | 决定 | 背景 |
|---|---|---|
| 1 | **core budget 语义修正**：`activeSurfaces > maxSurfaces` 才降档（原 `>=`） | `maxSurfaces` 语义 = 最多 N 个同时全效；运行时把"顺位"传给 resolve 后边界自然成立 |
| 2 | core `exports` 修正：产物名 `liquid-glass-core.js/.cjs`（原误写 `index.js`） | web 构建时 rolldown 解析失败暴露 |
| 3 | 运行时预算"先到先得"：超预算按注册顺序降档，而非随机/全部 | 简单可预期；LRU 摘除仍留待后续（AGENTS 决策表既有条目） |
| 4 | css 后端同时服务 css/solid/none 档的渲染 | token 形态已含降级信息，后端无需分支 |
| 5 | 全局样式运行时单例注入（而非仅构建期产物） | glass-web 可脱离构建插件独立使用 |
| 6 | SVG 折射提前到 M1（原计划 M2） | 用户反馈"只见磨砂、不见液态"；折射是液态感的核心，先行落地 Chromium |
| 7 | 交互动效（高光跟随 + 按压回弹）由 `plan.interactive` 驱动，内置于后端 | 架构 §5.3 交互形变的一环；reducedMotion 时 resolve 已置 interactive=false 自动关闭 |
| 8 | **token v2 消费切换**：css 后端读 `plan.tokens.material`（形状冻结，零逻辑变化）；svg 后端读 `tokens.refraction` 通道（strength/ior/bezelWidth），Snell 贴图逻辑不动、参数化 (ior, bezel) 缓存 | 风格包可调折射物理参数；提案 §6 消费者映射 |

## 测试覆盖

- `css-backend.spec.ts`（6）：样式注入幂等、mount 变量（ios27 校准值）、update 刷新、pause/resume、unmount 幂等、supports 平台检查
- `svg-backend.spec.ts`（11）：displacementCurve 单调性/正值（Snell）、refractionToScale 短边自适应（上下限/回退基准）、双能力门槛、滤镜注入与 backdrop-filter 链、scale 随强度重建、ior/bezelWidth 变化触发滤镜重建（token v2）、pause 显式置 none、unmount 清理幂等、interactive class
- `runtime.spec.ts`（7）：无后端安全、css 渲染 + updateConfig、重复 register 幂等、unregister 触发 budget 重算、能力变化重渲染、disable → none、dispose
- `discovery.spec.ts`（4）：parseDataGlass 全属性/非法值、动态增删注册注销、dispose

测试默认风格 ios27（`registerStyle(ios27)` 顶部注册，devDependency 风格包）。core 测试同步：46 → 57（token v2 通道化重写）。

## 构建

产物 `dist/liquid-glass-web.js`（ESM，含 svg 折射后端）+ `.cjs` + d.ts。Vite lib mode，测试 happy-dom。

## M1 后续衔接点

- adapter-vant：选择器映射清单消费 `mountDiscovery` + `data-glass` 约定
- unplugin / Vite 插件（L0/L1）：L0 注入编译期 CSS（替代/校验运行时注入）；L1 注入 bootstrap 脚本（createGlass + probe + backend + discovery 一键启动）
- 胶囊 TabBar 增强件：基于 SurfaceHandleApi（pause/resume 支撑滚动降开销）与 `.lg-interactive` 交互动效
- playground 已接入真实运行时面板（`RuntimeDemo.vue`，含 ios26/ios27 风格切换与折射开关），后续适配/增强件演示继续在此扩展
