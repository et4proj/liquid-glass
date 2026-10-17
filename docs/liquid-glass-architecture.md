# 液态玻璃皮肤与效果层：架构设计（草案）

> 状态：草案 v0.2 ｜ 语言：TypeScript 接口 ｜ 范围：移动端优先（H5 / 混合应用 / 小程序），后续扩展桌面
>
> 说明：文中标注"需实测"的内容来自调研或经验判断，尚未在真机上验证。

---

## 1. 目标与定位

**目标客户与场景**：项目中已经集成了某个前端组件库、产品要求实现液态玻璃效果的团队。我们提供一套皮肤，让它以最快的方式接入已有项目，而**不需要大面积改动业务代码**。

**目标**：在现有组件库（Vant、antd-mobile、NutUI、TDesign Mobile 等）之上，提供一套独立的液态玻璃"材质 + 效果"能力，不重写组件。

**核心竞争力**：

1. **效果质量**：在各环境下尽可能接近原生 iOS 液态玻璃的质感（当前基线 iOS 26，后续跟进 iOS 27+，见 §5.1 `style`），并有可量化的验收标准（见 §11）。
2. **接入速度**：通过构建工具插件（Vite、webpack 等）接入，业务代码零改动或少量改动（见 §9）。
3. **安全降级**：一套 API 在不同环境自动选择最优实现，并遵循无障碍设置。

**非目标**：

- 不追求与 iOS 原生 100% 一致（折射类效果本质上是模拟）。
- 不以 B 端后台作为首发场景（玻璃质感与信息密度、文字对比度存在冲突）。
- 不以"几份 JSON 映射清单"作为主要交付物：效果质量、增强组件和构建集成才是产品本身（见 §2.4）。

---

## 2. 调研结论摘要

### 2.1 现有生态

| 类别                | 代表项目                                                                                                     | 特点                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Web 整套组件库      | Liquid UI（Vue 3）、React Liquid                                                                             | 偏"玻璃材质"（模糊、高光），无真折射 |
| Web 折射类          | liquid-glass-react、liquid-glass-vue、liquid-glass-studio（WebGL2/WebGPU）、react-liquid-glass-svg（纯 SVG） | 带折射，浏览器兼容性差异大           |
| 原生与跨端          | @callstack/liquid-glass（RN）、Expo GlassEffect、腾讯 Kuikly、uni-app x glass-effect-view、Flutter 系列      | 调用系统玻璃，低版本降级             |
| shadcn / Radix 生态 | 21st.dev 上的液态玻璃组件、Ein UI、shadcn-glass-ui                                                           | 已较拥挤                             |

### 2.2 关键技术约束

- 折射需要读取"元素背后的内容"，WebGL 不能直接采样 DOM。
- SVG 位移滤镜 + backdrop-filter：Chromium 效果好，Safari / Firefox 仅部分支持。
- WebGL 方案需要显式提供背景纹理，适合背景可控的区域（dock、hero、登录页、浮层）。
- HTML-in-Canvas（`drawElementImage` 等）可把 HTML 渲染进 canvas / WebGL / WebGPU 纹理，但仍是实验特性，需开启 flag，仅 Chromium，且有一帧延迟与性能成本，不适合生产。
- iOS Safari / WebView 上真折射困难，WebGL 在移动端的功耗与发热需真机压测。

### 2.3 主流移动端组件库的主题机制

| 库             | 主题机制                                                                           | 备注                                                                |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Vant 4         | CSS 变量（基础变量 + 组件变量），ConfigProvider 的 `themeVars`，深浅色分别覆盖     | ConfigProvider 仅影响子组件，挂到 body 的弹层需实测                 |
| antd-mobile v5 | 大量 CSS 变量，`:root`（常写 `:root:root`）或局部节点覆盖，组件支持 `style` 传变量 |                                                                     |
| NutUI          | CSS 变量 + ConfigProvider 的 `theme-vars`                                          | 支持 Vue、Taro、uni-app                                             |
| TDesign Mobile | Design Token 全部为 CSS 变量（颜色、字体、圆角、阴影、尺寸），带主题生成器         | 官方仓库有 issue 征集 Tabbar 悬浮胶囊的液态玻璃实现，需关注官方动向 |
| Varlet         | 同样基于 CSS 变量                                                                  |                                                                     |

**结论**：换色、圆角、阴影很顺，但没有任何一个把"材质"（模糊、折射、高光）作为一等 token，需要自建一层 `--glass-*` 变量，再补组件级补丁和少量增强交互（如悬浮胶囊 TabBar 的选中气泡）。

### 2.4 市场判断（个人判断，未验证）

