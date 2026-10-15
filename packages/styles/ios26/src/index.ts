import type { StylePack } from '@et4proj/liquid-glass-core'

/**
 * iOS 26 风格包（历史校准基线）：磨砂为主、折射温和。
 * 数值为架构文档 §5.3 示意值（待视觉校准）；新项目建议 ios27。
 * 纯数据包：JSON-safe，仅依赖 core 类型；注册姿势二选一：
 *   显式：registerStyle(ios26)
 *   便捷：import '@et4proj/liquid-glass-style-ios26/auto'
 */
export const ios26: StylePack = {
  id: 'ios26',
  label: 'iOS 26 Liquid Glass（校准基线）',
  solid: { tint: 'rgba(255,255,255,0.92)', border: 'rgba(255,255,255,0.55)' },
  channels: {
    material: {
      stops: {
        subtle: { blur: 8, saturation: 1.2, highlight: 0.3 },
        regular: { blur: 16, saturation: 1.4, highlight: 0.6 },
        strong: { blur: 24, saturation: 1.6, highlight: 0.9 },
      },
      static: {
        regular: {
          tint: 'rgba(255,255,255,0.18)',
          border: 'rgba(255,255,255,0.35)',
          shadow: '0 8px 24px rgba(0,0,0,0.12)',
          radius: 24,
        },
        clear: {
          tint: 'rgba(255,255,255,0.06)',
          border: 'rgba(255,255,255,0.25)',
          shadow: '0 8px 24px rgba(0,0,0,0.08)',
          radius: 24,
        },
        tinted: {
          tint: 'rgba(255,255,255,0.30)',
          border: 'rgba(255,255,255,0.45)',
          shadow: '0 8px 24px rgba(0,0,0,0.16)',
          radius: 24,
        },
      },
    },
    refraction: {
      stops: {
        subtle: { strength: 0.2 },
        regular: { strength: 0.5 },
        strong: { strength: 0.8 },
      },
      static: {
        ior: 1.5,
        bezelWidth: 0.18,
      },
    },
  },
}
