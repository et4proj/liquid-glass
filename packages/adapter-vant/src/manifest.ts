import type { GlassAdapterManifest } from "@et4proj/liquid-glass-adapter";

/**
 * Vant 4 玻璃适配 manifest（纯数据包，docs/proposals/adapter-system-design.md §4.1）。
 *
 * 约定：
 * - 效果数值全部来自 token 体系（风格包），本文件只有结构语义（选择器/角色/形状）
 * - 类名与 CSS 变量以 Vant 4.10.2 源码实测为准（架构 §7.3：变量名可能随版本漂移）
 * - 无 auto 副作用入口：显式 applyAdapter 优于隐式接管（用户决策记录）
 * - v1 只做 L0/L1：不做 L2 增强件
 *
 * tokenMap 变量清单（2026-10-18 从 vant 4.10.2 源码 lib/style/css-variables.css +
 * lib/{tabbar,nav-bar,popup,dialog,toast,switch}/index.css 实证提取）：
 * 与 antd-mobile 不同，Vant 的组件背景不走全局变量而走组件局部变量
 * （--van-tabbar-background 等定义在组件根类上），但它们的值全部 fallback 到
 * 全局层 --van-background-2（定义在 :root）。因此别名注入全局层变量即可沿 var()
 * 引用链生效：元素上 :where(.lg-surface) 的直接定义（特异性 0 但直接）胜过从
 * :root 继承的原值——组件局部变量解析 var(--van-background-2) 时即取到玻璃着色。
 * Toast / Switch 的底色是直接值（不走变量链），由 patches 覆盖。
 * 诚实映射原则同 antd：只映射材质三件套（底色/边缘/着色），文字层级、语义色、
 * 排版、层叠不映射——玻璃体系管材质，不管信息语义。
 */
export const vantAdapter: GlassAdapterManifest = {
  library: "vant",
  versionRange: "^4",
  framework: "vue",
  platform: "web",

  // v1 不做库存在性检测（vant 无可靠的全局标记；未安装时 surfaces 扫描自然无命中，无副作用）
  detect: undefined,

  // 别名而非拷贝：库变量 → var(--glass-*)，updateConfig 零重注入、风格切换实时生效
  tokenMap: {
    // 组件实底色 fallback 层（tabbar/nav-bar/popup/dialog 底色全部经它解析）→ 玻璃半透明底
    "--van-background-2": "--glass-tint",
    // 边框色（cell 分隔线、hairline）→ 玻璃边缘色
    "--van-border-color": "--glass-border",
    // 主题强调色（switch on 态、tabbar active）→ 玻璃着色
    "--van-primary-color": "--glass-tint",
  },

  surfaces: [
    // 底部导航：胶囊玻璃
    { selector: ".van-tabbar", declaration: { role: "bar", shape: { kind: "capsule" } } },
    // 顶部导航
    { selector: ".van-nav-bar", declaration: { role: "bar" } },
    // 弹层（ActionSheet 内部即 .van-popup 变体，一条覆盖）
    { selector: ".van-popup", declaration: { role: "sheet" }, overlay: true },
    // 对话框（独立容器，非 popup 变体）
    { selector: ".van-dialog", declaration: { role: "sheet" }, overlay: true },
    // Toast：卡片玻璃
    { selector: ".van-toast", declaration: { role: "card" }, overlay: true },
    // 开关：小控件玻璃（注入手段①声明激活——interactive 带来按压回弹+指针高光）
    { selector: ".van-switch", declaration: { role: "control", interactive: true } },
  ],

  patches: [
    {
      id: "bar-transparent",
      css: `:where(.van-tabbar),
:where(.van-nav-bar) {
  background: transparent;
  border-color: transparent;
}`,
    },
    {
      id: "overlay-transparent",
      // toast 底色为直接值 rgba(0,0,0,.7)（不走变量链），必须显式透明化交给玻璃接管
      css: `:where(.van-popup),
:where(.van-dialog),
:where(.van-toast) {
  background: transparent;
}`,
    },
    {
      id: "switch-glass-tint",
      // switch off 态底色为直接值 rgba(120,120,128,.16)（不走变量链）：
      // 以 0,2,0 特异性压过 .van-switch 的 0,1,0 局部变量定义，off 态底交给玻璃着色
      css: `.lg-surface.van-switch {
  --van-switch-background: var(--glass-tint);
}`,
    },
    // :where() 特异性为 0：让 .lg-surface 的 background: var(--glass-tint) 接管库默认实底
  ],

  knownIssues: [
    "类名/CSS 变量以 Vant 4.10.2 源码实测为准（架构 §7.3 变量名漂移风险）",
    "Toast 原生深底是库的刻意设计，玻璃接管后白字对比度待真机确认",
    "--van-primary-color 同时映射为玻璃着色，switch on 态/active 态在深色背景待真机确认（必要时改恒定色）",
    "Slider / Segmented / Search 尚未纳入 surfaces（v2 扩面）",
  ],
};