- **目标场景**：存量项目已集成组件库，产品要求做液态玻璃；需求由项目交付驱动，有明确的时间压力。
- **纯视觉皮肤包**：红海，难以收费，风格有周期。因此产品形态不是"皮肤包"，而是"效果质量 + 构建集成 + 持续适配"。
- **主要风险**：如果客户只需要 TabBar、NavBar 的简单模糊，自己写几段 CSS 即可；因此差异点必须体现在效果质量、多库多版本覆盖、降级与无障碍合规、真机验证和升级维护上。
- **需求窗口**：液态玻璃可能是阶段性风格需求，窗口长度不确定。
- **商业形态（待验证）**：开源核心 + 付费适配包 / 增强组件 / 企业支持，或项目制接入服务。
- **验证方式**：先做展示站与一个适配包；访谈 5–10 个正被要求做液态玻璃的团队（用什么库和版本、改哪些组件、涉及多少页面、预算和期限）。

---

## 3. 总体架构

### 3.1 变化轴

组件库与框架不是一一对应（例如 TDesign Mobile 同时有 React 与 Vue 实现，NutUI 支持 Vue、Taro、uni-app），所以把"框架"、"平台"和"构建工具"作为独立轴，避免 N×M 的适配包。

| 层                                         | 变化轴   | 内容                                                                        |
| ------------------------------------------ | -------- | --------------------------------------------------------------------------- |
| 配置层 + 核心（策略解析、探针接口、token） | 不变     | 纯逻辑，不依赖 DOM 与框架                                                   |
| 渲染后端                                   | 平台     | Web（CSS、SVG、WebGL）、小程序（基本只有 CSS）、原生壳桥接                  |
| 绑定层                                     | 框架     | Vue、React；H5 声明式路线下可省略                                           |
| 适配层                                     | 组件库   | 选择器到 Surface 声明的映射表 + 变量映射 + 增强组件（代码）+ CSS 补丁       |
| 集成层                                     | 构建工具 | Vite / webpack / Rspack / Rollup 插件、CLI、框架模块（Nuxt、Next），详见 §9 |

### 3.2 依赖方向

```
┌────────────────────────────────────────────────────────┐
│ 集成层 (构建插件 / CLI / 框架模块)                        │
│ 识别 · 注入 · 样式顺序 · 拆包 · 诊断 · 编译期 CSS 产物      │
└───────────────────────┬────────────────────────────────┘
                        │ 读取适配包与配置，生成产物并注入
                        ▼
            ┌───────────────┐
            │   配置层       │  (JSON, 可序列化, 可远程下发)
            └───────┬───────┘
                    │ 产出配置
                    ▼
┌────────┐   ┌───────────────────────────────┐   ┌──────────────┐
│ 适配层  │──▶│ 核心 (glass-core)              │◀──│ 平台探针      │
│ 每库一包 │   │ 策略解析 · token · 调度接口     │   │ (按平台实现)  │
└────┬───┘   └──────────────┬────────────────┘   └──────────────┘
     │                      │ 选择档位并调用
     ▼                      ▼
┌────────┐   ┌───────────────────────────────┐
│ 绑定层  │   │ 渲染后端 (按平台)               │
│ Vue/React│  │ css / svg / webgl / native    │
└────────┘   └───────────────────────────────┘
```

原则：适配层与绑定层依赖核心的公开接口；配置层只产出"解析后的策略"，由核心消费；核心对具体组件库与框架一无所知。集成层位于最外侧，只负责读取适配包与配置、生成产物并注入，不参与运行时渲染决策。

### 3.3 建议的包结构

```
packages/
  glass-core/           # 纯逻辑：resolve、token、类型、调度接口（无 DOM 依赖）
  glass-web/            # Web 探针 + css/svg/webgl 后端 + 声明式发现（MutationObserver）
  glass-mp/             # 小程序：逻辑层运行时 + wxss 变量 + 平台能力表
  glass-bridge/         # 混合应用：iOS 26 原生玻璃桥接
  glass-vue/            # v-glass 指令 / useGlass / <Glass>
  glass-react/          # useGlass / <Glass>
  adapter-vant/         # 选择器映射 + 变量映射
  adapter-antd-mobile/
  adapter-nutui/
  adapter-tdesign-vue/ 、adapter-tdesign-react/
  adapter-vant-weapp/  # 小程序版本另立（DOM 与样式隔离机制不同）
  unplugin/            # 构建插件核心（Vite / webpack / Rspack / Rollup 共用）
  plugin-vite/ 、plugin-webpack/   # 薄封装，按需提供
  cli/                 # glass init / glass build / glass doctor
  module-nuxt/ 、module-next/      # 框架模块（按需）
```

