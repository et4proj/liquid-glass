# AGENTS.md — liquid-glass 仓库 AI 知识库

> 本文件是 AI 编码助手的工作入口。设计意图看架构文档，实现现状看 implementation 文档，本文件只放约定与硬约束。

## 项目是什么

液态玻璃（Liquid Glass）皮肤与效果层框架：在现有移动端组件库（Vant、antd-mobile 等）之上叠加"材质 + 效果"能力，不重写组件。移动端优先，安全降级是核心卖点。风格按 iOS 版本组织为独立风格包（token v2：`registerStyle` 注册 + `config.style` 取用）：ios26 为校准基线，ios27 及后续以新风格包持续接入——本框架是版本化玻璃效果体系，不是 iOS 26 单版本复刻。

- 设计源文档（唯一权威）：[docs/liquid-glass-architecture.md](docs/liquid-glass-architecture.md)（草案 v0.2）
- 技术规格 / 预研：[ios27-liquid-glass-spec.md](docs/research/ios27-liquid-glass-spec.md)（iOS 27 关键数据 + 折射/高光/暗边算法）· [ios27-tab-interaction-spec.md](docs/research/ios27-tab-interaction-spec.md)（Tab 按压曲面镜交互：液滴运动 + WebGL 透镜参数）
- 提案（已拍板并落地）：[token-system-v2.md](docs/proposals/token-system-v2.md)——风格包架构（core 零风格数据、通道化 token、风格独立包），D1–D5 决策已执行
- 提案（已批准，待实现）：[react-line-roadmap.md](docs/proposals/react-line-roadmap.md)（React 线路总图 + 演示包设计）· [react-binding-design.md](docs/proposals/react-binding-design.md)（packages/react 绑定层）· [adapter-system-design.md](docs/proposals/adapter-system-design.md)（adapter 内核 + 三库包）· [playground-federation-design.md](docs/proposals/playground-federation-design.md)（playground 演示中心 MF 2.0 联邦化 + 配置清单）
- 实现现状文档：[docs/implementation/](docs/implementation/) 目录，按里程碑组织
- 面向人的项目入口：[README.md](README.md)（功能清单 + 包结构一览）

## 仓库地图

```
packages/
  core/           ★ 已实现（M0）：契约类型 + 配置 + 通道化 token 引擎（风格注册表）+ resolve，纯逻辑无 DOM，零风格数据
  styles/         ★ 已实现（token v2）：风格包（ios26 历史基线 / ios27 主要方向），纯 JSON-safe 数据，exports 直指 src 无构建步骤
  web/            ★ 已实现（M1 部分）：Web 探针 + CSS/SVG 折射后端 + createGlass 运行时 + data-glass/选择器双发现 + 交互动效
  react/          ★ 已实现（React 线路）：GlassProvider/useGlass/useGlassSurface/GlassSurface 绑定层（StrictMode 幂等 + SSR 安全）
  adapter/        ★ 已实现（adapter 内核）：GlassAdapterManifest 契约 + applyAdapter（tokenMap 别名注入 + patches + 选择器发现）
  adapter-antd-mobile/ ★ 已实现（P2 数据包）：antd-mobile v5 manifest（surfaces 7 条 + patches，纯 JSON-safe 无 auto 入口）
  vue/ mp/ bridge/                        # 占位（M1-M4）
  adapter-nutui/ adapter-tdesign-mobile/   # 占位（P3）
  unplugin/ plugin-vite/ plugin-webpack/   # 占位，集成层（P4）
  cli/ module-nuxt/ module-next/           # 占位
playground/        ★ 已实现（纯容器目录，非包）：每库一个演示包，宿主为 entry
  entry/           ★ MF host 调试台（Vue 3 调试台 + 效果画廊 + 演示中心，localhost:5173，包名 @et4proj/liquid-glass-playground）
  ant-design-mobile/ ★ antd-mobile 玻璃化演示（@et4proj/liquid-glass-playground-antd-mobile：standalone 零改动验收 + MF remote 被 entry 挂载，双模式）
```

占位包的 `src/index.ts` 中注释标注了对应里程碑，进入某包开发前先读架构文档对应章节（§4 契约、§7 适配层、§8 绑定层、§9 集成层）。

