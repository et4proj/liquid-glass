import type { StylePack } from "@et4proj/liquid-glass-core";

/**
 * iOS 27 风格包（主要开发方向）：更通透 · 暗化边缘 · 亮高光 · 强折射。
 * 数据依据 docs/research/ios27-liquid-glass-spec.md §5 校准值表
 * （来源：WWDC26 SOTU + Apple 官网 + kube.io 推导，待真机截图精校）。
 * 纯数据包：JSON-safe，仅依赖 core 类型；注册姿势二选一：
 *   显式：registerStyle(ios27)
 *   便捷：import '@et4proj/liquid-glass-style-ios27/auto'
 */
export const ios27: StylePack = {
  id: "ios27",
  label: "iOS 27（主要方向：更通透 · 暗化边缘 · 亮高光）",
  /** 无障碍降级形态：不透明高对比 */
  solid: { tint: "rgba(255,255,255,0.92)", border: "rgba(255,255,255,0.55)" },
  channels: {
    material: {
      // 极致通透：磨砂感收敛到"仅扩散复杂内容"，靠饱和/折射维持质感
      stops: {
        subtle: { blur: 2, saturation: 1.4, highlight: 0.5 },
        regular: { blur: 6, saturation: 1.6, highlight: 0.8 },
        strong: { blur: 12, saturation: 1.8, highlight: 1.0 },
      },
      static: {
        regular: {
          tint: "rgba(255,255,255,0.08)",
          border: "rgba(255,255,255,0.22)",
          // 暗化边缘：内嵌 1px 暗环制造纵深（WWDC26 "darkened edge"）
          shadow: "0 8px 24px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(0,0,0,0.12)",
          radius: 24,
        },
        clear: {
          tint: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.16)",
          shadow: "0 8px 24px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(0,0,0,0.10)",
          radius: 24,
        },
        tinted: {
          tint: "rgba(255,255,255,0.24)",
          border: "rgba(255,255,255,0.35)",
          shadow: "0 8px 24px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(0,0,0,0.14)",
          radius: 24,
        },
      },
    },
    refraction: {
      stops: {
        subtle: { strength: 0.35 },
        regular: { strength: 0.7 },
        strong: { strength: 1.0 },
      },
      static: {
        ior: 1.5, // 玻璃标准折射率（规格 §3.1）
        bezelWidth: 0.18, // 折射带宽度占半径比例（规格：15–20%，贴图取 18%）
        aberration: 0.08, // 色差（规划仅 WebGL 档消费；iOS 27 已弱化该特征）
        rimLight: 0.5, // 边缘 rim light 不透明度（tab 交互规格 specularOpacity）
      },
    },
    motion: {
      // 液滴弹簧参数：docs/research/ios27-tab-interaction-spec.md §2.2（liquid-toggle 实测值）
      static: {
        attraction: 0.4,
        stretchPerSpeed: 0.02,
        maxStretch: 0.35,
        dragStretchPerSpeed: 0.05,
        dragMaxStretch: 0.4,
        wobbleLerp: 0.2,
        edgeResistance: 3,
        settleDistance: 0.1,
        settleWobble: 0.01,
        labelFadeLerp: 0.25,
      },
    },
  },
};
