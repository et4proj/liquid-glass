# playground 联邦化设计文档：演示中心（Module Federation 2.0）（v1）

> 状态：设计定稿，待实现 ｜ 日期：2026-10-17 ｜ 上游：[react-line-roadmap.md](react-line-roadmap.md)
> 关联：[react-binding-design.md](react-binding-design.md) · [adapter-system-design.md](adapter-system-design.md)
> 涉及：`playground/entry`（host）· `playground/ant-design-mobile` 等演示包（remote；**playground 为容器目录，每库一包**）

## 1. 目标与定位

playground 升级为**演示中心**：在既有调试台（风格切换 / 强度 / 降级模拟 / Plan 面板）之上，新增"平台 × 三方库"选择器，动态挂载各库的真实组件演示，并让宿主控制台**实时驱动**演示内的玻璃表面。

关键定位：`playground/ant-design-mobile`（@et4proj/liquid-glass-playground-antd-mobile）具**双重身份**——

```
playground/ant-design-mobile (MF remote)
  ├─ standalone：pnpm --filter @et4proj/liquid-glass-playground-antd-mobile dev 独立跑
  │    → 零改动接入验收形态（消费构建产物，最接近用户真实项目）
  └─ remote：被 playground/entry host 动态挂载
       → 调试形态（共享 host 的 runtime 与控制台）
```

## 2. 技术选型与理由

| 项                                    | 决定                                                                                           | 理由                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 联邦机制                              | **Module Federation 2.0**（`@module-federation/vite` 官方插件 + `@module-federation/runtime`） | ① shared singleton：host 与 remote 跑同一份 core/web 代码实例，`updateConfig` 同帧直达演示区 ② remote 天然支持 standalone 双模式 ③ remote 内部框架（React/Vue）对 host 透明 ④ Vite 生态官方路径                       |
| 不用 iframe 系微前端（wujie/qiankun） | —                                                                                              | iframe 隔离过度：控制要走 postMessage 桥、Plan 面板要协议化、跨 iframe 的 backdrop-filter 行为未知；qiankun 对 Vite 支持差                                                                                            |
| 演示区依赖消费                        | remote 消费 core/web/styles 的**构建产物**（正经 workspace 依赖）                              | 源码 alias 直连与 MF shared 单例冲突（两个 dev server 各自编译同一文件 ≠ 同一模块实例）；且消费产物更符合"零改动接入"验收本意。源码级热调由 playground/workbench 工作台承担（其定位即自持运行时的实验室，双实例无碍） |

## 3. 架构总览

```
playground/entry (host, Vue 3, :5173) —— 目录壳：卡片目录 + 常驻导航 + 互斥挂载舞台
  ├─ MF host：remotes 清单 + shared（core/web/styles）
  └─ 演示中心面板（antd-mobile 挂载宿主：矩阵 chips + 迷你控制条 + ctx.runtime 注入）
         ↓ 动态 import remote（remoteEntry / manifest）
playground/workbench (remote, Vue 3, :5175) —— core/web 工作台（自持运行时，alias 直连源码热调）
playground/ant-design-mobile (remote, React 18 + antd-mobile, :5174)
playground/nutui  (remote, P3, :5176)
playground/tdesign(remote, P3, :5177)
（每库一包对称生长于 playground/ 容器目录下；Vue 系库 remote 内部用 Vue，协议不变）

shared singletons：@et4proj/liquid-glass-core / -web / -style-ios27 / -style-ios26
```

同 document 挂载；**互斥策略**（v1）：同一时刻仅激活一个库——三库的 `:root` 变量与 reset 会互染（架构 §2.3），切换流程 `unmount → 等待清理 → mount 下一个`。"三库同屏对比"为 v2 展望（shadow DOM / 沙箱，另行评估）。

## 4. 挂载协议（框架无关，不绑死 MF）

所有 remote 暴露同构约定，与 single-spa 生命周期风格一致：

```ts
// 每个 demo 包的唯一远程出口 src/remote.ts
export interface DemoHostContext {
  /** host 的玻璃 runtime（演示共享宿主实例与全部控制） */
  runtime: GlassRuntime<HTMLElement>;
  /** 挂载模式：'remote'（被 host 挂载）| 'standalone'（自建 runtime 时不会传） */
  mode: "remote";
  /** 玻璃配置快照（mount 时对齐用；后续跟随 host updateConfig） */
  config: GlassConfigInput;
  /** 平台/库标识，demo 内可用于标注（如水印） */
  demo: { platform: string; library: string };
}
export interface DemoRemote {
  mount(el: HTMLElement, ctx: DemoHostContext): Promise<void> | void;
  unmount(): Promise<void> | void;
}
export default {} as DemoRemote; // vite-plugin-federation exposes 的模块
```

