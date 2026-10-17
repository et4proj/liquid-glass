import type { SelectorSurface } from "@et4proj/liquid-glass-web";

/**
 * 适配层契约（docs/proposals/adapter-system-design.md §4.1）：
 * manifest 是纯数据（JSON-safe），只描述"哪个 DOM 是玻璃、库变量怎么别名、默认样式怎么补"——
 * 效果数值全部来自 token 体系，manifest 内不出现任何效果数值。
 */

export interface GlassAdapterPatch {
  /** 补丁标识（dev 调试用） */
  id: string;
  /** CSS 文本；建议用 :where() 控制特异性，避免压过 .lg-surface 的玻璃样式 */
  css: string;
}

export interface GlassAdapterManifest {
  /** 目标库标识（同时用作注入 style 标签 id 的一部分） */
  library: string;
  /** 语义 semver 范围（M0 不强制校验，仅文档性约束；待定：接入 cli 后再校验） */
  versionRange?: string;
  /** 目标框架（元数据：'react' | 'vue' | ...，内核执行路径不因它分叉） */
  framework?: string;
  /** 目标平台（元数据，缺省 'web'） */
  platform?: string;
  /**
   * 库存在性检测：返回 false 时 applyAdapter no-op（dev 下 console.warn）。
   * 简单场景可缺省（视为恒存在）。
   */
  detect?: () => boolean;
  /**
   * 变量别名表（"别名而非拷贝"）：键 = 库 CSS 变量名，值 = 玻璃变量名（--glass-*）。
   * 生成 `:where(.lg-surface){ 键: var(值) }`——库变量永远引用玻璃变量，
   * 换风格/调强度时零重注入、弹层继承不断链。
   */
  tokenMap?: Record<string, string>;
  /** 表面清单：类名选择器 → Surface 声明（顺序 = 优先级，同一元素首条命中生效） */
  surfaces: SelectorSurface[];
  /** CSS 补丁（透明底 / 层叠上下文修复等库默认样式对抗） */
  patches?: GlassAdapterPatch[];
  /** 已知问题（文档性标注） */
  knownIssues?: string[];
}

export interface GlassAdapterHandle {
  /** 撤销：注销发现 + 引用计数归零时移除注入样式 */
  dispose(): void;
}
