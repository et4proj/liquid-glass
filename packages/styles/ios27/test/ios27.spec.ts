import { describe, expect, it } from 'vitest'
import { buildTokens, registerStyle, resolveStyle, solidTokens } from '@et4proj/liquid-glass-core'
import { ios27 } from '../src'

registerStyle(ios27)

describe('ios27 风格包', () => {
  it('注册后可解析，id/label/通道齐全', () => {
    const pack = resolveStyle('ios27')
    expect(pack.id).toBe('ios27')
    expect(pack.channels.material).toBeDefined()
    expect(pack.channels.refraction).toBeDefined()
    expect(pack.channels.motion).toBeDefined()
  })

  it('三锚点校准值：更通透（blur 2/6/12）、亮高光（0.5/0.8/1.0）', () => {
    expect(ios27.channels.material.stops!.subtle).toEqual({ blur: 2, saturation: 1.4, highlight: 0.5 })
    expect(ios27.channels.material.stops!.regular).toEqual({ blur: 6, saturation: 1.6, highlight: 0.8 })
    expect(ios27.channels.material.stops!.strong).toEqual({ blur: 12, saturation: 1.8, highlight: 1.0 })
  })

  it('暗化边缘：shadow 内嵌 1px 暗环（darkened edge）', () => {
    const tokens = buildTokens({ material: 'regular', intensity: 'regular', style: 'ios27' })
    expect(tokens.material.shadow).toContain('inset 0 0 0 1px rgba(0,0,0')
  })

  it('refraction 通道：强折射 0.35/0.7/1.0 + Snell 参数', () => {
    const strong = buildTokens({ material: 'regular', intensity: 'strong', style: 'ios27' })
    expect(strong.refraction!.strength).toBe(1.0)
    expect(strong.refraction!.ior).toBe(1.5)
    expect(strong.refraction!.bezelWidth).toBe(0.18)
    expect(strong.refraction!.aberration).toBe(0.08)
    expect(strong.refraction!.rimLight).toBe(0.5)
    // material.refraction 投影（MaterialTokens 形状冻结）
    expect(strong.material.refraction).toBe(strong.refraction!.strength)
  })

  it('motion 通道：液滴弹簧参数（tab 交互规格 §2.2）', () => {
    const tokens = buildTokens({ material: 'regular', intensity: 'regular', style: 'ios27' })
    expect(tokens.motion!.attraction).toBe(0.4)
    expect(tokens.motion!.dragStretchPerSpeed).toBe(0.05)
    expect(tokens.motion!.edgeResistance).toBe(3)
    expect(tokens.motion!.labelFadeLerp).toBe(0.25)
  })

  it('数值强度插值：t=0.25 命中 blur 4（2→6 中点）', () => {
    const tokens = buildTokens({ material: 'regular', intensity: 0.25, style: 'ios27' })
    expect(tokens.material.blur).toBe(4)
  })

  it('solid 降级形态：不透明、无折射', () => {
    const tokens = solidTokens('regular', 'ios27')
    expect(tokens.material.tint).toBe('rgba(255,255,255,0.92)')
    expect(tokens.material.blur).toBe(0)
    expect(tokens.refraction!.strength).toBe(0)
  })
})