---

## 4. 三个契约接口

三个接口分别对应三条轴之间的边界：**Surface 声明**（适配层 / 绑定层 → 核心）、**Backend**（核心 → 平台后端）、**Probe**（平台 → 核心）。这三个先定下来，各包才能并行开发。

### 4.1 材质 token（token v2：通道模型）

**JS 对象是运行时唯一权威形态；CSS 变量 / WebGL uniforms 只是投影。** token 按通道（Channel）做语义分组，core 不理解通道语义，只做合并与插值（设计详见 `docs/proposals/token-system-v2.md`）：

```ts
export interface GlassTokens {
  material: MaterialTokens; // 形状冻结（与 --glass-* 一一对应，见下）
  refraction?: RefractionTokens; // 折射通道：strength / ior / bezelWidth / aberration / rimLight
  motion?: MotionTokens; // 交互物理通道：液滴弹簧参数（TabBar 增强件消费）
  [channel: string]: unknown; // 未知通道透传（前向兼容：风格包先行、消费者后到）
}
```

`material` 通道固定映射为 CSS 变量（适配层与业务 CSS 均可读写）：

```css
:root {
  --glass-blur: 16px; /* 背景模糊半径 */
  --glass-saturation: 1.4; /* 背景饱和度 */
  --glass-tint: rgba(255, 255, 255, 0.18);
  --glass-border: rgba(255, 255, 255, 0.35);
  --glass-highlight: 0.6; /* 顶部/边缘高光强度 0..1 */
  --glass-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  --glass-refraction: 0; /* 折射强度（= refraction 通道 strength 投影），仅 svg/webgl/native 档生效 */
  --glass-radius: 24px;
}
```

其余通道进 CSS 语境按 `--glass-<channel>-<field>` 拍平（如 `--glass-refraction-strength`），仅投影消费方需要的字段。

### 4.2 Surface 声明

```ts
export type Tier = "none" | "solid" | "css" | "svg" | "webgl" | "native";
export type SurfaceRole = "bar" | "sheet" | "overlay" | "control" | "card" | "capsule";
export type MaterialPreset = "regular" | "clear" | "tinted";

export interface SurfaceShape {
  kind: "rounded" | "capsule" | "circle";
  radius?: number | "auto";
}

/** 折射所需背景的来源提示；css 档忽略 */
export type BackdropHint =
  | "page" // 页面内容（由浏览器提供，svg 档可用）
  | "self" // 元素自身背景
  | { kind: "source"; id: string }; // 显式背景源（webgl 档需要）

export interface SurfaceDeclaration {
  role: SurfaceRole;
  shape?: SurfaceShape;
  material?: MaterialPreset;
  intensity?: number; // 0..1，覆盖全局
  tint?: string; // 覆盖着色
  interactive?: boolean; // 按压回弹、高光跟随
  group?: string; // 同组玻璃块的"融合"分组（如相邻胶囊）
  backdrop?: BackdropHint;
  maxTier?: Tier; // 该表面单独限制的档位上限
}
```

声明式用法（H5，无需绑定层，由核心自动发现）：

```html
<nav data-glass="bar" data-glass-shape="capsule" data-glass-intensity="0.8"></nav>
```

### 4.3 Backend（渲染后端）

```ts
/** 每个平台自己决定 target 的具体类型 */
export interface SurfaceHandle<T = unknown> {
  id: string;
  target: T; // Web: HTMLElement；小程序: 组件 id / ref；原生壳: view tag
  declaration: SurfaceDeclaration;
}

export interface RenderPlan {
  tier: Tier;
  tokens: GlassTokens; // 通道化 token 集（§4.1）
  interactive: boolean;
  reasons: ReasonCode[]; // 为什么选这一档 / 为什么降级（用于调试）
}

export interface BackendInstance {
  update(plan: RenderPlan): void;
  pause(): void; // 不可见 / KeepAlive 失活 / 滚动中降级
  resume(): void;
  unmount(): void; // 必须幂等（React StrictMode 会重复挂载）
}

export interface GlassBackend<T = unknown> {
  readonly tier: Tier;
  readonly platform: Platform;
  supports(caps: Capabilities, surface: SurfaceHandle<T>): boolean;
  mount(surface: SurfaceHandle<T>, plan: RenderPlan): BackendInstance;
}
```

约定：共享资源（例如全局共用的 WebGL canvas 与调度器）由后端内部管理，不对外暴露；同屏数量超出预算时，由核心通知后端降档。

### 4.4 Probe（平台探针）

