import { describe, expect, it } from 'vitest'
import { parseDataGlass, mountDiscovery } from '../src/discovery'
import { createGlass } from '../src/runtime'
import { createCssBackend, SURFACE_CLASS } from '../src/css-backend'
import type { Capabilities } from '@et4proj/liquid-glass-core'

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

describe('parseDataGlass', () => {
  it('解析 role 与可选属性', () => {
    const el = document.createElement('nav')
    el.setAttribute('data-glass', 'bar')
    el.setAttribute('data-glass-shape', 'capsule')
    el.setAttribute('data-glass-intensity', '0.8')
    el.setAttribute('data-glass-material', 'clear')
    el.setAttribute('data-glass-interactive', 'true')
    el.setAttribute('data-glass-group', 'tabbar')
    el.setAttribute('data-glass-max-tier', 'css')
    expect(parseDataGlass(el)).toEqual({
      role: 'bar',
      shape: { kind: 'capsule', radius: 'auto' },
      intensity: 0.8,
      material: 'clear',
      interactive: true,
      group: 'tabbar',
      maxTier: 'css',
    })
  })

  it('非法 role / 无属性返回 null，数值越界夹取', () => {
    const bad = document.createElement('div')
    bad.setAttribute('data-glass', 'hero')
    expect(parseDataGlass(bad)).toBeNull()
    expect(parseDataGlass(document.createElement('div'))).toBeNull()

    const el = document.createElement('div')
    el.setAttribute('data-glass', 'card')
    el.setAttribute('data-glass-intensity', '2')
    expect(parseDataGlass(el)!.intensity).toBe(1)
  })
})

describe('mountDiscovery', () => {
  it('初始扫描 + 动态增删自动注册/注销', async () => {
    const glass = createGlass({
      probe: { platform: 'web', detect: () => caps },
      backends: [createCssBackend()],
    })
    const root = document.createElement('div')
    const nav = document.createElement('nav')
    nav.setAttribute('data-glass', 'bar')
    root.appendChild(nav)

    const discovery = mountDiscovery(glass, root)
    await flush()
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(true)

    // 动态新增
    const card = document.createElement('section')
    card.setAttribute('data-glass', 'card')
    root.appendChild(card)
    await flush()
    expect(card.classList.contains(SURFACE_CLASS)).toBe(true)

    // 移除 → 注销
    card.remove()
    await flush()
    expect(glass.debug.explain(card)).toBeNull()
    expect(glass.debug.surfaces.length).toBe(1) // 只剩 nav

    discovery.dispose()
    glass.dispose()
  })

  it('dispose 注销全部由发现注册的表面', async () => {
    const glass = createGlass({
      probe: { platform: 'web', detect: () => caps },
      backends: [createCssBackend()],
    })
    const root = document.createElement('div')
    const nav = document.createElement('nav')
    nav.setAttribute('data-glass', 'bar')
    root.appendChild(nav)
    const discovery = mountDiscovery(glass, root)
    await flush()
    discovery.dispose()
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(false)
    glass.dispose()
  })
})
