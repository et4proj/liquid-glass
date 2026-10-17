import { defineConfig, resolve, TIER_ORDER } from "@et4proj/liquid-glass-core";
import type {
  BackendInstance,
  Capabilities,
  GlassBackend,
  GlassConfig,
  GlassConfigInput,
  PlatformProbe,
  RenderPlan,
  SurfaceDeclaration,
  SurfaceHandle,
} from "@et4proj/liquid-glass-core";

/**
 * createGlass 运行时（架构 §6）：
 * 探测能力 → register/updateConfig → resolve → 选后端 → mount/update/pause/unmount。
 *
 * M1 语义（待定标注）：
 * - budget.activeSurfaces = 当前注册数；超限由 resolve 降档（非 LRU 摘除）
 * - none 档渲染为 no-op 实例（后端不参与）
 * - probe.detect 异步完成前 register 排队，完成后统一 flush
 */

export interface SurfaceHandleApi<T = HTMLElement> {
  readonly id: string;
  readonly target: T;
  readonly declaration: SurfaceDeclaration;
  /** 重新解析并更新渲染（配置/能力已变化时运行时自动调用，通常无需手动） */
  refresh(): void;
  /** 临时降开销（不可见 / 滚动中）；resume 恢复 */
  pause(): void;
  resume(): void;
  unregister(): void;
}

export interface GlassRuntime<T = HTMLElement> {
  register(target: T, declaration: SurfaceDeclaration): SurfaceHandleApi<T>;
  updateConfig(partial: GlassConfigInput): void;
  debug: {
    explain(target: T): RenderPlan | null;
    readonly caps: Capabilities | null;
    readonly config: GlassConfig;
    readonly surfaces: ReadonlyArray<{ id: string; plan: RenderPlan }>;
  };
  dispose(): void;
}

export interface CreateGlassOptions<T = HTMLElement> {
  config?: GlassConfigInput;
  probe: PlatformProbe;
  backends: Array<GlassBackend<T>>;
}

interface Registration<T> {
  handle: SurfaceHandle<T>;
  api: SurfaceHandleApi<T>;
  instance: BackendInstance | null;
  plan: RenderPlan | null;
}

let surfaceSeq = 0;

export function createGlass<T = HTMLElement>(options: CreateGlassOptions<T>): GlassRuntime<T> {
  const { probe, backends } = options;
  let rawConfig: GlassConfigInput = options.config ?? {};
  let config: GlassConfig = defineConfig(rawConfig);
  let caps: Capabilities | null = null;
  let disposed = false;
  const registrations = new Map<T, Registration<T>>();
  const pending: Array<() => void> = [];
  let unsubscribeProbe: (() => void) | null = null;

  /** 按 plan.tier 选后端：取 tier 不高于 plan.tier 的最高档后端（css 后端可渲染 solid） */
  function pickBackend(plan: RenderPlan): GlassBackend<T> | null {
    let best: GlassBackend<T> | null = null;
    let bestRank = -1;
    for (const backend of backends) {
      const rank = TIER_ORDER.indexOf(backend.tier);
      if (rank <= TIER_ORDER.indexOf(plan.tier) && rank > bestRank) {
        best = backend;
        bestRank = rank;
      }
    }
    return best;
  }

  function render(reg: Registration<T>): void {
    if (disposed || !caps) return;
    // 预算视角：按注册顺序"先到先得"，每个表面的 activeSurfaces = 自己的顺位（含自己）
    // 同屏前 maxSurfaces 个全效，超出的按注册顺序降档
    const order = [...registrations.values()].indexOf(reg) + 1;
    const plan = resolve({
      config,
      caps,
      surface: reg.handle.declaration,
      budget: { activeSurfaces: order },
    });
    reg.plan = plan;
    if (plan.tier === "none") {
      // none 档：卸掉后端效果（若有），保持 no-op
      reg.instance?.unmount();
      reg.instance = null;
      return;
    }
    const backend = pickBackend(plan);
    if (!backend) {
      reg.instance?.unmount();
      reg.instance = null;
      return;
    }
    if (!backend.supports(caps, reg.handle)) {
      reg.instance?.unmount();
      reg.instance = null;
      return;
    }
    if (reg.instance) {
      reg.instance.update(plan);
    } else {
      reg.instance = backend.mount(reg.handle, plan);
    }
  }

  function renderAll(): void {
    for (const reg of registrations.values()) render(reg);
  }

  // 探针异步初始化：完成后 flush 排队的注册并订阅能力变化
  Promise.resolve(probe.detect())
    .then((detected) => {
      if (disposed) return;
      caps = detected;
      renderAll();
      for (const fn of pending.splice(0)) fn();
      unsubscribeProbe =
        probe.subscribe?.((next) => {
          caps = next;
          renderAll();
        }) ?? null;
    })
    .catch(() => {
      // 探针失败：保持无渲染（安全缺省），不阻塞业务
    });

  function whenReady(fn: () => void): void {
    if (caps) fn();
    else pending.push(fn);
  }

  function unregisterInternal(reg: Registration<T>): void {
    reg.instance?.unmount();
    reg.instance = null;
    registrations.delete(reg.handle.target);
    // 注册数变化影响 budget：其余表面重新解析
    renderAll();
  }

  return {
    register(target: T, declaration: SurfaceDeclaration): SurfaceHandleApi<T> {
      const existing = registrations.get(target);
      if (existing) return existing.api;
      const handle: SurfaceHandle<T> = {
        id: `lg-${++surfaceSeq}`,
        target,
        declaration,
      };
      const reg: Registration<T> = { handle, api: null!, instance: null, plan: null };
      reg.api = {
        id: handle.id,
        target,
        declaration,
        refresh: () => whenReady(() => render(reg)),
        pause: () => reg.instance?.pause(),
        resume: () => reg.instance?.resume(),
        unregister: () => unregisterInternal(reg),
      };
      registrations.set(target, reg);
      whenReady(() => render(reg));
      return reg.api;
    },

    updateConfig(partial: GlassConfigInput): void {
      rawConfig = { ...rawConfig, ...partial };
      config = defineConfig(rawConfig);
      renderAll();
    },

    debug: {
      explain(target: T): RenderPlan | null {
        return registrations.get(target)?.plan ?? null;
      },
      get caps() {
        return caps;
      },
      get config() {
        return config;
      },
      get surfaces() {
        return [...registrations.values()]
          .filter((r) => r.plan !== null)
          .map((r) => ({ id: r.handle.id, plan: r.plan! }));
      },
    },

    dispose(): void {
      disposed = true;
      unsubscribeProbe?.();
      for (const reg of registrations.values()) reg.instance?.unmount();
      registrations.clear();
    },
  };
}
