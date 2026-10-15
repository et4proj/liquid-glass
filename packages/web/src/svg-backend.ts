import type {
  BackendInstance,
  Capabilities,
  GlassBackend,
  RenderPlan,
  SurfaceHandle,
} from '@et4proj/liquid-glass-core'
import {
  SURFACE_CLASS,
  PAUSED_CLASS,
  INTERACTIVE_CLASS,
  ensureGlobalStyle,
  applyPlan,
  createInteractiveTracker,
  clearVars,
} from './css-backend'

/**
 * SVG 折射后端（tier: 'svg'，架构 §12：仅 Chromium 支持 backdrop-filter: url()）：
 * 在磨砂基底上叠加"液态"核心特征——边缘透镜折射（背景内容在玻璃边缘弯折）。
 *
 * token v2：折射参数消费 refraction 通道——strength（0..1 强度）、
 * ior（折射率）、bezelWidth（折射带宽度占半径比例），风格包可调；
 * 通道缺省时回落 1.5 / 0.18（ios26 / ios27 校准值）。
 *
 * 位移贴图按 docs/research/ios27-liquid-glass-spec.md §3.1 生成：
 * squircle 凸面表面函数 + Snell 定律（n₁=1, n₂=ior）计算 1D 位移曲线，
 * 径向展开为 2D 贴图（128×128，R=x 偏移 / G=y 偏移 / 128=中性），
 * feDisplacementMap 消费（scale = 最大位移像素）。
 *
 * strength(0..1) → scale = strength × clamp(短边 × 0.28, 8, 42)。
 * 贴图为归一化数据（与控件尺寸无关），按 (ior, bezel) 缓存；
 * scale 按控件短边自适应（规格 §5：固定 px 在大件上过冲）。
 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const DEFS_ID = 'liquid-glass-svg-defs'
const FILTER_PREFIX = 'lg-refraction-'

/** 缺省折射参数（refraction 通道未声明时；= ios26/ios27 校准值） */
const DEFAULT_IOR = 1.5
const DEFAULT_BEZEL = 0.18
/** 贴图边长（8bit 中性灰 128 ± 127 档） */
const MAP_SIZE = 128

/** squircle 凸面高度：x∈[0,1]（0=边缘, 1=bezel 内界/平面）→ 玻璃高度 */
function squircleHeight(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return Math.pow(1 - Math.pow(1 - c, 4), 0.25)
}

/**
 * 1D 位移曲线：距边缘归一化距离 d∈[0,1] → 位移量（未归一化，像素比例）。
 * 近轴近似：斜率 dh 产生折射角差，水平偏移 ∝ tan(θ₁) - tan(θ₂)，
 * θ₁ = 表面斜率角（数值求导），θ₂ 由 Snell 定律求得。
 */
export function displacementCurve(d: number, ior: number = DEFAULT_IOR): number {
  if (d <= 0 || d >= 1) return 0
  const delta = 0.001
  const dh = (squircleHeight(d + delta) - squircleHeight(d - delta)) / (2 * delta)
  if (dh <= 0) return 0
  // 边缘处 squircle 导数发散，clamp 到垂直入射（θ₁ → 90° 附近仍有限）
  const slope = Math.min(dh, 8)
  const theta1 = Math.atan(slope)
  const sinTheta2 = Math.sin(theta1) / ior
  const theta2 = Math.asin(sinTheta2)
  return Math.tan(theta1) - Math.tan(theta2)
}

/** 位移曲线归一化查表缓存（按 ior；0..1，最大值 = 1） */
const curveLuts = new Map<number, number[]>()
function curveLut(ior: number): number[] {
  let lut = curveLuts.get(ior)
  if (!lut) {
    const samples: number[] = []
    let max = 0
    for (let i = 0; i <= 64; i++) {
      const v = displacementCurve(i / 64, ior)
      samples.push(v)
      if (v > max) max = v
    }
    lut = max > 0 ? samples.map((v) => v / max) : samples
    curveLuts.set(ior, lut)
  }
  return lut
}

/** 归一化位移曲线值（bezel 内界外为 0） */
function curveAt(edgeT: number, ior: number): number {
  if (edgeT >= 1) return 0
  const lut = curveLut(ior)
  const idx = edgeT * 64
  const i = Math.floor(idx)
  const frac = idx - i
  const a = lut[i] ?? 0
  const b = lut[i + 1] ?? 0
  return a + (b - a) * frac
}