```ts
export type Platform = "web" | "miniprogram" | "native-shell";

export interface Capabilities {
  platform: Platform;
  engine?: "blink" | "webkit" | "gecko" | "other";
  os?: "ios" | "android" | "harmony" | "desktop";
  osVersion?: string;

  backdropFilter: boolean;
  backdropFilterWithSvg: boolean; // SVG 滤镜能否用于 backdrop-filter（Safari 通常为 false）
  webgl2: boolean;
  webgpu?: boolean;
  htmlInCanvas?: boolean; // 实验特性
  nativeGlass: boolean; // iOS 26+ 且存在桥接

  a11y: {
    reduceTransparency: boolean;
    reduceMotion: boolean;
    increaseContrast: boolean;
  };
  device: { tier: "low" | "mid" | "high"; dpr: number };
  mp?: { sdkVersion: string }; // 小程序基础库版本
}

export interface PlatformProbe {
  readonly platform: Platform;
  detect(): Capabilities | Promise<Capabilities>;
  /** 系统设置变化（如用户开启"降低透明度"）时通知核心重新解析 */
  subscribe?(cb: (caps: Capabilities) => void): () => void;
}
```

### 4.5 背景源（为 WebGL 档预留）

```ts
export interface BackdropSource {
  id: string;
  kind: "static-image" | "video" | "canvas" | "html-in-canvas";
  /** 返回可用于 WebGL 纹理上传的对象；由 webgl 后端消费 */
  acquire(): Promise<TexImageSource | null>;
  release(): void;
}
```

即使第一版不做 WebGL，也先在接口里预留，避免以后改动波及所有后端与适配层。

---

## 5. 配置层

### 5.1 配置 schema

```ts
export interface GlassConfig {
  version: 1;
  preset?: string; // 主题预设名
  style?: string; // 风格 id：风格包注册后的取用键（'ios27' 主要方向，'ios26' 历史基线；风格数据在风格包维护，core 零风格数据，未注册回退内置 basic）
  intensity: "subtle" | "regular" | "strong" | number;
  material: MaterialPreset;
  maxTier: Tier; // 全局档位上限
  fallback: "solid" | "blur" | "none"; // 无法达到目标档时的降级形态

  budget: {
    maxSurfaces: number; // 同屏玻璃数上限
    dprCap: number; // 分辨率倍率上限
    fpsCap: number;
    degradeOnScroll: boolean; // 滚动中临时降档
  };
  motion: {
    interactive: boolean;
    respectReducedMotion: boolean;
  };

  rules?: CompatRule[]; // 按环境的兼容规则
  roles?: Partial<Record<SurfaceRole, RoleOverride>>;
  advanced?: GlassAdvanced; // 通道级 token 覆盖：{ material: {...}, refraction: {...} }（优先级最高，逐字段生效）
}

export interface CompatRule {
  when: {
    platform?: Platform;
    engine?: Capabilities["engine"];
    os?: Capabilities["os"];
    osVersion?: string; // semver 范围
    sdkVersion?: string; // 小程序基础库范围
  };
  then: { maxTier?: Tier; intensity?: number; disable?: boolean };
}
```

### 5.2 优先级（高 → 低）

1. 系统无障碍设置（降低透明度、增强对比度、减少动态）：强制生效，业务配置不可覆盖
2. 兼容规则（`rules`）
3. 开发者显式配置（全局 `maxTier`、Surface 的 `maxTier`）
4. 主题预设
5. 默认值

### 5.3 强度映射与风格包（token v2）

`intensity`（0..1，语义档 subtle/regular/strong = 0/0.5/1）通过**风格包**（StylePack）的三锚点分段插值映射到各通道物理参数。core 只内置极简 `basic` 安全网（未注册风格包时框架可用），真实风格以独立数据包维护（`packages/styles/`，纯 JSON-safe 数据，可远程下发）：

```ts
registerStyle(ios27)                                  // 显式注册（主路径）
// 或 import '@et4proj/liquid-glass-style-ios27/auto' // side-effect 便捷入口

const pack: StylePack = {
  id: 'ios28',
  base: 'ios27',                                      // 继承基准：通道级深合并，只声明差异字段
  channels: {
    material:  { stops: { subtle/regular/strong: {...} }, static: { 按材质预设的基础外观 } },
    refraction: { stops: { strength 锚点 }, static: { ior, bezelWidth, ... } },
    motion:    { static: { 液滴弹簧参数 } },          // 交互物理通道
    'x-*':     { /* 自定义通道原样透传（宽松校验 + dev 警告） */ },
  },
}
```

插值规则：数值线性插值、非数值取就近锚点；`stops` 派生值覆盖 `static` 同名字段；`interpolate` 是唯一非序列化的可选增强。各风格校准值见对应包内注释（ios27 依据 `docs/research/ios27-liquid-glass-spec.md` §5）。

