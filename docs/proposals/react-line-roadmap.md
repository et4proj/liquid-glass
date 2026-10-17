# React 线路提案：绑定层 + 三库 Adapter 开发路线（草案 v1）

> 状态：设计定稿，待实现 ｜ 日期：2026-10-17
> 方向：**React 线路优先**（用户拍板），胶囊 TabBar 增强件后置，三个 React 系组件库适配先行。
> 配套设计文档：[react-binding-design.md](react-binding-design.md)（packages/react）· [adapter-system-design.md](adapter-system-design.md)（packages/adapter + 三库包）
> 本文档生效后，架构文档 §14 中"Vue 或 React 绑定（M2）"的 React 部分**前移至 M1 尾段**，实现完成后回写架构文档。

## 1. 目标与背景

- **目标**：React 技术栈的存量项目（已用 antd-mobile / NutUI / TDesign Mobile）能"零改动接入"液态玻璃皮肤——产品代码不改，安装 adapter 即生效（架构 §14 M1 验收标准）。
- **背景**：web 运行时（probe / css-backend / svg-backend / createGlass / data-glass 发现）已就位且框架无关；adapter 的"数据部分"（变量桥 + 选择器映射）不依赖任何绑定层（架构 §8：绑定层非硬依赖），可先行；绑定层薄（§8"代码量很小"），随地基一起做掉，为后置的 L2 增强件（气泡 TabBar、液态 Switch）扫清障碍。

## 2. 三库名单（已确认）

| 库                   | 版本 | 变量前缀  | 备注                                                                           |
| -------------------- | ---- | --------- | ------------------------------------------------------------------------------ |
| antd-mobile          | v5   | `--adm-*` | React 系首发打样库（架构 §14 首发建议）                                        |
| NutUI（React 版）    | ^2   | `--nut-*` | 京东系，另支持 Taro/uni-app（本线路只做 React）                                |
| TDesign Mobile React | ^1   | `--td-*`  | 官方有 Tabbar 悬浮胶囊液态玻璃 issue（§2.3），适配时关注官方动向，避免重复劳动 |

共性事实（架构 §2.3 调研结论）：三库全部基于 CSS 变量做主题，换色/圆角/阴影顺畅；**没有任何一家把"材质"（模糊、折射、高光）作为一等 token**——这正是 adapter 的价值空间：自建 `--glass-*` 材质变量层 + 选择器级 Surface 注册 + CSS 补丁。

## 3. 依赖关系（决定实现顺序）

```
core（已就位，零改动）
  ▲
web 运行时（已就位 + 2 处扩展：选择器发现、overlay 变量注入）
  ▲                          ▲
packages/react（P0，绑定层）   packages/adapter（P1，适配内核）
  ▲                          ▲
  └────（L2 增强件消费，后置）  ├─ adapter-antd-mobile（P2 打样）
                             ├─ adapter-nutui-react（P3）
                             └─ adapter-tdesign-mobile-react（P3）

playground/ant-design-mobile（P0 建骨架，P2 打样落地；P3 起每库一包对称生长）——演示验收载体
```

硬依赖只有一条：**adapter 内核需要 web 包新增"选择器发现"能力**（现在 discovery.ts 只认 `data-glass` 属性，不认组件库类名）。packages/react 与 adapter 数据部分互不阻塞，可并行。

## 4. 阶段划分

| 阶段        | 内容                                                                                                                                                                                                                                                                               | 交付物                                                                     | 验收                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 地基** | ① web 包：选择器发现（manifest 驱动类名扫描）+ overlay 弹层变量注入 ② packages/react 绑定层（设计见 react-binding-design.md）③ playground/ant-design-mobile 演示包骨架（React 18 + Vite + StrictMode 开启，**MF remote + standalone 双模式**，见 playground-federation-design.md） | web 28+ 新单测；react 包 1.0（hooks + 组件）；antd-mobile 演示包双模式空壳 | StrictMode 双挂载幂等；useGlassSurface mount/update/unmount 生命周期单测全绿；standalone 独立可跑                                                                                                           |
| **P1 内核** | packages/adapter：GlassAdapter manifest 类型 + applyAdapter() + 库检测 + patches 注入（设计见 adapter-system-design.md）                                                                                                                                                           | adapter 包 1.0 + 单测（manifest 校验、apply 流程、库缺失 no-op）           | 注入流程单测；"新增一个库的成本"有明确路径（§7.7）                                                                                                                                                          |
| **P2 打样** | adapter-antd-mobile：manifest 数据（tokenMap / surfaces / patches）+ playground/ant-design-mobile 演示页 + playground/entry 演示中心挂载（见 playground-federation-design.md）                                                                                                     | 第一个可用 adapter 包 + 演示页                                             | **零改动接入**：antd-mobile Demo 只装 adapter 不改产品代码，TabBar / NavBar / Popup / Dialog / Switch 玻璃化；iOS Safari + Android WebView 真机过验收（用户自验）；演示区效果可被 playground 控制台实时调整 |
| **P3 复制** | adapter-nutui-react + adapter-tdesign-mobile-react（同一 manifest 模式换数据）+ 各自独立演示包（`playground/nutui`、`playground/tdesign`，对称 `playground/ant-design-mobile`）                                                                                                    | 三个 adapter 包齐                                                          | 三库横向对比（演示中心切换）；弹层继承（overlay: true 路径）三库一致                                                                                                                                        |
| **P4 后置** | unplugin + Vite 插件（编译期 CSS 产物，纯性能/体积优化）→ 胶囊 TabBar 增强件（react 版内核 + 组件）→ 展示站                                                                                                                                                                        | 按 M1 原计划收尾                                                           | 略                                                                                                                                                                                                          |