/** 生成 2D 位移贴图 data URL（canvas 可用时精确计算；否则回退双轴渐变 SVG 近似） */
function buildDisplacementMap(ior: number, bezel: number): string {
  const canvas =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null
  const ctx = canvas?.getContext('2d') ?? null
  if (canvas && ctx) {
    canvas.width = MAP_SIZE
    canvas.height = MAP_SIZE
    const img = ctx.createImageData(MAP_SIZE, MAP_SIZE)
    const half = MAP_SIZE / 2
    for (let py = 0; py < MAP_SIZE; py++) {
      for (let px = 0; px < MAP_SIZE; px++) {
        // 归一化坐标 [-1,1]²，圆形玻璃截面
        const u = (px + 0.5) / half - 1
        const v = (py + 0.5) / half - 1
        const r = Math.hypot(u, v)
        const idx = (py * MAP_SIZE + px) * 4
        let dx = 0
        let dy = 0
        if (r > 0.001 && r < 1) {
          const edgeT = (1 - r) / bezel // 0=边缘, ≥1=bezel 内界（无位移）
          const mag = curveAt(edgeT, ior)
          if (mag > 0) {
            // 位移指向中心（凸透镜：边缘内容向内弯折）
            dx = (-u / r) * mag
            dy = (-v / r) * mag
          }
        }
        img.data[idx] = Math.round(128 + dx * 127)
        img.data[idx + 1] = Math.round(128 + dy * 127)
        img.data[idx + 2] = 128
        img.data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL('image/png')
  }
  // 回退：双轴线性渐变近似（测试环境无 canvas 2d 时）
  const svg =
    `<svg xmlns="${SVG_NS}" width="${MAP_SIZE}" height="${MAP_SIZE}">` +
    '<defs>' +
    `<linearGradient id="h" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#ff0000"/><stop offset="${bezel}" stop-color="#808000"/>` +
    `<stop offset="${1 - bezel}" stop-color="#808000"/><stop offset="1" stop-color="#000000"/>` +
    '</linearGradient>' +
    `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#00ff00"/><stop offset="${bezel}" stop-color="#008000"/>` +
    `<stop offset="${1 - bezel}" stop-color="#008000"/><stop offset="1" stop-color="#000000"/>` +
    '</linearGradient>' +
    '</defs>' +
    `<rect width="${MAP_SIZE}" height="${MAP_SIZE}" fill="url(#h)"/>` +
    `<rect width="${MAP_SIZE}" height="${MAP_SIZE}" fill="url(#v)" style="mix-blend-mode:screen"/>` +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 贴图缓存：归一化数据与控件尺寸无关，按 (ior, bezel) 生成一次 */
const mapUrlCache = new Map<string, string>()
function displacementMapUrl(ior: number, bezel: number): string {
  const key = `${ior}|${bezel}`
  let url = mapUrlCache.get(key)
  if (!url) {
    url = buildDisplacementMap(ior, bezel)
    mapUrlCache.set(key, url)
  }
  return url
}

/**
 * strength(0..1) → 位移像素（按控件短边自适应，规格 §5）。
 * 尺寸不可得（如测试环境 getBoundingClientRect 全 0）时按 48px 小件估算。
 */
export function refractionToScale(strength: number, width: number, height: number): number {
  const shortSide = Math.min(width, height)
  const effective = shortSide > 0 ? shortSide : 48
  const base = Math.min(42, Math.max(8, effective * 0.28))
  return Math.round(base * Math.min(1, Math.max(0, strength)))
}

/** 幂等创建承载滤镜的隐藏 SVG 根节点 */
function ensureDefsRoot(doc: Document): SVGSVGElement {
  let root = doc.getElementById(DEFS_ID) as SVGSVGElement | null
  if (!root) {
    root = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement
    root.id = DEFS_ID
    root.setAttribute('width', '0')
    root.setAttribute('height', '0')
    root.setAttribute('aria-hidden', 'true')
    root.style.position = 'absolute'
    doc.body.appendChild(root)
  }
  return root
}

/** 创建（或按参数重建）指定 id 的折射滤镜 */
function ensureFilter(doc: Document, id: string, scale: number, ior: number, bezel: number): void {
  const root = ensureDefsRoot(doc)
  doc.getElementById(id)?.remove()

  const filter = doc.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('x', '0%')
  filter.setAttribute('y', '0%')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  // sRGB 色彩插值：默认 linearRGB 会偏移中性灰 128 导致整体平移
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  const href = displacementMapUrl(ior, bezel)
  const feImage = doc.createElementNS(SVG_NS, 'feImage')
  feImage.setAttribute('href', href)
  feImage.setAttributeNS(XLINK_NS, 'xlink:href', href)
  feImage.setAttribute('preserveAspectRatio', 'none')
  feImage.setAttribute('x', '0')
  feImage.setAttribute('y', '0')
  feImage.setAttribute('width', '100%')
  feImage.setAttribute('height', '100%')
  feImage.setAttribute('result', 'map')

  const feDisplacement = doc.createElementNS(SVG_NS, 'feDisplacementMap')
  feDisplacement.setAttribute('in', 'SourceGraphic')
  feDisplacement.setAttribute('in2', 'map')
  feDisplacement.setAttribute('scale', String(scale))
  feDisplacement.setAttribute('xChannelSelector', 'R')
  feDisplacement.setAttribute('yChannelSelector', 'G')

  filter.append(feImage, feDisplacement)
  root.append(filter)
}

export function createSvgBackend(): GlassBackend<HTMLElement> {
  return {
    tier: 'svg',
    platform: 'web',
    supports(caps: Capabilities, surface: SurfaceHandle<HTMLElement>) {
      // url() 形式 backdrop-filter 仅 Chromium 可靠（架构 §12）；
      // Safari/Firefox 声明整条失效（连 blur 都没有），必须由能力门控挡下
      return (
        caps.platform === 'web' &&
        caps.backdropFilter === true &&
        caps.backdropFilterWithSvg === true &&
        typeof HTMLElement !== 'undefined' &&
        surface.target instanceof HTMLElement
      )
    },
    mount(surface: SurfaceHandle<HTMLElement>, plan: RenderPlan): BackendInstance {
      const el = surface.target
      const doc = el.ownerDocument
      const filterId = `${FILTER_PREFIX}${surface.id}`
      ensureGlobalStyle(doc)
      el.classList.add(SURFACE_CLASS)

      const interactive = createInteractiveTracker(el)
      let currentKey = ''
      let backdropValue = ''
      let paused = false
      let unmounted = false

      const apply = (next: RenderPlan): void => {
        applyPlan(el, next)
        interactive.sync(next.interactive)
        // token v2：折射参数来自 refraction 通道（缺省 1.5 / 0.18）
        const ref = next.tokens.refraction
        const strength = ref?.strength ?? next.tokens.material.refraction ?? 0
        const ior = ref?.ior ?? DEFAULT_IOR
        const bezel = ref?.bezelWidth ?? DEFAULT_BEZEL
        // 短边自适应 scale（待定：暂不监听尺寸变化，update 时重读）
        const rect = el.getBoundingClientRect()
        const scale = refractionToScale(strength, rect.width, rect.height)
        const key = `${scale}|${ior}|${bezel}`
        if (key !== currentKey) {
          currentKey = key
          ensureFilter(doc, filterId, scale, ior, bezel)
          // 先折射后模糊：透镜弯折边缘，再整体磨砂（iOS 观感）
          backdropValue = `url(#${filterId}) blur(var(--glass-blur)) saturate(var(--glass-saturation))`
          if (!paused) {
            el.style.setProperty('backdrop-filter', backdropValue)
            el.style.setProperty('-webkit-backdrop-filter', backdropValue)
          }
        }
      }

      apply(plan)

      return {
        update(next: RenderPlan) {
          if (unmounted) return
          apply(next)
        },
        pause() {
          if (unmounted || paused) return
          paused = true
          // 内联 backdrop-filter 优先级高于 .lg-paused 类规则，须显式置 none
          el.style.setProperty('backdrop-filter', 'none')
          el.style.setProperty('-webkit-backdrop-filter', 'none')
        },
        resume() {
          if (unmounted || !paused) return
          paused = false
          el.style.setProperty('backdrop-filter', backdropValue)
          el.style.setProperty('-webkit-backdrop-filter', backdropValue)
        },
        unmount() {
          if (unmounted) return // 幂等
          unmounted = true
          interactive.dispose()
          el.classList.remove(SURFACE_CLASS, PAUSED_CLASS, INTERACTIVE_CLASS)
          el.style.removeProperty('backdrop-filter')
          el.style.removeProperty('-webkit-backdrop-filter')
          clearVars(el)
          // 移除该表面的滤镜实例，避免 DOM 泄漏
          doc.getElementById(filterId)?.remove()
        },
      }
    },
  }
}