## 硬约束

1. **包命名（方案 B）**：`@et4proj/liquid-glass-<name>`；构建插件保留生态前缀（`@et4proj/unplugin-liquid-glass`、`@et4proj/vite-plugin-liquid-glass`）；目录用短名（`packages/core`）。`@et4proj/liquid-glass`（无后缀）预留给 M1 聚合主包，**现在不要占用**。
2. **core 包不得依赖 DOM**：小程序复用核心逻辑，`resolve` 及全部类型必须平台无关。仅 `TexImageSource` 等类型引用可接受。
3. **三个契约接口（types.ts）是对外承诺**：Surface 声明 / Backend / Probe。改动会影响所有下游包，需同步架构文档 §4。
4. **TypeScript 统一 ^5**：TS 7 原生编译器无 JS Compiler API，unplugin-dts 不兼容（2026-10 验证）。
5. **依赖方向**（架构 §3.2）：适配层/绑定层 → core ← 探针；集成层最外侧。禁止反向依赖。

## 常用命令

```bash
pnpm build        # turbo run build（全包）
pnpm test         # turbo run test
pnpm typecheck    # turbo run typecheck
pnpm lint         # oxlint 全仓（oxc 秒级单次扫描，不进 turbo 任务图）
pnpm lint:css     # stylelint（独立 css + .vue 内联 style 块）
pnpm fmt          # oxfmt 全量格式化（fmt:check 为只检查模式）
pnpm --filter @et4proj/liquid-glass-core test            # 单包测试
pnpm --filter @et4proj/liquid-glass-playground dev       # playground 调试台（localhost:5173）
pnpm --filter @et4proj/liquid-glass-playground-antd-mobile dev  # antd-mobile 演示（MF remote，localhost:5174）
```

core 包构建：Vite lib mode（ESM + CJS + d.ts），测试 Vitest（node 环境）。

git hooks（lefthook，`pnpm install` 经 prepare 自动安装）：pre-commit 以 piped 串行执行完整提交门禁——先对 staged 文件增量跑 oxlint --fix / oxfmt / stylelint --fix（stage_fixed 自动 re-stage；glob 无匹配自动跳过），再跑全量 `pnpm typecheck`（tsc 无 staged 粒度，走 turbo，缓存命中秒过、仅改动包真跑）。串行而非并行的原因：fix 类命令改写文件与 tsc 全量编译并发会读写竞态，且串行保证 typecheck 检查的是修复后的代码。commit-msg 走 commitlint（conventional，type 必须、描述可中文）；pre-push 复检全量 typecheck。`.vue` 的 js/css 对 oxlint/oxfmt 豁免（oxc vue 支持不成熟，决策见关键决策记录表），stylelint 仍覆盖 vue 内 style 块。

## 关键决策记录