**对照原 M1 的调整**：TabBar 增强件、unplugin 后移；React 绑定层从 M2 前移。调整的都是"薄或不阻塞验收主线"的项——零改动接入、真机效果、弹层继承三个 M1 验收点全部保留在 P2/P3。

## 5. 演示包设计（playground/<lib>，每库一包）

**定位**（2026-10-17 重组修订）：每库一个独立演示包（对称生长于 `playground/` 容器目录下），首包 `playground/ant-design-mobile`（@et4proj/liquid-glass-playground-antd-mobile）——antd-mobile adapter 的验收载体 + "零改动接入"的活样本 + playground 演示中心的 remote（[playground-federation-design.md](playground-federation-design.md)：MF remote + standalone 双模式，端口 5174，挂载协议 mount/unmount + DemoHostContext）。workspace 成员（不发布）。原"三库共用 react-demo"形态已废止——单库单包避免跨库 CSS 互染与路由耦合，新增库 = 新增包。

```
playground/ant-design-mobile/          # P3 时 playground/nutui、playground/tdesign 同构复制
  src/
    main.tsx            # standalone 入口：自建 createGlass + applyAdapter（StrictMode 开启）
    remote.tsx          # MF remote 出口：mount(el, ctx)/unmount()，runtime 用 ctx 注入的 host 实例
    App.tsx             # 单库演示外壳（antd-mobile 组件页，无跨库路由）
    pages/
      AntdMobilePage.tsx   # <Tabbar/><NavBar/><Popup/><Dialog/><Switch/> 原生用法
    bootstrap.ts        # adapter 接入：applyAdapter(runtime, xxxAdapter)（runtime 来源由入口决定）
```

**关键原则**：

1. **页面代码 = 组件库官方文档的示例代码**，一行不改——"零改动"的证明力来自页面代码与接入代码的完全分离（bootstrap.ts 是唯一接入文件）。
2. StrictMode 故意开着：绑定层在开发模式双挂载下必须稳定，这是 react-binding-design.md 的验收场景之一。
3. 每包单库（天然不同时初始化多库），避免 CSS 变量与全局样式互相污染，也更接近真实项目形态。

## 6. 里程碑与文档约定

- 每个 Phase 完成后：`docs/implementation/` 记录实现细节；README 功能清单勾选；AGENTS.md 进度快照更新（工作约定不变）。
- adapter 包命名：`@et4proj/liquid-glass-adapter`（内核）、`@et4proj/liquid-glass-adapter-antd-mobile` / `-nutui-react` / `-tdesign-mobile-react`（短目录名 `packages/adapter`、`packages/adapter-antd-mobile` 等，遵守方案 B）。
- P0 完成后回写架构文档 §14（React 绑定前移事实）。

## 7. 风险与开放问题

| 风险                                                                     | 应对                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 三库 CSS 变量名/选择器随版本漂移（架构 §7.3 已警告"需对照当前版本核实"） | manifest 中 `versionRange` + 数据标注"核实日期"；adapter-system-design.md §6 预留截图回归基线（§7.7） |
| 弹层挂 body 导致 `--glass-*` 继承断链（Vant/antd 共同深水区）            | P0 在 web 层做 overlay 变量注入（body 级），P2 第一时间用 antd-mobile Popup 验证                      |
| TDesign 官方可能自己出液态玻璃方案                                       | manifest 拆在独立数据包，若官方出方案则该库适配降级为"兼容层"定位，数据包仍在                         |
| NutUI React 版社区规模较小，优先级存疑                                   | P3 顺序可调（TDesign 先），manifest 模式已打样，换库成本低                                            |
| React 绑定层 SSR 语义（Nuxt/Next 场景 M2+ 才真实出现）                   | v1 只保证"客户端组件安全"（§8），SSR 深化推迟到 M2，文档明示                                          |
