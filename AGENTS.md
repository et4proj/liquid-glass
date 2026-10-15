# AGENTS.md — liquid-glass 仓库 AI 知识库

> 本文件是 AI 编码助手的工作入口。设计意图看架构文档，实现现状看 implementation 文档，本文件只放约定与硬约束。

## 项目是什么

液态玻璃（Liquid Glass）皮肤与效果层框架：在现有移动端组件库（Vant、antd-mobile 等）之上叠加"材质 + 效果"能力，不重写组件。移动端优先，安全降级是核心卖点。风格按 iOS 版本组织为独立风格包（token v2：`registerStyle` 注册 + `config.style` 取用）：ios26 为校准基线，ios27 及后续以新风格包持续接入——本框架是版本化玻璃效果体系，不是 iOS 26 单版本复刻。

- 设计源文档（唯一权威）：[docs/liquid-glass-architecture.md](docs/liquid-glass-architecture.md)（草案 v0.2）
- 技术规格 / 预研：[ios27-liquid-glass-spec.md](docs/research/ios27-liquid-glass-spec.md)（iOS 27 关键数据 + 折射/高光/暗边算法）· [ios27-tab-interaction-spec.md](docs/research/ios27-tab-interaction-spec.md)（Tab 按压曲面镜交互：液滴运动 + WebGL 透镜参数）
- 提案（已拍板并落地）：[token-system-v2.md](docs/proposals/token-system-v2.md)——风格包架构（core 零风格数据、通道化 token、风格独立包），D1–D5 决策已执行
- 实现现状文档：[docs/implementation/](docs/implementation/) 目录，按里程碑组织
- 面向人的项目入口：[README.md](README.md)（功能清单 + 包结构一览）

## 仓库地图

```
packages/
  core/           ★ 已实现（M0）：契约类型 + 配置 + 通道化 token 引擎（风格注册表）+ resolve，纯逻辑无 DOM，零风格数据
  styles/         ★ 已实现（token v2）：风格包（ios26 历史基线 / ios27 主要方向），纯 JSON-safe 数据，exports 直指 src 无构建步骤
  web/            ★ 已实现（M1 部分）：Web 探针 + CSS/SVG 折射后端 + createGlass 运行时 + data-glass 发现 + 交互动效
  vue/ react/ mp/ bridge/                  # 占位（M1-M4）
  adapter-vant/ adapter-*/                 # 占位，适配层
  unplugin/ plugin-vite/ plugin-webpack/   # 占位，集成层
  cli/ module-nuxt/ module-next/           # 占位
playground/        ★ 已实现：Vue 3 调试台 + 预览站雏形（alias 直连 core/web 源码，改包内代码即时生效）
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
pnpm --filter @et4proj/liquid-glass-core test            # 单包测试
pnpm --filter @et4proj/liquid-glass-playground dev       # playground 调试台（localhost:5173）
```

core 包构建：Vite lib mode（ESM + CJS + d.ts），测试 Vitest（node 环境）。

## 关键决策记录

| 决策 | 结论 | 原因 |
|---|---|---|
| 包名 scope | `@et4proj/liquid-glass-*` 单级 scope | npm 不支持二级 scope；避免为单项目另建组织 |
| monorepo | pnpm workspace + Turborepo | 多包长期路线，需要任务编排与缓存 |
| 库构建 | Vite lib mode + vite-plugin-dts + Vitest | 用户偏好 Vite 生态统一 |
| resolve 预算超限 | 降一档，不低于 solid | M0 简化语义，后续可换 LRU 摘除 |
| semver 匹配 | core 内自写 ~60 行 | 避免 M0 引外部依赖 |
| 数值强度 | 0..1 在 subtle..strong 间线性插值 | regular = 0.5 恰好命中预设表 |
| 风格版本轴 | `config.style` 取用已注册风格包（token v2 后 `STYLE_PRESETS` 已移除）；ios26 基线、ios27 主方向（校准值见 docs/research/，待真机校准） | 定位是版本化玻璃效果体系而非 iOS 26 复刻；新 iOS 版本以风格包接入，不动契约与架构 |
| budget 语义 | `activeSurfaces > maxSurfaces` 才降档；运行时按注册顺序"先到先得"传顺位 | maxSurfaces = 最多 N 个同时全效；运行时接入时暴露 M0 的 `>=` 边界歧义（详见 m1-web.md 决定表） |
| **iOS 27 为主要开发方向** | ios27 按技术规格校准（docs/research/ios27-liquid-glass-spec.md）；默认 `config.style` 已切 `'ios27'`；ios26 保留为历史基线 | iOS 27 已正式发布且 ultra-clear 取向与项目观感目标一致；着色滑杆落在绑定层 prop，core 不加概念 |
| **token v2 落地（风格包架构）** | core 零风格数据（仅内置 basic 安全网）+ 通道化 GlassTokens（material / refraction / motion / x-*）+ `registerStyle` 注册表；ios26/ios27 拆入 `packages/styles/*`（workspace 包，暂不发 npm）；旧扁平 plan.tokens 一步到位切换（不兼容变更）；未知通道宽松校验（透传 + dev 警告） | 风格可独立维护/独立成包/远程下发；JS 对象 = 运行时唯一权威、JSON = 交换格式、CSS 变量/uniforms = 投影；D1–D5 拍板结论见提案 §9 |

## 进度快照（2026-10-15）

- **M0 完成**：core 包全部实现 + 57 单测全绿（resolve 优先级与降级全路径、通道化 token、风格注册表）；16 个占位包就位；git 已 init、未 commit。
- **token v2 已落地**：core 零风格数据（内置 basic 安全网）+ 通道化 GlassTokens；风格包 `packages/styles/ios26` + `ios27`（12 单测，workspace 包暂不发 npm，ios27 校准值来自 docs/research/ 预研）；默认 `config.style` 已切 `'ios27'`；web 与 playground 已切换消费通道化 token（css 读 `plan.tokens.material`、svg 读 `tokens.refraction`）；全量 build / test / typecheck 绿。详见提案与 m0-core.md / m1-web.md。
- **M1 进行中**：glass-web 已落地（探针 / CSS 后端 / SVG 折射后端 / createGlass 运行时 / data-glass 发现 / 交互动效，28 单测）；剩余 adapter-vant、unplugin + Vite 插件、胶囊 TabBar 增强件、展示站。
- **playground 已就位**：core 策略层可视化调试台 + 真实运行时面板（createGlass + data-glass，含 ios26/ios27 风格切换），兼作预览站雏形；新功能落地后在此加演示面板。
- **预研完成**：iOS 27 技术规格（docs/research/）：静态材质规格（五层光学要素、Snell+squircle 折射、ios27 校准表——已落入风格包）+ Tab 交互规格（液滴 slide/stretch、弹簧参数、WebGL 曲面镜 shader 参数——弹簧参数已由 motion 通道承载）。下一步实现胶囊 TabBar 增强件，再继续 M1 剩余项。
- 实现细节：[m0-core.md](docs/implementation/m0-core.md) · [m1-web.md](docs/implementation/m1-web.md)

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
