import { describe, expect, it } from 'vitest'
import { buildTokens, registerStyle, resolveStyle, solidTokens } from '@et4proj/liquid-glass-core'
import { ios26 } from '../src'

registerStyle(ios26)

describe('ios26 风格包（历史基线）', () => {
  it('注册后可解析', () => {
    expect(resolveStyle('ios26').id).toBe('ios26')
  })

  it('三锚点值：磨砂为主（blur 8/16/24）', () => {
    expect(ios26.channels.material.stops!.subtle).toEqual({ blur: 8, saturation: 1.2, highlight: 0.3 })
    expect(ios26.channels.material.stops!.regular).toEqual({ blur: 16, saturation: 1.4, highlight: 0.6 })
    expect(ios26.channels.material.stops!.strong).toEqual({ blur: 24, saturation: 1.6, highlight: 0.9 })
  })

  it('折射温和：0.2/0.5/0.8，无 motion 通道', () => {
    const strong = buildTokens({ material: 'regular', intensity: 'strong', style: 'ios26' })
    expect(strong.refraction!.strength).toBe(0.8)
    expect(strong.refraction!.ior).toBe(1.5)
    expect(strong.motion).toBeUndefined()
  })

  it('shadow 无暗环（iOS 26 无 darkened edge）', () => {
    const tokens = buildTokens({ material: 'regular', intensity: 'regular', style: 'ios26' })
    expect(tokens.material.shadow).not.toContain('inset')
  })

  it('solid 降级形态', () => {
    const tokens = solidTokens('regular', 'ios26')
    expect(tokens.material.tint).toBe('rgba(255,255,255,0.92)')
    expect(tokens.refraction!.strength).toBe(0)
  })
})
