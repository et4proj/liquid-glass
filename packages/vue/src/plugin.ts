import type { App, Directive, InjectionKey, Plugin } from "vue";
import {
  createGlass,
  createWebProbe,
  createCssBackend,
  createSvgBackend,
} from "@et4proj/liquid-glass-web";
import type { GlassRuntime, SurfaceHandleApi } from "@et4proj/liquid-glass-web";
import type {
  GlassConfigInput,
  GlassBackend,
  PlatformProbe,
  SurfaceDeclaration,
} from "@et4proj/liquid-glass-core";
import { sameDecl } from "./shared";

/**
 * Vue 绑定层（架构 §8，语义对齐 react 绑定层 docs/proposals/react-binding-design.md §3）：
 * liquidGlassVue 插件持有唯一 GlassRuntime；app.use 后组件经 useGlass / useGlassSurface /
 * GlassSurface / v-glass 消费。插件 install 期零浏览器 API（SSR 安全），runtime 惰性创建
 * （首个消费者调用时）。
 *
 * 与 React GlassProvider 的差异（Vue 插件是一次性初始化，无响应式 props）：
 * - config 为初始配置；后续更新走 useGlass().updateConfig(...)（显式优于隐式）
 * - Vue 3 无应用级卸载钩子约定，插件不自动 dispose，由调用方按需 ctx.dispose()
 */

export interface GlassPluginOptions {
  /** 初始配置；后续更新经 useGlass().updateConfig() */
  config?: GlassConfigInput;
  /** 缺省 createWebProbe()；测试/复用场景可注入 */
  probe?: PlatformProbe;
  /** 缺省 [svg, css] 两条后端链，由 runtime 按 tier 取舍 */
  backends?: GlassBackend<HTMLElement>[];
}

export interface GlassContextValue {
  /** 惰性确保 runtime 存在（首个消费者调用时创建；dispose 后再次调用则重建） */
  ensureRuntime(): GlassRuntime<HTMLElement>;
  /** 当前 runtime；未创建/已销毁时为 null */
  readonly runtime: GlassRuntime<HTMLElement> | null;
  /** 手动销毁 runtime（Vue 插件不自动 dispose，显式优于隐式） */
  dispose(): void;
}

export const GLASS_KEY: InjectionKey<GlassContextValue> = Symbol("liquid-glass");

/** v-glass 指令句柄存储（元素 → handle；WeakMap 随元素回收无泄漏） */
const handleMap = new WeakMap<HTMLElement, SurfaceHandleApi<HTMLElement>>();

function makeGlassDirective(
  ctx: GlassContextValue,
): Directive<HTMLElement, SurfaceDeclaration | null> {
  return {
    mounted(el, binding) {
      // 值为空 → no-op（安全语义与插件外 useGlassSurface 一致）
      if (!binding.value) return;
      const glass = ctx.ensureRuntime();
      handleMap.set(el, glass.register(el, binding.value));
    },
    // 声明变化 → unregister + re-register（与 useGlassSurface 同语义，KISS 不做原地更新）
    updated(el, binding) {
      if (!binding.value) return;
      if (sameDecl(binding.oldValue ?? binding.value, binding.value)) return;
      handleMap.get(el)?.unregister();
      const glass = ctx.ensureRuntime();
      handleMap.set(el, glass.register(el, binding.value));
    },
    unmounted(el) {
      handleMap.get(el)?.unregister();
      handleMap.delete(el);
    },
  };
}

export const liquidGlassVue: Plugin<GlassPluginOptions> = {
  install(app: App, options: GlassPluginOptions = {}) {
    let holder: GlassRuntime<HTMLElement> | null = null;
    const ensureRuntime = (): GlassRuntime<HTMLElement> => {
      if (holder === null) {
        holder = createGlass({
          config: options.config,
          // createGlass 构造期零浏览器 API（caps 惰性探测）；SSR 下注入 probe/backends
          probe: options.probe ?? createWebProbe(),
          backends: options.backends ?? [createSvgBackend(), createCssBackend()],
        });
      }
      return holder;
    };
    const ctx: GlassContextValue = {
      ensureRuntime,
      get runtime() {
        return holder;
      },
      dispose() {
        holder?.dispose();
        holder = null;
      },
    };
    app.provide(GLASS_KEY, ctx);
    app.directive("glass", makeGlassDirective(ctx));
  },
};
