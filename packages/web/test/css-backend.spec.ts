import { describe, expect, it } from 'vitest'
import { createCssBackend, ensureGlobalStyle, SURFACE_CLASS, PAUSED_CLASS } from '../src/css-backend'
import { defineConfig, registerStyle, resolve } from '@et4proj/liquid-glass-core'
import type { Capabilities, GlassConfig, SurfaceHandle } from '@et4proj/liquid-glass-core'
import { ios27 } from '@et4proj/liquid-glass-style-ios27'

// 默认 config.style = 'ios27'，须注册风格包（core 内置 basic 之外零风格数据）
registerStyle(ios27)

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

const config: GlassConfig = defineConfig({ intensity: 'strong' })

const makeSurface = (): SurfaceHandle<HTMLElement> => {
  const el = document.createElement('div')
  return { id: 't', target: el, declaration: { role: 'card' } }
}

const planOf = (surface: SurfaceHandle<HTMLElement>) =>
  resolve({ config, caps, surface: surface.declaration })

describe('ensureGlobalStyle', () => {
  it('幂等注入全局样式', () => {
    ensureGlobalStyle()
    ensureGlobalStyle()
    const styles = document.querySelectorAll('style#liquid-glass-web-style')
    expect(styles.length).toBe(1)
    expect(styles[0]!.textContent).toContain(SURFACE_CLASS)
  })
})

describe('cssBackend', () => {
  it('mount 写入 surface class 与 --glass-* 变量', () => {
    const backend = createCssBackend()
    const surface = makeSurface()
    const plan = planOf(surface)
    expect(backend.supports(caps, surface)).toBe(true)
    backend.mount(surface, plan)
    const el = surface.target
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true)
    // ios27 校准值：strong blur 12px、regular tint 0.08
    expect(el.style.getPropertyValue('--glass-blur')).toBe('12px')
    expect(el.style.getPropertyValue('--glass-tint')).toBe('rgba(255,255,255,0.08)')
  })

  it('update 刷新变量', () => {
    const backend = createCssBackend()
    const surface = makeSurface()
    const inst = backend.mount(surface, planOf(surface))
    inst.update(resolve({ config: defineConfig({ intensity: 'subtle' }), caps, surface: surface.declaration }))
    expect(surface.target.style.getPropertyValue('--glass-blur')).toBe('2px')
  })

  it('pause / resume 切换降开销 class', () => {
    const backend = createCssBackend()
    const surface = makeSurface()
    const inst = backend.mount(surface, planOf(surface))
    inst.pause()
    expect(surface.target.classList.contains(PAUSED_CLASS)).toBe(true)
    inst.resume()
    expect(surface.target.classList.contains(PAUSED_CLASS)).toBe(false)
  })

  it('unmount 幂等：清理 class 与变量，重复调用安全', () => {
    const backend = createCssBackend()
    const surface = makeSurface()
    const inst = backend.mount(surface, planOf(surface))
    inst.unmount()
    inst.unmount() // StrictMode 重复卸载
    const el = surface.target
    expect(el.classList.contains(SURFACE_CLASS)).toBe(false)
    expect(el.style.getPropertyValue('--glass-blur')).toBe('')
  })

  it('supports 拒绝非 web 平台', () => {
    const backend = createCssBackend()
    const surface = makeSurface()
    expect(backend.supports({ ...caps, platform: 'miniprogram' }, surface)).toBe(false)
  })
})