### 5.4 其他约定

- 配置可 JSON 序列化，方便远程下发、灰度和按机型降级。
- 提供调试接口，能查询某个元素最终使用的档位及原因（`reasons`），否则线上降级问题很难排查。

---

## 6. 核心运行时 API

```ts
const glass = createGlass({
  config, // GlassConfig
  probe, // PlatformProbe
  backends: [cssBackend, svgBackend],
});

// 命令式
const handle = glass.register(el, { role: "bar", shape: { kind: "capsule" } });
handle.unregister();

// 运行时更新配置（远程下发 / 用户偏好）
glass.updateConfig(nextConfig);

// 调试
glass.debug.explain(el); // => RenderPlan（含 reasons）
```

策略解析：

```ts
function resolve(input: {
  config: GlassConfig;
  caps: Capabilities;
  surface: SurfaceDeclaration;
  budget: { activeSurfaces: number };
}): RenderPlan;
```

解析流程：能力探测结果 + 优先级链 → 该表面可用的最高档 → 检查预算 → 输出 `RenderPlan`（含档位、token、原因）。

---

## 7. 适配层规范

### 7.1 职责

适配包分为**数据**（映射清单，覆盖常规组件）与**代码**（增强组件与 CSS 补丁，承载效果质量最依赖的部分，见 §7.6）。数据部分不含渲染代码，包含两类内容：

1. **变量映射**：`--glass-*` 对应到该库自己的变量。
2. **Surface 映射表**：选择器 → `SurfaceDeclaration`，并标注是否为挂载到 body 的弹层。

### 7.2 Manifest 结构

```ts
export interface GlassAdapter {
  library: string;
  versionRange: string; // 适配的组件库版本范围
  framework: "vue" | "react" | "none";
  platform: "web" | "miniprogram";
  tokenMap: Record<string, string>; // '--glass-tint' -> '--van-tabbar-background'
  surfaces: Array<{
    selector: string;
    declaration: SurfaceDeclaration;
    overlay?: boolean; // 弹层通常挂到 body，需要单独处理继承
  }>;
  patches?: string; // 少量必要的 CSS 补丁（透明底、层叠上下文修复）
}
```

### 7.3 示例（Vant，仅示意，选择器与变量名需对照当前版本核实）

```ts
export const vantAdapter: GlassAdapter = {
  library: "vant",
  versionRange: "^4",
  framework: "vue",
  platform: "web",
  tokenMap: {
    "--glass-tint": "--van-tabbar-background",
  },
  surfaces: [
    { selector: ".van-tabbar", declaration: { role: "bar", shape: { kind: "capsule" } } },
    { selector: ".van-nav-bar", declaration: { role: "bar" } },
    { selector: ".van-popup--bottom", declaration: { role: "sheet" }, overlay: true },
    { selector: ".van-switch", declaration: { role: "control", interactive: true } },
  ],
};
```

### 7.4 适合上玻璃的组件

TabBar、NavBar、ActionSheet、Popup、Dialog、Toast、Switch、Slider、分段控件。列表、表单输入、普通卡片一般不需要。

### 7.5 需要新增的增强件（无法只靠改变量实现）

- 悬浮胶囊 TabBar 的选中"气泡"滑动
- 按压回弹、高光跟随
- 相邻玻璃块的融合效果

### 7.6 皮肤包的组成

| 部分       | 形态        | 说明                                                                                                 |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 映射清单   | 数据        | 选择器 → Surface 声明、变量映射，覆盖常规组件                                                        |
| 增强组件   | 代码        | 效果质量最依赖的部分：胶囊 TabBar 的选中气泡、Switch / Slider 的液态滑块、按压回弹、相邻玻璃块融合等 |
| CSS 补丁   | 代码        | 透明底、层叠上下文修复、与组件库默认样式的冲突处理                                                   |
| 测试与基线 | 数据 + 脚本 | 按库与版本的截图基线、真机检测记录                                                                   |

增强组件的原则：尽量只添加属性与类名，不改变 DOM 结构；提供按组件退出的开关。

### 7.7 适配包制作工具

覆盖面是竞争力之一，因此要让"新增一个库 / 版本"的成本足够低：

- 页面上点选元素，半自动生成选择器映射；
- 按库与版本自动跑截图回归；
- manifest 增加运行时识别该库是否存在的方法，以及已知问题列表。

---

## 8. 绑定层规范

绑定层只是把框架生命周期翻译成 `mount / update / unmount`，代码量很小，并且**不是硬依赖**：H5 声明式路线下由核心自行发现 `data-glass`，可完全不用绑定层。

