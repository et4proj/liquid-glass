import type { Capabilities, PlatformProbe } from '@et4proj/liquid-glass-core'

/**
 * Web 平台探针（架构 §4.4）：
 * - detect()：UA/引擎识别 + CSS.supports + WebGL2 试探 + matchMedia 无障碍
 * - subscribe()：监听三个 prefers-* 媒体查询变化（如系统开启"降低透明度"）
 *
 * 所有能力检测均做环境防御：SSR / 旧环境下缺 API 不抛错，返回保守 false。
 */

interface MediaQueryListLike {
  matches: boolean
  addEventListener?: (type: string, cb: () => void) => void
  removeEventListener?: (type: string, cb: () => void) => void
  addListener?: (cb: () => void) => void
  removeListener?: (cb: () => void) => void
}

interface WindowLike {
  navigator?: { userAgent?: string; hardwareConcurrency?: number }
  matchMedia?: (query: string) => MediaQueryListLike
  devicePixelRatio?: number
  CSS?: { supports?: (prop: string, value: string) => boolean }
  WebGL2RenderingContext?: unknown
  document?: { createElement: (tag: string) => HTMLCanvasElement }
}

const win: WindowLike = typeof window !== 'undefined' ? (window as unknown as WindowLike) : {}

function detectEngine(ua: string): NonNullable<Capabilities['engine']> {
  if (/firefox|fxios/i.test(ua)) return 'gecko'
  // 注意顺序：iOS 上的 Chrome/Edge 也是 webkit 内核
  if (/chrome|chromium|crios|edg\//i.test(ua) && !/edgios/i.test(ua)) return 'blink'
  if (/safari|version\/\d+\.\d+.*safari/i.test(ua)) return 'webkit'
  return 'other'
}

function detectOs(ua: string): NonNullable<Capabilities['os']> {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function osVersion(ua: string): string | undefined {
  const m = /(?:iphone|ipad|ipod)?[^)]*os (\d+[_\d]*)/i.exec(ua) ?? /android (\d+[\d.]*)/i.exec(ua)
  return m?.[1]?.replace(/_/g, '.')
}

function supportsBackdropFilter(): boolean {
  const supports = win.CSS?.supports
  if (!supports) return false
  return supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)')
}

function supportsWebgl2(): boolean {
  try {
    const canvas = win.document?.createElement('canvas')
    if (!canvas) return false
    return !!canvas.getContext('webgl2')
  } catch {
    return false
  }
}

/** SVG 滤镜用于 backdrop-filter：仅 Chromium 可靠（架构 §2.2/§12），Safari/Firefox 保守 false */
function supportsBackdropFilterSvg(engine: NonNullable<Capabilities['engine']>): boolean {
  return engine === 'blink'
}

function detectDeviceTier(): 'low' | 'mid' | 'high' {
  const cores = win.navigator?.hardwareConcurrency ?? 4
  const dpr = win.devicePixelRatio ?? 1
  if (dpr >= 2.5 && cores >= 8) return 'high'
  if (dpr <= 1.5 || cores <= 4) return 'low'
  return 'mid'
}

export function detectWebCapabilities(): Capabilities {
  const ua = win.navigator?.userAgent ?? ''
  const engine = detectEngine(ua)
  const mq = (q: string): boolean => {
    try {
      return !!win.matchMedia?.(q)?.matches
    } catch {
      return false
    }
  }
  return {
    platform: 'web',
    engine,
    os: detectOs(ua),
    osVersion: osVersion(ua),
    backdropFilter: supportsBackdropFilter(),
    backdropFilterWithSvg: supportsBackdropFilterSvg(engine) && supportsBackdropFilter(),
    webgl2: supportsWebgl2(),
    // Web 平台无原生桥接；glass-bridge 混合应用场景由桥接层另行提供探针
    nativeGlass: false,
    a11y: {
      reduceTransparency: mq('(prefers-reduced-transparency: reduce)'),
      reduceMotion: mq('(prefers-reduced-motion: reduce)'),
      increaseContrast: mq('(prefers-contrast: more)'),
    },
    device: { tier: detectDeviceTier(), dpr: win.devicePixelRatio ?? 1 },
  }
}

export function createWebProbe(): PlatformProbe {
  return {
    platform: 'web',
    detect: () => detectWebCapabilities(),
    subscribe(cb: (caps: Capabilities) => void) {
      const queries = [
        '(prefers-reduced-transparency: reduce)',
        '(prefers-reduced-motion: reduce)',
        '(prefers-contrast: more)',
      ]
      const disposers: Array<() => void> = []
      for (const q of queries) {
        const mql = win.matchMedia?.(q)
        if (!mql) continue
        const onChange = () => cb(detectWebCapabilities())
        if (mql.addEventListener) mql.addEventListener('change', onChange)
        else if (mql.addListener) mql.addListener(onChange) // 旧 Safari
        disposers.push(() => {
          if (mql.removeEventListener) mql.removeEventListener('change', onChange)
          else mql.removeListener?.(onChange)
        })
      }
      return () => disposers.forEach((d) => d())
    },
  }
}
