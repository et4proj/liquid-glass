import type { GlassAdapterManifest } from "@et4proj/liquid-glass-adapter";

/**
 * antd-mobile v5 玻璃适配 manifest（纯数据包，docs/proposals/adapter-system-design.md §4.1）。
 *
 * 约定：
 * - 效果数值全部来自 token 体系（风格包），本文件只有结构语义（选择器/角色/形状）
 * - 类名与 CSS 变量以 antd-mobile v5.x 实测为准（架构 §7.3：变量名可能随版本漂移）
 * - 无 auto 副作用入口：显式 applyAdapter 优于隐式接管（用户决策记录）
 * - v1 只做 L0/L1：不做 L2 增强件
 *
 * tokenMap 变量清单（2026-10-18 从 antd-mobile 5.43.0 源码 es/components/*.css 实证提取）：
 * 库变量两层——全局主题变量（--adm-*，挂 :root）+ 组件局部变量（--width 等，挂组件根类）。
 * 诚实映射原则：只映射 glass token 有真实语义对应的变量（材质三件套：底色/边缘/着色），
 * 文字层级（text/weak/secondary）、语义色（danger/warning/success）、排版（font-size）、
 * 层叠（z-index）不映射——玻璃体系管材质，不管信息语义。别名作用域 :where(.lg-surface)，
 * 弹层内层元素经 var() 继承链取到别名（继承不断链，见 adapter apply.ts）。
 */
export const antdMobileAdapter: GlassAdapterManifest = {
  library: "antd-mobile",
  versionRange: "^5",
  framework: "react",
  platform: "web",

  // v1 不做库存在性检测（antd-mobile 无可靠的全局标记；未安装时 surfaces 扫描自然无命中，无副作用）
  detect: undefined,

  // 别名而非拷贝：库变量 → var(--glass-*)，updateConfig 零重注入、风格切换实时生效
  tokenMap: {
    // 组件实底色（popup/action-sheet 内容底等）→ 玻璃半透明底
    "--adm-color-background": "--glass-tint",
    // 底/边框色（dialog 分隔边框、switch 未选中底边框）→ 玻璃边缘色
    "--adm-color-border": "--glass-border",
    // 主题强调色（tab-bar 选中图标、switch checked）→ 玻璃着色
    "--adm-color-primary": "--glass-tint",
  },

  surfaces: [
    // 底部导航：胶囊玻璃
    { selector: ".adm-tab-bar", declaration: { role: "bar", shape: { kind: "capsule" } } },
    // 顶部导航
    { selector: ".adm-nav-bar", declaration: { role: "bar" } },
    // 弹层三件套（挂 body，靠"变量挂元素自身"继承 --glass-*）
    { selector: ".adm-popup", declaration: { role: "sheet" }, overlay: true },
    { selector: ".adm-dialog-content", declaration: { role: "sheet" }, overlay: true },
    { selector: ".adm-action-sheet", declaration: { role: "sheet" }, overlay: true },
    // Toast：卡片玻璃
    { selector: ".adm-toast", declaration: { role: "card" }, overlay: true },
    // 开关：小控件玻璃（注入手段①声明激活——interactive 带来按压回弹+指针高光）
    { selector: ".adm-switch", declaration: { role: "control", interactive: true } },
  ],

  patches: [
    {
      id: "bar-transparent",
      css: `:where(.adm-tab-bar),
:where(.adm-nav-bar) {
  background: transparent;
  border-color: transparent;
}`,
    },
    {
      id: "overlay-transparent",
      css: `:where(.adm-popup),
:where(.adm-dialog-content),
:where(.adm-action-sheet),
:where(.adm-toast) {
  background: transparent;
}`,
    },
    // :where() 特异性为 0：让 .lg-surface 的 background: var(--glass-tint) 接管库默认实底
  ],

  knownIssues: [
    "类名/CSS 变量以 antd-mobile v5.x 实测为准（架构 §7.3 变量名漂移风险）",
    "Switch 玻璃化的圆角/尺寸观感待真机打磨（--glass-radius 对小控件可能偏大）",
    "Slider / SegmentedControl / ImageUploader 尚未纳入 surfaces（v2 扩面）",
    "--adm-color-primary 同时映射为玻璃着色，选中态对比度在深色背景待真机确认（必要时改恒定色）",
  ],
};