| 框架  | 提供                                  | 需要处理的点                                                                           |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| Vue   | `v-glass` 指令、`useGlass`、`<Glass>` | Teleport 弹层；KeepAlive 激活 / 失活时 `pause / resume`；Nuxt SSR                      |
| React | `useGlass`、`<Glass>`                 | StrictMode 重复挂载（`unmount` 必须幂等）；Portal 弹层；服务端渲染时仅在客户端组件运行 |

---

## 9. 集成层：构建插件与接入深度

### 9.1 接入深度

客户可按需逐级加深，前三级不需要改业务代码：

| 级别 | 做什么                                                           | 业务代码改动           |
| ---- | ---------------------------------------------------------------- | ---------------------- |
| L0   | 构建期生成并注入样式（材质变量、选择器映射、补丁）               | 无                     |
| L1   | 自动注入运行时，探测能力，按档位挂载增强后端（SVG 折射、降档等） | 无                     |
| L2   | 构建期替换个别组件为增强版                                       | 无，但有构建期替换风险 |
| L3   | 业务显式使用 `<Glass>`、`v-glass` 做定制                         | 少量                   |

### 9.2 构建插件的职责

- **自动识别并选择适配包**：读取依赖与版本，选择对应皮肤包；版本超出适配范围时给出构建警告。
- **注入运行时入口**：业务无需手动引入（Vite 可借助 `transformIndexHtml`，webpack 可通过入口注入或 HTML 插件钩子；具体 API 需对照当前版本核实）。
- **保证样式顺序**：皮肤样式必须晚于组件库样式加载，否则覆盖会静默失效，插件应强制并校验。
- **虚拟模块与编译期产物**：由适配数据与配置在构建期生成 CSS（见 9.4），配置变更可热更新。
- **按需拆包**：SVG、WebGL 等重后端用动态导入，仅在探测到支持时加载，基础档保持很小。
- **开发期诊断**：页面叠加调试浮层，显示被匹配的元素、最终档位，以及哪些祖先节点的 `transform` / `filter` 等破坏了 backdrop-filter。
- **统一插件框架**：可考虑基于 unplugin，一份核心同时覆盖 Vite、webpack、Rspack、Rollup；Taro、uni-app 的构建基于它们，但小程序端需输出 wxss，不能靠运行时注入。
- **框架模块**：Nuxt、Next 等需要再包一层模块或配置封装。

### 9.3 插件配置示例（包名为占位）

```ts
// vite.config.ts
import glass from "@glass/unplugin/vite";

export default defineConfig({
  plugins: [
    glass({
      adapter: "auto", // 自动识别组件库与版本
      config: "./glass.config.ts",
      scope: ".glass-scope", // 可选：限定作用范围，便于逐页开启
      level: 1, // L0 / L1 / L2
      diagnostics: "dev",
    }),
  ],
});
```

```ts
export interface GlassPluginOptions {
  adapter?: "auto" | string | GlassAdapter | Array<string | GlassAdapter>;
  config?: string | GlassConfig;
  scope?: string;
  level?: 0 | 1 | 2;
  runtime?: { inject: boolean; lazyBackends: boolean };
  styleOrder?: "after-library";
  diagnostics?: "dev" | "always" | false;
  exclude?: { components?: string[]; routes?: string[] }; // 按组件 / 路由退出
  target?: "web" | "miniprogram";
}
```

### 9.4 编译期 CSS 产物

适配数据 + 配置可以直接编译成一份静态样式表（如 `glass build --adapter vant --config glass.config.ts`）：

- 基础档零 JS 运行时，接入最快；
- SSR 首屏无闪烁；
- 小程序（wxss）可复用同一份产物；
- JS 运行时只作为增强（折射、降档、探测）。

### 9.5 CLI 与安全阀

- `glass init`：扫描依赖识别组件库与版本，生成初始配置与引入片段。
- `glass doctor`：检查样式顺序、层叠上下文冲突、版本超出适配范围、与客户已有主题覆盖的冲突。
- 作用域类限定影响范围；配置中 `disable` 总开关，出问题时可立即关闭，也便于灰度。
- 多份实例保护：微前端等场景可能同时加载多份运行时，全局观察器需做单例保护。

### 9.6 L2 增强组件的风险与原则

通过别名替换或转换来包装组件，会遇到：TS 类型需完整转出；与按需引入插件（如 unplugin-vue-components、babel-plugin-import）的兼容；SSR 水合一致性；业务里依赖 DOM 结构或类名的覆盖样式会失效。

原则：只加属性与类名，不改 DOM 结构；按组件提供退出开关；默认关闭，由客户显式开启。

