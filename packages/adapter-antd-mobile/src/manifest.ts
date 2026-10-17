import type { GlassAdapterManifest } from "@et4proj/liquid-glass-adapter";

/**
 * antd-mobile v5 玻璃适配 manifest（纯数据包，docs/proposals/adapter-system-design.md §4.1）。
 *
 * 约定：
 * - 效果数值全部来自 token 体系（风格包），本文件只有结构语义（选择器/角色/形状）
 * - 类名与 CSS 变量以 antd-mobile v5.x 实测为准（架构 §7.3：变量名可能随版本漂移）
 * - 无 auto 副作用入口：显式 applyAdapter 优于隐式接管（用户决策记录）
 * - v1 只做 L0/L1：不映射变量数值（tokenMap 留空，待实测核实库变量清单后补）、不做 L2 增强件
 */
export const antdMobileAdapter: GlassAdapterManifest = {
  library: "antd-mobile",
  versionRange: "^5",
  framework: "react",
  platform: "web",

  // v1 不做库存在性检测（antd-mobile 无可靠的全局标记；未安装时 surfaces 扫描自然无命中，无副作用）
  detect: undefined,

  // v1 留空：antd-mobile v5 暴露的 CSS 变量清单需实测核实后再映射，避免瞎编映射破坏观感。
  // 背景玻璃化由 patches 透明底 + .lg-surface 的 --glass-tint 接管，不依赖库变量。
  tokenMap: undefined,

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
    "tokenMap 待实测库变量清单后补（v1 背景接管不依赖库变量）",
  ],
};