| 决策                                          | 结论                                                                                                                                                                                                                                                                                                                                                             | 原因                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 包名 scope                                    | `@et4proj/liquid-glass-*` 单级 scope                                                                                                                                                                                                                                                                                                                             | npm 不支持二级 scope；避免为单项目另建组织                                                                                     |
| monorepo                                      | pnpm workspace + Turborepo                                                                                                                                                                                                                                                                                                                                       | 多包长期路线，需要任务编排与缓存                                                                                               |
| 库构建                                        | Vite lib mode + vite-plugin-dts + Vitest                                                                                                                                                                                                                                                                                                                         | 用户偏好 Vite 生态统一                                                                                                         |
| resolve 预算超限                              | 降一档，不低于 solid                                                                                                                                                                                                                                                                                                                                             | M0 简化语义，后续可换 LRU 摘除                                                                                                 |
| semver 匹配                                   | core 内自写 ~60 行                                                                                                                                                                                                                                                                                                                                               | 避免 M0 引外部依赖                                                                                                             |
| 数值强度                                      | 0..1 在 subtle..strong 间线性插值                                                                                                                                                                                                                                                                                                                                | regular = 0.5 恰好命中预设表                                                                                                   |
| 风格版本轴                                    | `config.style` 取用已注册风格包（token v2 后 `STYLE_PRESETS` 已移除）；ios26 基线、ios27 主方向（校准值见 docs/research/，待真机校准）                                                                                                                                                                                                                           | 定位是版本化玻璃效果体系而非 iOS 26 复刻；新 iOS 版本以风格包接入，不动契约与架构                                              |
| budget 语义                                   | `activeSurfaces > maxSurfaces` 才降档；运行时按注册顺序"先到先得"传顺位                                                                                                                                                                                                                                                                                          | maxSurfaces = 最多 N 个同时全效；运行时接入时暴露 M0 的 `>=` 边界歧义（详见 m1-web.md 决定表）                                 |
| **iOS 27 为主要开发方向**                     | ios27 按技术规格校准（docs/research/ios27-liquid-glass-spec.md）；默认 `config.style` 已切 `'ios27'`；ios26 保留为历史基线                                                                                                                                                                                                                                       | iOS 27 已正式发布且 ultra-clear 取向与项目观感目标一致；着色滑杆落在绑定层 prop，core 不加概念                                 |
| **token v2 落地（风格包架构）**               | core 零风格数据（仅内置 basic 安全网）+ 通道化 GlassTokens（material / refraction / motion / x-*）+ `registerStyle` 注册表；ios26/ios27 拆入 `packages/styles/*`（workspace 包，暂不发 npm）；旧扁平 plan.tokens 一步到位切换（不兼容变更）；未知通道宽松校验（透传 + dev 警告）                                                                                 | 风格可独立维护/独立成包/远程下发；JS 对象 = 运行时唯一权威、JSON = 交换格式、CSS 变量/uniforms = 投影；D1–D5 拍板结论见提案 §9 |
| **React 线路优先（2026-10-17）**              | M1 尾段改为 React 线路：packages/react 绑定层前移（原 M2）、三库 adapter 先行（antd-mobile / NutUI React / TDesign Mobile React，新内核包 packages/adapter）、胶囊 TabBar 增强件与 unplugin 后置（P4）；adapter 数据包不提供 auto 副作用入口（显式优于隐式）；tokenMap 用"别名而非拷贝"（库变量永远引用 var(--glass-\*)，updateConfig 零重注入、弹层继承不断链） | 用户方向决策；绑定层薄（架构 §8）且 adapter 数据部分不依赖绑定层；零改动接入验收主线不受调整影响                               |
| **playground 容器化（每库一包，2026-10-17）** | playground 为纯容器目录（workspace glob `playground/*`，自身不再是包）：`entry/` = MF host（包名保留 @et4proj/liquid-glass-playground）、`ant-design-mobile/` = @et4proj/liquid-glass-playground-antd-mobile；apps/ 目录撤销；后续每新增一种 adapter 演示 = playground/ 下新建一包 | 目录即矩阵，单一生长点（避免 apps/ 与 playground 两处）；包名与目录语义一致；MF 名 / 端口 / 挂载协议不变，运行时零影响 |
| **代码规范工具链（2026-10-17）** | oxc 系根级单份配置：oxlint（`pnpm lint`，全仓秒扫）+ oxfmt（`pnpm fmt`，prettier 风格）+ stylelint（css/.vue 内联 style）+ commitlint（conventional commits）+ lefthook（pre-commit piped 串行门禁：staged 增量修复 + stage_fixed → 全量 typecheck / commit-msg / pre-push typecheck 复检）。oxlint/oxfmt **不进 turbo 任务图**（oxc 专为单次全仓扫描设计，逐包跑反而慢）；`.vue` 的 js/css 对 oxc 豁免、测试目录关 no-thenable（构造 thenable mock 是测试职责） | 速度（66 文件 63ms）与配置集中（全仓一份 .oxlintrc.json）；typecheck 前移 pre-commit = 提交即完整门禁（lint + format + type-check + commit-lint），串行避免 fix 改写与 tsc 编译竞态；vue 豁免为起步决策，oxc vue 插件成熟后收紧 |

## 进度快照（2026-10-15）