---

## 10. 小程序

小程序不是"又一个框架"，而是平台约束不同，应单独成包处理。

- **无可操作的 DOM（据了解，需验证）**：逻辑层与渲染层分离，无法直接改元素样式，也没有 MutationObserver；因此依赖 DOM 的后端（SVG、WebGL、自动发现）不可用。
- **能做的路径**：策略解析在逻辑层运行，输出 class、style 与 CSS 变量，由模板绑定。
- **backdrop-filter 表现不一致**：有文章称基础库 2.10.0 起支持且 iOS 优于 Android；微信社区也有反馈称 page-container 中 iOS 不生效、Android 生效。官方明确说明未查到。**默认档位上限设为 `css`，并通过 `rules` 提供按平台和基础库版本的白名单，真机矩阵实测。**
- **样式隔离**：自定义组件默认样式隔离，预期 CSS 变量可继承进组件内部，是换肤的主要通道（需实测）。
- **Taro / uni-app**：是"框架 × 平台"的组合（代码写 Vue 或 React，产物为小程序），运行时应按平台分支（编译期条件或环境探测），而不能只按框架判断。
- **平台差异示例**：uni-app x 的一个模糊组件在 Android / 鸿蒙上用原生组件，iOS / H5 直接用 CSS，且当前不覆盖小程序，说明平台后端需要分开。
- **适配包另立**：Vant Weapp 等小程序原生版本的 DOM 与样式机制不同，适配包不能与 H5 版共用映射表。

---

## 11. 效果质量策略与验收

效果质量是核心竞争力，需要先定义"好"，并且可以被量化验证。

### 11.1 Web 端的硬约束

- SVG 滤镜方案仅在 Chromium 上可靠；WebGL 方案计算量大，在生产环境中较难落地（Ionic 主题库作者亦有类似判断）。
- 移动端主战场 iOS Safari / WKWebView 上，靠 WebGL 折射拉开差距很难，需要在其他方向建立差异。

### 11.2 值得投入的方向（均需验证）

- **边缘光照与高光**：多层描边，随滚动或陀螺仪变化的高光，而不是静态渐变。
- **自适应明暗**：根据背景亮度自动调整着色与文字色。
- **交互形变**：按压回弹、选中态形变过渡、相邻玻璃块融合。
- **Chromium 上的真折射**：用构建期预生成的位移贴图降低运行时成本（设计设想，待验证）。
- **受控背景场景**：提供受控背景，让玻璃有内容可折射，解决存量页面纯白底"发灰"的问题；上限是无法折射滚动中的内容，需向客户说明。
- **竞品拆解**：有项目声称在 iPhone / Safari 上做到真折射而非模糊降级，需实测其实现手段与代价。

### 11.3 验收标准

- 与 iOS 26 原生截图并排对比（按组件、按明暗模式）；
- 量化：帧率、功耗、文字可读性（对比度）；
- 作为发布门槛：任一档位未达标，则该档位不默认开启。

---

## 12. 降级矩阵（建议的默认最高档，需真机验证）

| 环境                         | 默认最高档                    | 备注                                                     |
| ---------------------------- | ----------------------------- | -------------------------------------------------------- |
| iOS Safari / WKWebView（H5） | `css`                         | SVG 折射不可用                                           |
| Android Chrome / WebView     | `css`（可选 `svg`）           | 需真机压测                                               |
| 桌面 Chromium                | `svg`；背景可控区域可 `webgl` |                                                          |
| 桌面 Safari / Firefox        | `css`                         |                                                          |
| 混合应用 iOS 26+（有桥接）   | `native`（仅固定控件）        | DOM 继续管状态，控件投射到原生渲染；需处理滚动、布局同步 |
| 小程序                       | `css`（白名单）               | 表现不一致                                               |
| 系统开启"降低透明度"         | `solid`                       | 强制，不可被业务覆盖                                     |

---

## 13. 性能、SSR 与无障碍

**性能预算（由核心执行，配置层只给数字）**

- 共享单个 WebGL canvas 绘制所有玻璃块（浏览器对 WebGL 上下文数量有限制）。
- 可见性检测（IntersectionObserver）；不可见即 `pause`。
- 滚动中临时降档；同屏数量超限自动降档。
- 限制 `dpr` 与帧率。

**SSR / 首屏**

- 服务端仅输出基线 CSS；客户端探测后再升档，避免首屏闪烁。
- 探测逻辑只在客户端运行。

**无障碍与可读性**

- 遵循 `prefers-reduced-transparency`、`prefers-contrast`、`prefers-reduced-motion`，并通过 `Probe.subscribe` 响应运行中变化。
- 文字对比度需为每个 role 提供保底：玻璃底之上的文字自动加深或加遮罩。