- standalone 模式：`src/main.tsx` 自建 `createGlass` + `applyAdapter`，再调同一渲染函数——两条入口共享页面组件，仅 runtime 来源不同。
- remote 模式：`mount` 内直接用 `ctx.runtime` 调 `applyAdapter(ctx.runtime, xxxAdapter)`；host 的风格/强度/无障碍面板调整即时作用于演示区。
- 卸载语义：`unmount` 中必须完成 React root.unmount + `applyAdapter` 句柄 `dispose()` + 自有全局监听清理；**库注入的 style 标签残留可接受**（`--adm-*`/`--nut-*`/`--td-*` 前缀隔离，互不干扰，风险表跟踪）。
- **例外：workbench 工作台 remote 不消费 `ctx.runtime`**（2026-10-17 重组起）。它的定位是 core/web 的实验室——自建 runtime、vite alias 直连 packages 源码（改码即时生效），与 host 是两个模块实例也无碍；`ctx` 对它仅保留协议形状（可空）。其余三方库 demo 维持"消费构建产物 + ctx.runtime 注入"不变。

### 4.1 @mf-types 官方类型通道（2026-10-17 已落地）

- **生成链**（`@module-federation/vite` 内置 DTS 体系）：remote build 产 `dist/@mf-types`；host dev 期（remote dev server 在跑）拉取类型写盘 host 包根 `@mf-types/<remote>/`——含 remote 源码编译的全量签名（`DemoHostContext/mount/unmount`）与 `index.d.ts`（对 `@module-federation/runtime` 的 `loadRemote` 双重载泛型增强）。属产物，已 gitignore。
- **落地形态**（三步 + 两处补丁）：① tsconfig include `@mf-types` + `skipLibCheck: true`（产物 d.ts 内部诊断不外溢）② 挂载改 `loadRemote('xxx/app')`（host 侧手写协议类型与 `@ts-ignore` 删除）③ 显式 devDependencies `@module-federation/runtime@2.9.2`（与 vite 插件依赖对齐）。补丁：a) `@mf-types/liquid_react_demo/apis.d.ts` 残缺（插件 dev 流转曾中断）按 dts-plugin 官方模板手写补齐（4 行，`RemoteKeys`/`PackageType` 语义一致）；b) workbench 类型未流转（其 dev server 未跑过），`loadRemote` 的 `T extends string` 重载自动退化为 `any` 不报错，App.vue 保留 3 行最小 `WorkbenchRemote` 形状作过渡断言（结构化兼容，类型流转后无冲突）。
- **类型生效条件**：antd-mobile demo 的 `mount(el, ctx)` 完整签名已推导生效（`@mf-types/liquid_react_demo` 全量在场）；workbench 待其 dev server 首跑后由插件流转生成（用户操作，无 AI 侧动作）。
- **风险兜底前提**：单测 + E2E 体系就位（见 m1-testing.md）——运行时行为有测试兜底，类型通道切换与 IDE 波动风险可控（2026-10-17 用户确认建立测试体系后执行）。

## 5. 配置清单（完整可选项盘点）

### 5.1 remote 侧（每个 demo app，以 react-demo 为例）

