import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import type { SurfaceDeclaration } from "@et4proj/liquid-glass-core";
import type { SurfaceHandleApi } from "@et4proj/liquid-glass-web";
import { GlassContext } from "./provider";

/** 取最近 Provider 的 runtime；Provider 外返回 null（声明式 data-glass 路线可完全不使用绑定层） */
export function useGlass() {
  const ctx = useContext(GlassContext);
  return ctx?.runtime ?? null;
}

/** SurfaceDeclaration 顶层浅比较（shape 特判一层） */
function sameDecl(a: SurfaceDeclaration, b: SurfaceDeclaration): boolean {
  if (a === b) return true;
  const k1 = Object.keys(a) as Array<keyof SurfaceDeclaration>;
  if (k1.length !== Object.keys(b).length) return false;
  for (const key of k1) {
    if (key === "shape") {
      if (a.shape?.kind !== b.shape?.kind || a.shape?.radius !== b.shape?.radius) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * 无 JSX 场景的表面 hook（docs/proposals/react-binding-design.md §5）：
 * const { ref } = useGlassSurface({ role: 'bar' }) → <nav ref={ref}>
 * 生命周期：ref attach 注册 / detach 注销（幂等）；声明变化 → unregister + re-register（M0 简化语义）。
 * externalRef：可选的外部 ref（GlassSurface 转发 DOM ref 时使用），合并进返回的 ref 回调。
 */
export function useGlassSurface(
  decl: SurfaceDeclaration,
  externalRef?: Ref<HTMLElement>,
): {
  ref: (el: HTMLElement | null) => void;
  id: string | null;
} {
  const ctx = useContext(GlassContext);
  const state = useRef<{
    el: HTMLElement | null;
    handle: SurfaceHandleApi<HTMLElement> | null;
    decl: SurfaceDeclaration;
  }>({ el: null, handle: null, decl });
  const [id, setId] = useState<string | null>(null);

  // 内部 ref 回调（React 18：卸载/重挂时以 null 再调用；StrictMode 双 attach 安全——register 同元素幂等）
  const innerRef = useCallback(
    (el: HTMLElement | null) => {
      const s = state.current;
      s.handle?.unregister();
      s.handle = null;
      s.el = el;
      const glass = el ? (ctx?.ensureRuntime() ?? null) : null;
      if (el && glass) {
        s.handle = glass.register(el, s.decl);
        setId(s.handle.id);
      } else {
        setId(null);
      }
    },
    [ctx],
  );

  // 合并外部 ref；innerRef 与 externalRef 稳定时合并结果稳定（避免每次 render 新 ref → 无限重挂）
  const ref = useMemo(() => {
    if (!externalRef) return innerRef;
    return (el: HTMLElement | null) => {
      innerRef(el);
      if (typeof externalRef === "function") externalRef(el);
      else if (externalRef && typeof externalRef === "object")
        // eslint-disable-next-line react/immutability -- 合并外部 ref 写回是 React 官方惯用法（m1-react-line 决定表 #12）
        (externalRef as { current: HTMLElement | null }).current = el;
    };
  }, [innerRef, externalRef]);

  // 声明变化 → 重挂（KISS：不做原地更新）
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意无依赖数组：每次 render 对比声明、按需重挂（幂等，见上注释）
  useEffect(() => {
    const s = state.current;
    if (sameDecl(s.decl, decl)) return;
    s.decl = decl;
    if (!s.el) return;
    const glass = ctx?.ensureRuntime() ?? null;
    s.handle?.unregister();
    s.handle = null;
    if (glass) {
      s.handle = glass.register(s.el, decl);
      setId(s.handle.id);
    }
  });

  return { ref, id };
}