**CSS 层叠上下文风险**

- `transform`、`filter`、`opacity`、`overflow` 等会破坏 backdrop-filter，适配层的 `patches` 需要逐组件排查。

---

## 14. 分阶段路线

| 阶段 | 内容                                                                                                                         | 验证点                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M0   | 定稿三个契约接口；`glass-core`（纯逻辑，无 DOM 依赖）                                                                        | 单元测试覆盖 `resolve` 的优先级与降级                                                                    |
| M1   | CSS 皮肤（含编译期产物）+ Vite 插件（L0 / L1，基于 unplugin）+ `glass init` + 1 个适配包 + 1 个增强件（胶囊 TabBar）+ 展示站 | 存量 Demo 项目零改动接入；iOS Safari、Android WebView 真机的效果、弹层继承、滚动性能；与 iOS 26 对标验收 |
| M2   | SVG 折射后端（Chromium）；webpack / Rspack 支持；Vue 或 React 绑定；第二个适配包；`glass doctor`；配置远程下发               | 样式顺序与拆包在两类构建工具下稳定；StrictMode / KeepAlive / Teleport 场景稳定                           |
| M3   | 小程序包（wxss 产物 + 平台能力表 + 真机验证）；受控背景场景；更多增强件（Switch、Slider 等）                                 | 小程序 iOS / Android 真机矩阵                                                                            |
| M4   | 原生桥接档；WebGL 档（仅背景可控区域）；HTML-in-Canvas 探索                                                                  | 桥接下滚动同步；功耗与发热压测                                                                           |

说明：M1 先做 Vite，是因为基于 unplugin 后 webpack / Rspack 只是薄封装，成本较低；若客户构建工具分布另有要求，可调整顺序。

首发适配库建议：Vue 技术栈且要多端选 Vant 或 NutUI；React 技术栈选 antd-mobile；TDesign 先观察官方动向。

---

## 15. 风险与开放问题

**风险**

- 组件库升级导致 DOM 或类名变化：适配层数据化、按 `versionRange` 管理，并有截图回归。
- TDesign 等官方可能推出第一方液态玻璃方案：关注 tdesign-common 相关 issue，保持接口可对接。
- 构建工具主版本 API 变化：以 unplugin 统一封装，并对 Vite / webpack 主版本做 CI 矩阵。
- 样式顺序被其他插件打乱，或与客户已有主题覆盖冲突：由 `glass doctor` 检测并提示。
- L2 增强组件的侵入风险：默认关闭，按组件退出。
- 存量页面纯白底导致效果"发灰"：提供受控背景场景与主题预设，并在交付时说明上限。
- 移动端 WebGL 功耗与发热：需真机压测后再决定是否投入。
- 效果被模仿、被"自己写 CSS"替代：靠效果质量、多库多版本覆盖、降级与合规、持续维护建立差异。
- 市场需求与付费意愿：目前没有数据，需通过访谈与展示站验证。

**待决问题**

1. 是否覆盖小程序？（决定核心是否必须从第一天起就无 DOM 依赖）
2. 首发适配的组件库与框架？
3. 原生桥接自研，还是复用现有方案（Ionic 社区、RN、uni-app x 等）？
4. 商业形态：开源核心 + 付费适配包，还是项目制服务？
5. 是否扩展到 PC 库（Element、antd 等）？适配层这条轴是通用的，但 Surface 角色需要扩展（顶栏、侧栏、Modal、Dropdown 等）。

---

## 附录：参考链接

- HTML-in-Canvas 提案：https://github.com/WICG/html-in-canvas
- liquid-glass-studio（WebGL2 / WebGPU）：https://github.com/iyinchao/liquid-glass-studio
- @callstack/liquid-glass（React Native）：https://github.com/callstack/liquid-glass
- Expo GlassEffect：https://docs.expo.dev/versions/latest/sdk/glass-effect
- Kuikly iOS 液态玻璃：https://kuikly.tds.qq.com/API/components/ios26-liquid-glass.html
- Liquid UI（Vue 3）：https://github.com/kodlyft/liquid-ui
- TDesign Tabbar 液态玻璃 issue：https://github.com/Tencent/tdesign-common/issues/2571
- Ionic 原生 Liquid Glass 投射 PR：https://github.com/rdlabo-dev/ionic-theme-ios27/pull/153
- Konsta UI：https://konstaui.com/
- awesome-liquid-glass：https://github.com/carolhsiaoo/awesome-liquid-glass
- unplugin（统一构建插件框架）：https://github.com/unjs/unplugin
