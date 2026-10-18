import { inject, onUnmounted, shallowRef, toValue, watch } from "vue";
import type { MaybeRefOrGetter, Ref } from "vue";
import type { SurfaceDeclaration } from "@et4proj/liquid-glass-core";
import type { SurfaceHandleApi } from "@et4proj/liquid-glass-web";
import { GLASS_KEY } from "./plugin";
import { sameDecl } from "./shared";

/**
 * Vue 组合式 API（架构 §8，语义对齐 react useGlass / useGlassSurface）：
 * setup 期零浏览器 API（SSR 安全）；注册/注销由 template ref 挂载/卸载驱动。
 */

/** 取最近插件注入的 runtime；app.use(liquidGlassVue) 外返回 null（声明式 data-glass 路线可完全不使用绑定层） */
export function useGlass() {
  const ctx = inject(GLASS_KEY, null);
  if (!ctx) return null;
  // 对齐 react 语义：首个消费者调用时惰性创建（setup 期同步，首帧即有值）
  return ctx.ensureRuntime();
}

/**
 * 无组件场景的表面 hook（对应 react useGlassSurface 的 ref 版本）：
 * const { el, id } = useGlassSurface({ role: 'bar' }) → <nav ref="el">
 * 也接受响应式 getter / computed：const s = useGlassSurface(() => decl.value)
 * 生命周期：el 挂载注册 / 卸载注销（幂等）；声明变化 → unregister + re-register（M0 简化语义）。
 */
export function useGlassSurface(decl: MaybeRefOrGetter<SurfaceDeclaration>): {
  el: Ref<HTMLElement | null>;
  id: Ref<string | null>;
} {
  const ctx = inject(GLASS_KEY, null);
  const el = shallowRef<HTMLElement | null>(null);
  const id = shallowRef<string | null>(null);
  let handle: SurfaceHandleApi<HTMLElement> | null = null;
  let currentDecl: SurfaceDeclaration = toValue(decl);

  // el 挂载/卸载 → 注册/注销（同元素 register 幂等；unmount 期 watch 已停止，由 onUnmounted 兜底）
  watch(el, (node) => {
    handle?.unregister();
    handle = null;
    if (node && ctx) {
      const glass = ctx.ensureRuntime();
      handle = glass.register(node, currentDecl);
      id.value = handle.id;
    } else {
      id.value = null;
    }
  });

  // 声明变化 → 重挂（KISS：不做原地更新）
  watch(
    () => toValue(decl),
    (next) => {
      if (sameDecl(currentDecl, next)) return;
      currentDecl = next;
      if (!el.value) return;
      handle?.unregister();
      handle = null;
      if (ctx) {
        const glass = ctx.ensureRuntime();
        handle = glass.register(el.value, next);
        id.value = handle.id;
      }
    },
  );

  onUnmounted(() => {
    handle?.unregister();
    handle = null;
  });

  return { el, id };
}
