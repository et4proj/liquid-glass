# liquid-glass

液态玻璃（Liquid Glass）皮肤与效果层框架 —— 在现有移动端组件库（Vant、antd-mobile、NutUI 等）之上叠加"材质 + 效果"能力：以 iOS 27 为主要风格方向（更通透 · 暗化边缘 · 亮高光 · 强折射）、iOS 26 为历史校准基线，新 iOS 风格以独立风格包持续接入，**不重写组件，业务代码零改动或少量改动**。

> 状态：M0 已完成 · M1 进行中（glass-web 已落地）｜ 设计文档：[docs/liquid-glass-architecture.md](docs/liquid-glass-architecture.md)

## 核心特性

- **效果质量优先**：模糊、折射、高光、交互形变分档实现，尽可能接近原生质感
- **风格包化（token v2）**：每套风格独立成包、可独立维护甚至独立发版（`packages/styles/*`）；core 零风格数据，通道（material / refraction / motion / x-*）按语义分组透传
- **安全降级**：一套 API 自动按环境选择最优档位（native → webgl → svg → css → solid → none），遵循系统无障碍设置（降低透明度 / 增强对比度 / 减少动态）
- **快速接入**：构建插件（Vite / webpack）自动识别组件库并注入皮肤，业务代码零改动
- **平台无关核心**：纯逻辑核心（glass-core）无 DOM 依赖，Web、小程序、原生壳复用同一套策略

## 功能清单

### 已实现（M0 · 2026-10）

- [x] **三个契约接口**（Surface 声明 / Backend / Probe）：全部下游包的公共边界
- [x] **策略解析 `resolve`**：优先级链（无障碍强制 > 兼容规则 > 显式配置 > 默认值）+ 能力门控 + 预算降档，输出含降级原因的 `RenderPlan`
- [x] **配置层**：`GlassConfig`（语义强度 / 材质预设 / 档位上限 / 预算 / 无障碍策略）、按环境的兼容规则（平台 / 引擎 / 系统 / 基础库版本，支持迷你 semver 范围）
- [x] **通道化 token 系统（v2）**：token 按语义通道分组（material / refraction / motion / `x-*` 自定义），三锚点分段插值（subtle=0 / regular=0.5 / strong=1）+ 三种材质预设（regular / clear / tinted）+ solid / none 降级形态；`config.advanced` 通道级逐字段覆盖
- [x] **风格包体系（token v2）**：`registerStyle()` 显式注册风格包（纯 JSON-safe 数据，可独立成包、独立维护、远程下发），core 零风格数据（仅内置 basic 安全网）；ios26 历史基线 / ios27 主要方向（校准值依据 docs/research/ 预研规格）
- [x] **调试基础**：`ReasonCode` 全枚举降级原因，为 `glass.debug.explain` 预留
- [x] **仓库脚手架**：pnpm + Turborepo monorepo，20 个包（core / web / 2 风格包已实现 + 16 占位，§3.3 全量），CI 友好（build / test / typecheck）
- [x] **单元测试**：core 57 用例（resolve 优先级与降级全路径、通道化 token、风格注册表）+ 风格包 12 用例（ios26 / ios27 校准值与通道参数）
- [x] **playground 调试台**：可视化调试 core 策略层——实时调节风格/强度/材质/档位，模拟平台能力与无障碍设置，玻璃卡片实时渲染 token，RenderPanel 面板展示完整决策链（tier + reasons + tokens）；兼作未来预览站点雏形

### 规划中

**M1 — CSS 皮肤与首个适配（进行中）**

- [x] `glass-web`：Web 平台探针（能力探测 + 无障碍订阅）、CSS 渲染后端（token → `--glass-*`）、SVG 折射后端（Chromium 边缘透镜折射，消费 refraction 通道）、`createGlass` 运行时（register/updateConfig/debug.explain/pause）、`data-glass` 声明式自动发现、交互动效（按压回弹 + 指针高光跟随），28 单测
- [x] React 线路（P0-P2）：react 绑定层（GlassProvider/useGlassSurface/GlassSurface）+ adapter 内核（GlassAdapterManifest/applyAdapter）+ adapter-antd-mobile 数据包（零改动接入验收，E2E 覆盖）
- [x] `adapter-vant`：Vant 4 选择器映射 + 变量映射（tokenMap 映射全局 fallback 层）+ CSS 补丁，Vue 线路打样
- [ ] `unplugin` + Vite 插件（L0 样式注入 / L1 运行时注入），`glass init` CLI
- [ ] 增强件：悬浮胶囊 TabBar 选中"气泡"滑动
- [ ] 展示站与存量 Demo 零改动接入验证

**M2 — 多构建工具与框架绑定**

- [x] Vue 绑定（`liquidGlassVue` 插件 / `v-glass` 指令 / `useGlass` / `GlassSurface`，语义对齐 React 绑定层）
- [ ] webpack / Rspack 支持
- [ ] `glass doctor` 诊断；配置远程下发

