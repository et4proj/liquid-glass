import { describe, expect, it } from 'vitest'
import { createGlass } from '../src/runtime'
import { SURFACE_CLASS } from '../src/css-backend'
import { registerStyle } from '@et4proj/liquid-glass-core'
import type { Capabilities, PlatformProbe } from '@et4proj/liquid-glass-core'
import { ios27 } from '@et4proj/liquid-glass-style-ios27'

// 默认 config.style = 'ios27'，须注册风格包
registerStyle(ios27)

/** 同步探针：detect 立即返回，可选监听回调以便模拟能力变化 */
function syncProbe(initial: Capabilities): { probe: PlatformProbe; emit: (caps: Capabilities) => void } {
  let current = initial
  let listener: ((caps: Capabilities) => void) | null = null
  return {
    probe: {
      platform: 'web',
      detect: () => current,
      subscribe(cb) {
        listener = cb
        return () => {
          listener = null
        }
      },
    },
    emit(caps) {
      current = caps
      listener?.(caps)
    },
  }
}

const caps: Capabilities = {
  platform: 'web',
  engine: 'blink',
  os: 'android',
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  a11y: { reduceTransparency: false, reduceMotion: false, increaseContrast: false },
  device: { tier: 'high', dpr: 3 },
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createGlass 运行时', () => {
  it('register 后元素挂载玻璃样式，explain 返回决策', async () => {
    const { probe } = syncProbe(caps)
    const glass = createGlass({ probe, backends: [] })
    // 无后端时也应安全：register 不抛错，explain 有 plan
    const el = document.createElement('div')
    const handle = glass.register(el, { role: 'bar', intensity: 1 })
    await flush()
    const plan = glass.debug.explain(el)
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe('css')
    expect(plan!.tokens.material.blur).toBe(12) // ios27 strong
    expect(plan!.tokens.refraction!.strength).toBe(1)
    expect(glass.debug.surfaces.length).toBe(1)
    handle.unregister()
    glass.dispose()
  })

  it('css 后端渲染：class + 变量；updateConfig 实时刷新', async () => {
    const { probe } = syncProbe(caps)
    const { createCssBackend } = await import('../src/css-backend')
    const glass = createGlass({ probe, backends: [createCssBackend()] })
    const el = document.createElement('nav')
    glass.register(el, { role: 'bar' })
    await flush()
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true)
    expect(el.style.getPropertyValue('--glass-blur')).toBe('6px') // ios27 regular

    glass.updateConfig({ intensity: 'subtle' })
    expect(el.style.getPropertyValue('--glass-blur')).toBe('2px') // ios27 subtle
    glass.dispose()
  })

  it('重复 register 同一 target 返回同一句柄', () => {
    const { probe } = syncProbe(caps)
    const glass = createGlass({ probe, backends: [] })
    const el = document.createElement('div')
    const a = glass.register(el, { role: 'card' })
    const b = glass.register(el, { role: 'card' })
    expect(a).toBe(b)
    glass.dispose()
  })

  it('unregister 卸载效果并触发其余表面重算 budget', async () => {
    const { probe } = syncProbe(caps)
    const { createCssBackend } = await import('../src/css-backend')
    const glass = createGlass({
      probe,
      config: { budget: { maxSurfaces: 1 } },
      backends: [createCssBackend()],
    })
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const h1 = glass.register(el1, { role: 'card' })
    const h2 = glass.register(el2, { role: 'card' })
    await flush()
    // 第二个表面超预算 → 降档 solid
    expect(glass.debug.explain(el1)!.tier).toBe('css')
    expect(glass.debug.explain(el2)!.reasons).toContain('budget:max-surfaces')

    h1.unregister()
    await flush()
    // el2 现在未超预算 → 回到 css
    expect(glass.debug.explain(el2)!.tier).toBe('css')
    expect(el2.style.getPropertyValue('--glass-blur')).toBe('6px') // ios27 regular
    h2.unregister()
    glass.dispose()
  })

  it('探针能力变化（如开启降低透明度）触发全部重解析', async () => {
    const { probe, emit } = syncProbe(caps)
    const { createCssBackend } = await import('../src/css-backend')
    const glass = createGlass({ probe, backends: [createCssBackend()] })
    const el = document.createElement('div')
    glass.register(el, { role: 'card' })
    await flush()
    expect(glass.debug.explain(el)!.tier).toBe('css')

    emit({ ...caps, a11y: { ...caps.a11y, reduceTransparency: true } })
    const plan = glass.debug.explain(el)
    expect(plan!.tier).toBe('solid')
    expect(plan!.reasons).toContain('a11y:reduce-transparency')
    glass.dispose()
  })

  it('disable 规则 → none 档：后端卸载、无 class', async () => {
    const { probe } = syncProbe(caps)
    const { createCssBackend } = await import('../src/css-backend')
    const glass = createGlass({
      probe,
      config: { rules: [{ when: { engine: 'blink' }, then: { disable: true } }] },
      backends: [createCssBackend()],
    })
    const el = document.createElement('div')
    glass.register(el, { role: 'card' })
    await flush()
    expect(glass.debug.explain(el)!.tier).toBe('none')
    expect(el.classList.contains(SURFACE_CLASS)).toBe(false)
    glass.dispose()
  })

  it('dispose 清理全部表面与订阅', async () => {
    const { probe } = syncProbe(caps)
    const { createCssBackend } = await import('../src/css-backend')
    const glass = createGlass({ probe, backends: [createCssBackend()] })
    const el = document.createElement('div')
    glass.register(el, { role: 'card' })
    await flush()
    glass.dispose()
    expect(el.classList.contains(SURFACE_CLASS)).toBe(false)
    expect(glass.debug.surfaces.length).toBe(0)
  })
})