- **M0 完成**：core 包全部实现 + 57 单测全绿（resolve 优先级与降级全路径、通道化 token、风格注册表）；16 个占位包就位；git 已 init、未 commit。
- **token v2 已落地**：core 零风格数据（内置 basic 安全网）+ 通道化 GlassTokens；风格包 `packages/styles/ios26` + `ios27`（12 单测，workspace 包暂不发 npm，ios27 校准值来自 docs/research/ 预研）；默认 `config.style` 已切 `'ios27'`；web 与 playground 已切换消费通道化 token（css 读 `plan.tokens.material`、svg 读 `tokens.refraction`）；全量 build / test / typecheck 绿。详见提案与 m0-core.md / m1-web.md。
- **M1 进行中**：glass-web 已落地（探针 / CSS 后端 / SVG 折射后端 / createGlass 运行时 / data-glass+选择器双发现 / 交互动效，31 单测）；React 线路 P0-P2 已落地（react 绑定层 / adapter 内核 / antd-mobile 数据包 / react-demo / 演示中心，见 m1-react-line.md）；剩余 P3 另两库、unplugin + Vite 插件、胶囊 TabBar 增强件、展示站。
- **playground 已就位**：core 策略层可视化调试台 + 真实运行时面板（createGlass + data-glass，含 ios26/ios27 风格切换），兼作预览站雏形；新功能落地后在此加演示面板。
- **预研完成**：iOS 27 技术规格（docs/research/）：静态材质规格（五层光学要素、Snell+squircle 折射、ios27 校准表——已落入风格包）+ Tab 交互规格（液滴 slide/stretch、弹簧参数、WebGL 曲面镜 shader 参数——弹簧参数已由 motion 通道承载）。下一步实现胶囊 TabBar 增强件，再继续 M1 剩余项。
- **效果画廊 + 混合背景预研落地（2026-10-17）**：playground 新增效果画廊面板（磨砂 / 边缘折射 / 整面放大镜三卡对比 + WebGL 透镜 demo）；`bezelWidth` 语义放宽 0..1（1.0 = 整面凸透镜，ios27 校准 0.18 不变）；WebGL 透镜预研 demo（liquid-toggle 同款管线，图片/video/canvas 三源交叉淡化 + 滚动采样偏移零重传）为 M2 webgpu 后端储备参考实现；三方库（liquidGL / liquidglass / liquid-toggle）源码级调研与"滚动混合背景切换"设计框架见 hover-lens 文档 §8。测试全绿（core 57 + styles 12 + web 28），浏览器验证 6/6。
- **React 线路设计文档定稿（2026-10-17）**：三份提案落地 docs/proposals/——react-line-roadmap.md（P0 地基 → P1 adapter 内核 → P2 antd-mobile 打样 → P3 另两库 → P4 后置项；apps/react-demo 三库共用验收载体）、react-binding-design.md（GlassProvider/useGlassSurface/GlassSurface，StrictMode 幂等 + Portal + SSR 安全）、adapter-system-design.md（GlassAdapterManifest、tokenMap 别名注入、选择器发现、applyAdapter，§1.1 注入手段三级模型）。第四份提案 playground-federation-design.md 定稿：playground 演示中心（MF 2.0 + @module-federation/vite，平台×库选择矩阵、互斥挂载、shared 单例 core/web/styles、挂载协议 mount/unmount + DemoHostContext、R1-R10/H1-H6/O1-O5 完整配置清单）；apps/react-demo 双模式（standalone 零改动验收 + remote 被 playground 挂载）；demo 消费构建产物（解决 alias 直连与 MF shared 冲突）。
- **React 线路第一波实现落地（2026-10-17，P0-P2）**：①web 包 mountSelectorDiscovery（选择器发现，31 单测）②packages/react 绑定层（GlassProvider/useGlass/useGlassSurface/GlassSurface，6 单测；useGlass 首帧即有值 = Provider render 期惰性创建；ref 合并必须 useMemo 稳定否则无限重挂；测试环境 jsdom）③packages/adapter 内核（GlassAdapterManifest + applyAdapter：tokenMap 别名/patches/发现，style 标签 id 幂等 + 引用计数，4 单测）④adapter-antd-mobile 数据包（7 surfaces + 透明底 patches；tokenMap 诚实留空待实测，4 单测）⑤apps/react-demo（standalone + MF remote 双模式，remoteEntry 构建验证通过）⑥playground 演示中心面板（库矩阵 + 迷你控制条 updateConfig 实时驱动 + MF host 挂载，ctx.runtime 直传；shared 在 alias 模式下不参与匹配——决定表 #13）。全量 build/test/typecheck 绿（core 57 + web 31 + react 6 + adapter 4 + antd 4 + styles 12）。实况与决定表 #10-#21 见 m1-react-line.md。浏览器级联调通过（2026-10-17）：演示中心挂载 + 风格/强度/Switch 交互终验，数值吻合校准表（ios26↔ios27 blur 16px↔6px、强度 0.1 时 blur 2.8px 为插值理论值）；联调三处修复——host remotes 改对象形式 `type:'module'`（dev remoteEntry 是 ESM，#19）、react-refresh 前导 `react-preamble.ts` 手动三步安装（#20）、packages/react 构建显式外置 react/react-dom 消双 React 实例（#21）。下一步：antd 变量清单实测补 tokenMap、P3 另两库、真机验收（用户自验）。
- **playground 目录化重组（2026-10-17）**：playground 不再是 workspace 包，改为纯容器目录（pnpm-workspace glob `playground/*`）——原 playground 移入 `playground/entry`（包名保留 @et4proj/liquid-glass-playground，MF host 身份与 5173 不变）；apps/react-demo 移入 `playground/ant-design-mobile` 并改名 **@et4proj/liquid-glass-playground-antd-mobile**（apps/ 目录撤销）。P3 的 nutui/tdesign 演示包将对称生长于 playground/ 下（react-line-roadmap"三库共用 react-demo"形态随之修订为每库一包）。MF 名 / 端口 / 挂载协议 / ctx 直传均不变，运行时零影响（回归 + 浏览器挂载验证通过）。
- **代码规范工具链落地（2026-10-17）**：oxlint / oxfmt / stylelint / commitlint / lefthook 全套就位（根级配置单份 + `prepare` 自动装 hooks）。首次全量整理：oxfmt 格式化 138 文件、stylelint --fix 155 处现代色值写法（rgba→rgb 空格语法）、GlassCard.vue 清一处 backdrop-filter 拷贝残留；oxlint 遗留 12 处均为刻意设计或测试构造——test 目录关 no-thenable、5 处行内禁用注明设计出处（provider render 期惰性创建 = 决定表 #11、ref 合并 = #12、测试计数器）。lint / lint:css / fmt:check 与全量回归绿。
- **staged-lint 提交门禁（2026-10-17）**：lefthook pre-commit 改 piped 串行四步——oxlint --fix → oxfmt → stylelint --fix（均 stage_fixed 自动 re-stage、glob 无匹配自动跳过）→ `pnpm typecheck`（turbo 全量，缓存命中秒过）。typecheck 由 pre-push 前移至 pre-commit（pre-push 保留复检），tsc 无 staged 粒度故走全量。已验证：staged 单文件时四命令真跑（typecheck 8/8 绿，8.8s）、commitlint 正反用例通过（conventional 通过 / 缺 type+subject 拒绝）。
- 实现细节：[m0-core.md](docs/implementation/m0-core.md) · [m1-web.md](docs/implementation/m1-web.md) · [m1-react-line.md](docs/implementation/m1-react-line.md)

## 给 AI 的工作约定

- **【强制】改码必同步知识库**：任何代码变更（新增 / 修改 / 删除公开 API、新增包或文件、变更构建配置、做出新的设计决定）必须在同一次提交前完成文档同步，不留"稍后补文档"：
  - 改动公开 API 或行为 → 更新对应 `docs/implementation/*.md`（API 速查、算法、决策记录）
  - 里程碑推进 → 更新 `README.md` 功能清单勾选状态 + 本文件"进度快照"
  - 做出不可逆 / 影响后续的设计决定 → 追加到本文件"关键决策记录"表
  - 完成新里程碑 → 在 `docs/implementation/` 新建 `m<N>-<主题>.md`
  - 文档滞后于代码 = 未完成任务，不得宣称工作完成
- 修改 core 公开 API 前，先读架构文档对应章节，保持契约注释与文档同步。
- 新包开工时：把占位 `package.json` 升级为正式结构（参照 core 包），保留里程碑注释。
- 代码注释用中文，与现有代码一致。
- 不确定的设计点：做最简决定、在代码注释标注"待定"，不阻塞实现。