**M3 — 小程序**

- [ ] `glass-mp`：逻辑层运行时 + wxss 编译产物 + 平台能力表 + 真机矩阵

**M4 — 原生与 WebGL**

- [ ] iOS 26 原生玻璃桥接（固定控件投射）
- [ ] WebGL 档（仅背景可控区域）；受控背景场景

**持续演进**

- [ ] iOS 27 风格包真机采集与校准（当前校准值依据公开资料拟定，见 docs/research/）；iOS 28+ 以新风格包接入（`base` 继承 ios27 只声明差异字段，core 与既有包零改动）

## 包结构

| 包                                          | 职责                                                                                      | 状态          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------- |
| `@et4proj/liquid-glass-core`                | 契约类型 + 配置 + 通道化 token 引擎 + 风格注册表 + resolve（纯逻辑，零风格数据）          | **M0 已实现** |
| `@et4proj/liquid-glass-style-ios27`         | 风格包（token v2）：iOS 27 校准数据（主要开发方向）                                       | **已实现**    |
| `@et4proj/liquid-glass-style-ios26`         | 风格包（token v2）：iOS 26 历史校准基线                                                   | **已实现**    |
| `@et4proj/liquid-glass-web`                 | Web 探针 + CSS/SVG 折射后端 + createGlass 运行时 + data-glass/选择器双发现                | **M1 已实现** |
| `@et4proj/liquid-glass-react`               | React 绑定层（GlassProvider / useGlassSurface / GlassSurface）                            | **已实现**    |
| `@et4proj/liquid-glass-vue`                 | Vue 绑定层（liquidGlassVue 插件 / v-glass 指令 / useGlass / GlassSurface）                | **已实现**    |
| `@et4proj/liquid-glass-adapter`             | adapter 内核（GlassAdapterManifest 契约 + applyAdapter：别名注入 + patches + 选择器发现） | **已实现**    |
| `@et4proj/liquid-glass-adapter-antd-mobile` | antd-mobile v5 适配数据包（surfaces + tokenMap 别名 + patches，纯 JSON-safe）             | **已实现**    |
| `@et4proj/liquid-glass-adapter-vant`        | Vant 4 适配数据包（tokenMap 映射全局 fallback 层，纯 JSON-safe）                          | **已实现**    |
| `@et4proj/liquid-glass-adapter-nutui` 等    | 其余组件库适配包（NutUI React / TDesign Mobile React）                                    | P3            |
| `@et4proj/unplugin-liquid-glass`            | 构建插件核心（Vite / webpack / Rspack / Rollup）                                          | M1            |
| `@et4proj/liquid-glass-mp`                  | 小程序平台包                                                                              | M3            |
| `@et4proj/liquid-glass-bridge`              | iOS 26 原生桥接                                                                           | M4            |
| `@et4proj/liquid-glass-cli`                 | `glass init / build / doctor`                                                             | M1+           |

完整目录见 [AGENTS.md](AGENTS.md) 仓库地图。

## 快速开始（核心 API 预览）

```ts
import { defineConfig, registerStyle, resolve } from "@et4proj/liquid-glass-core";
import ios27 from "@et4proj/liquid-glass-style-ios27";

registerStyle(ios27); // 风格包注册（未注册时回退内置 basic 安全网）

const config = defineConfig({ style: "ios27", intensity: "regular", maxTier: "css" });

const plan = resolve({
  config,
  caps, // 平台探针产出（glass-web 提供）
  surface: { role: "bar", shape: { kind: "capsule" } },
  budget: { activeSurfaces: 3 },
});
// plan.tier → 'css' | 'svg' | 'solid' | ...
// plan.tokens → { material: { blur, saturation, tint, ... },   // css 后端消费
//                 refraction: { strength, ior, bezelWidth, ... }, // svg/webgl 档消费
//                 motion: { ... } }                              // 增强件消费（可选）
// plan.reasons → ['ok'] 或降级原因链
```

## 开发

```bash
pnpm install
pnpm build        # 全包构建
pnpm test         # 单元测试
pnpm e2e          # E2E（build + Playwright：发布链路 + 真实浏览器降级验证）
pnpm typecheck    # 类型检查

# playground 演示目录（MF host 导航 + 各调试区独立包）
pnpm playground           # 目录壳 MF host，http://localhost:5173
pnpm playground:workbench   # core/web 工作台（MF remote，localhost:5175）
pnpm playground:antd-mobile   # antd-mobile 演示（MF remote，localhost:5174）
pnpm playground:all       # 并行启动全部演示包（新 demo 自动包含）
```

要求：Node ≥ 20，pnpm ≥ 9。

## 文档

- [架构设计文档](docs/liquid-glass-architecture.md) —— 设计意图的唯一权威
- [M0 实现文档](docs/implementation/m0-core.md) —— API 速查、resolve 算法、决策记录
- [AGENTS.md](AGENTS.md) —— AI 协作约定与知识库入口

## License

MIT