| #   | 配置项                        | 位置                    | 说明 / 默认值                                                                                                                                                    |
| --- | ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `name`                        | vite.config federation  | 远程名，规范 `liquid_<目录短名>`（如 `liquid_react_demo`），全仓唯一，不与包名冲突                                                                               |
| R2  | `filename`                    | 同上                    | 缺省 `'remoteEntry.js'`（不变）                                                                                                                                  |
| R3  | `exposes`                     | 同上                    | `{ './app': './src/remote.ts' }`——唯一出口，页面组件不逐一暴露                                                                                                   |
| R4  | `shared`                      | 同上                    | core/web/styles 两个风格包全部：`{ singleton: true, requiredVersion: false }`（monorepo 同源开发，不严格匹配版本；singleton 保证取 host 实例）                   |
| R5  | `react/react-dom/antd-mobile` | 同上                    | **不进 shared**（host 是 Vue 用不到；remote 自带）                                                                                                               |
| R6  | dev 端口                      | vite.config server.port | **固定约定**：workbench=5175、ant-design-mobile=5174、vant=5176、nutui=5178、tdesign=5179（host 依赖 URL 加载；2026-10-18 vant 落地占 5176，nutui/tdesign 顺延） |
| R7  | `manifest`                    | federation 可选         | MF 2.0 manifest 输出（`mf-manifest.json`），预览/发布形态用；v1 dev 直用 remoteEntry                                                                             |
| R8  | 双入口                        | src                     | `main.tsx`（standalone）/ `remote.ts`（协议出口），共享 `pages/*` 渲染函数                                                                                       |
| R9  | 依赖消费                      | package.json            | core/web/styles 用 `workspace:*`（消费构建产物；改 core 后需 `pnpm build` 同步——turbo 依赖图已保证）                                                             |
| R10 | StrictMode                    | main.tsx                | 开启（绑定层幂等验收硬场景）                                                                                                                                     |

### 5.2 host 侧（playground）

| #   | 配置项             | 位置                        | 说明 / 默认值                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | `remotes`          | vite.config federation      | **对象形式 + `type: 'module'`**：`{ liquid_react_demo: { type: 'module', name: 'liquid_react_demo', entry: 'http://localhost:5174/remoteEntry.js' }, liquid_glass_workbench: { …:5175 } }`（与 R6 端口约定对齐；后续每库一行）。dev remoteEntry 是 ESM（顶层 import + `export { init, get }`），字符串 `'name@url'` 形式按 `type: 'var'` 走 `<script>` 注入会静默 SyntaxError → 容器注册不上（MF Runtime #RUNTIME-001，2026-10-17 实测）  |
| H2  | `shared`           | 同上                        | 与 R4 完全一致（name + singleton + requiredVersion: false）                                                                                                                                                                                                                                                                                                                                                                               |
| H3  | 演示矩阵           | `src/demo-center/matrix.ts` | 平台 × 库的启用清单（见 5.4）                                                                                                                                                                                                                                                                                                                                                                                                             |
| H4  | 挂载互斥           | 演示中心组件                | v1 固定互斥，无"同屏"选项                                                                                                                                                                                                                                                                                                                                                                                                                 |
| H5  | ctx 构造           | 演示中心组件                | mount 前注入：`runtime`（host 单例）+ `config`（当前面板快照）+ `demo` 标识                                                                                                                                                                                                                                                                                                                                                               |
| H6  | 加载形态           | vite.config                 | dev=dev server URL；`pnpm preview`/发布形态=构建产物 manifest（R7）；v1 只承诺 dev                                                                                                                                                                                                                                                                                                                                                        |
| H7  | react-refresh 前导 | `src/react-preamble.ts`     | Vue host 消费 React remote 的 dev 必备：动态 import remote 的 `/@react-refresh` 并**手动三步安装**（`injectIntoGlobalHook(window)` + 定义 `$RefreshReg$`/`$RefreshSig$`），mountDemo 先 `await reactPreambleReady`。注意 `/@react-refresh` 是纯导出模块（import 成功 ≠ 前导就绪）；且**不可写 host index.html 绝对 URL script**——MF 的 `virtual:mf-html-entry-proxy` 会给绝对 URL 拼前导 `/`（→ `import("/http://…")` ERR_ABORTED，实测） |

### 5.3 协议与编排（仓库级约定）

