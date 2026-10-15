import type {
  BackendInstance,
  Capabilities,
  GlassBackend,
  MaterialTokens,
  RenderPlan,
  SurfaceHandle,
} from '@et4proj/liquid-glass-core'

/**
 * CSS 渲染后端（tier: 'css'）：
 * 把 MaterialTokens 写成元素内联 CSS 变量（--glass-*，架构 §4.1），
 * 由全局注入的 .lg-surface 样式消费。solid/none 档也由本后端渲染
 * （token 已是降级形态：blur=0 / transparent）。
 *
 * 全局样式单例注入（幂等）；unmount 幂等（React StrictMode 重复挂载安全）。
 */

export const SURFACE_CLASS = 'lg-surface'
export const PAUSED_CLASS = 'lg-paused'
export const INTERACTIVE_CLASS = 'lg-interactive'
const STYLE_ID = 'liquid-glass-web-style'

const GLOBAL_CSS = `
.${SURFACE_CLASS} {
  background: var(--glass-tint);
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow:
    var(--glass-shadow),
    inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-highlight) * 0.7)),
    inset 0 -1px 0 rgba(255, 255, 255, calc(var(--glass-highlight) * 0.25));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
}
.${SURFACE_CLASS}::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, calc(var(--glass-highlight) * 0.22)) 0%,
    transparent 42%
  );
  pointer-events: none;
}
.${SURFACE_CLASS}.${PAUSED_CLASS} {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* 交互液态感：按压弹性回缩 + 高光跟随指针（液态玻璃的"活"感） */
.${SURFACE_CLASS}.${INTERACTIVE_CLASS} {
  transition: transform 0.35s cubic-bezier(0.22, 1.4, 0.36, 1);
  cursor: pointer;
  user-select: none;
}
.${SURFACE_CLASS}.${INTERACTIVE_CLASS}:active {
  transform: scale(0.95);
}
.${SURFACE_CLASS}.${INTERACTIVE_CLASS}::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    140px circle at var(--glass-px, 50%) var(--glass-py, 50%),
    rgba(255, 255, 255, 0.28),
    transparent 65%
  );
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.${SURFACE_CLASS}.${INTERACTIVE_CLASS}:hover::after {
  opacity: 1;
}
`

/** 注入全局样式（幂等，可重复调用）；SSR 环境跳过 */
export function ensureGlobalStyle(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = GLOBAL_CSS
  doc.head.appendChild(style)
}

/** token → CSS 变量名映射（与架构 §4.1 一一对应） */
export function tokensToCssVars(t: MaterialTokens): Record<string, string> {
  return {
    '--glass-blur': `${t.blur}px`,
    '--glass-saturation': String(t.saturation),
    '--glass-tint': t.tint,
    '--glass-border': t.border,
    '--glass-highlight': String(t.highlight),
    '--glass-shadow': t.shadow,
    '--glass-refraction': String(t.refraction),
    '--glass-radius': `${t.radius}px`,
  }
}

/** 应用 plan：写变量 + 按需切换交互 class（css/svg 后端共用）。
 *  token v2：css 后端只消费 material 通道（形状冻结，零逻辑变化）；
 *  refraction 通道的 strength 已投影为 material.refraction → --glass-refraction */
export function applyPlan(el: HTMLElement, plan: RenderPlan): void {
  const vars = tokensToCssVars(plan.tokens.material)
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value)
  }
  el.classList.toggle(INTERACTIVE_CLASS, plan.interactive)
}

/** 指针高光跟随：监听 pointermove 更新 --glass-px/--glass-py；返回撤销函数 */
export function attachPointerHighlight(el: HTMLElement): () => void {
  const onMove = (e: PointerEvent): void => {
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--glass-px', `${e.clientX - rect.left}px`)
    el.style.setProperty('--glass-py', `${e.clientY - rect.top}px`)
  }
  el.addEventListener('pointermove', onMove)
  return () => el.removeEventListener('pointermove', onMove)
}

/** 创建交互实例状态（css/svg 后端共用）：plan.interactive 驱动监听器挂摘 */
export function createInteractiveTracker(el: HTMLElement): {
  sync(interactive: boolean): void
  dispose(): void
} {
  let detach: (() => void) | null = null
  return {
    sync(interactive: boolean) {
      if (interactive && !detach) detach = attachPointerHighlight(el)
      else if (!interactive && detach) {
        detach()
        detach = null
      }
    },
    dispose() {
      detach?.()
      detach = null
    },
  }
}

const GLASS_VAR_NAMES = [
  '--glass-blur',
  '--glass-saturation',
  '--glass-tint',
  '--glass-border',
  '--glass-highlight',
  '--glass-shadow',
  '--glass-refraction',
  '--glass-radius',
] as const

/** 清除全部 --glass-* 变量（unmount 用，css/svg 后端共用） */
export function clearVars(el: HTMLElement): void {
  for (const name of GLASS_VAR_NAMES) el.style.removeProperty(name)
}

export function createCssBackend(): GlassBackend<HTMLElement> {
  return {
    tier: 'css',
    platform: 'web',
    supports(caps: Capabilities, surface: SurfaceHandle<HTMLElement>) {
      // solid/none 档不需要 backdropFilter；由运行时按 plan.tier 判断，
      // 这里只要环境有 DOM 元素即可挂载
      return (
        caps.platform === 'web' &&
        typeof HTMLElement !== 'undefined' &&
        surface.target instanceof HTMLElement
      )
    },
    mount(surface: SurfaceHandle<HTMLElement>, plan: RenderPlan): BackendInstance {
      const el = surface.target
      ensureGlobalStyle()
      el.classList.add(SURFACE_CLASS)
      applyPlan(el, plan)
      const interactive = createInteractiveTracker(el)
      interactive.sync(plan.interactive)
      let paused = false
      let unmounted = false
      return {
        update(next: RenderPlan) {
          if (unmounted) return
          applyPlan(el, next)
          interactive.sync(next.interactive)
        },
        pause() {
          if (unmounted || paused) return
          paused = true
          el.classList.add(PAUSED_CLASS)
        },
        resume() {
          if (unmounted || !paused) return
          paused = false
          el.classList.remove(PAUSED_CLASS)
        },
        unmount() {
          if (unmounted) return // 幂等：StrictMode 重复挂载安全
          unmounted = true
          interactive.dispose()
          el.classList.remove(SURFACE_CLASS, PAUSED_CLASS, INTERACTIVE_CLASS)
          clearVars(el)
        },
      }
    },
  }
}