| #   | 配置项        | 位置                        | 说明 / 默认值                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | 挂载协议      | 各 demo `src/remote.ts`     | §4 的 `DemoRemote` / `DemoHostContext`。类型源头在各 remote 的 `remote.ts`（单一定义处）；host 侧已于 2026-10-17 切官方 @mf-types 通道消费（`loadRemote` 泛型自动推导，见 §4.1）；workbench / vant 因类型未流转，DemoCenter 侧收敛 DemoRemote 最小形状断言过渡（vant 2026-10-18，见 m2-vue-line.md 决定表 #30）                                   |
| O2  | shared 版本源 | 各包 package.json `version` | 统一 root 管理（当前 0.1.0）；requiredVersion: false 下升级无感，但 manifest 形态后需一致                                                                                                                                                                                                                                                         |
| O3  | dev 编排      | turbo.json + 根 scripts     | `pnpm playground:all` = 并行启动全部演示包（host + 所有 remote，glob `./playground/*` 自动含新包）；`pnpm playground:<name>` 快捷只起单个包（如 `playground:workbench`、`playground:antd-mobile`、`playground:vant`）；`pnpm playground` 只起 host                                                                                                |
| O4  | 构建顺序      | turbo 依赖图                | demo 依赖 core/web/styles 的 build 产物 → turbo 已按 workspace 依赖拓扑编排，无需额外配置                                                                                                                                                                                                                                                         |
| O5  | 目录形态      | 根                          | **playground 为纯容器目录**（非 workspace 包，glob `playground/*`）：`entry/` = MF host **目录壳**（2026-10-17 二次重组：调试面板移出，只留导航 + 互斥挂载舞台）、`workbench/` = core/web 工作台 remote（自持运行时，alias 直连源码）、`ant-design-mobile/` + `vant/` 等每库一包对称生长（apps/ 已撤销；vant 为首个 Vue 线路 remote，2026-10-18） |

### 5.4 演示矩阵（选择器可选值）

| 平台 \ 库   | antd-mobile                                    | NutUI React | TDesign React | Vant (Vue)                                        |
| ----------- | ---------------------------------------------- | ----------- | ------------- | ------------------------------------------------- |
| web-react   | ✅ P2                                          | ✅ P3       | ✅ P3         | —（Vue 库）                                       |
| web-vue     | —                                              | —           | —             | ✅ 已落地（2026-10-18，`liquid_glass_vant`:5176） |
| miniprogram | 浏览器不可验，选择器置灰并标注"真机预览（M3）" | 同左        | 同左          | 同左                                              |

矩阵中每格 = `{ remote, expose, url }`（来自 5.1 R1/R6）；置灰项点击给出行内说明而非无响应。

## 6. 风险与决策记录

| 风险/决策                                                  | 处置                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dev 下 alias 直连与 shared 冲突                            | 已决策：demo 消费构建产物（R9），源码热调留在 playground 既有面板                                                                                                                                                                                                                                      |
| 库全局样式残留（unmount 后 style 标签不摘）                | v1 接受：三库 CSS 变量前缀天然隔离（`--adm-/--nut-/--td-`）；reset 级冲突若实测出现，则切换时强制备位（v1 兜底手段：切库先 `slot.innerHTML=''`）                                                                                                                                                       |
| MF dev 下 remote 热更链路（remote 改码 → host 里看效果）   | remote dev server 的 HMR 只作用于自身 standalone 页面；host 内需重挂载刷新。接受（内部工具），文档明示                                                                                                                                                                                                 |
| `@module-federation/vite` 与 pnpm workspace 符号链接的解析 | 已知 MF 2.0 对 pnpm 兼容良好；P0 打样时第一个验证点，异常则降级 remoteEntry 手动 import 方案                                                                                                                                                                                                           |
| react 版本                                                 | React 18（antd-mobile v5 peer 匹配最稳）；19 待库生态验证                                                                                                                                                                                                                                              |
| host 页面双 React 实例（React 系包被内联）                 | 已实测（2026-10-17）：React 系 lib 包（如 packages/react 绑定层）构建必须 `rollupOptions.external` react/react-dom——Vite 6+ 库模式只自动外置 `dependencies`，peer/dev 中的 react 会被打进 dist → react-dom 接线页面份、绑定层调内联份 dispatcher（null）→ `null.useContext` 崩（standalone/MF 均复现） |
| react-refresh preamble 缺失（Vue host × React remote）     | 已实测：host 无 plugin-react 前导全局时 remote 模块链抛 "can't detect preamble"；由 H7 的 react-preamble.ts 解决（含 mf-html-entry-proxy 绝对 URL 坑）                                                                                                                                                 |

## 7. 落地节奏（不推翻 roadmap，仅微调）

- **P0**：演示包骨架（react-demo 打样，2026-10-17 重组后位于 `playground/ant-design-mobile`）按 R1–R10 双模式落地（standalone 优先跑通零改动接入形态）
- **P2**：playground 演示中心面板（H1–H5）+ 挂载 antd-mobile 演示包——antd-mobile 效果进入 playground 控制台可调
- **P3**：nutui/tdesign demo 按协议复制接入，矩阵铺满 web-react 行
- React 绑定层 / adapter 内核设计**不变**（本方案只改 demo 载体形态与 playground 面板）
