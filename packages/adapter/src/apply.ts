import { mountSelectorDiscovery } from "@et4proj/liquid-glass-web";
import type { GlassRuntime, DiscoveryHandle } from "@et4proj/liquid-glass-web";
import type { GlassAdapterHandle, GlassAdapterManifest } from "./types";

/**
 * applyAdapter（docs/proposals/adapter-system-design.md §3）：
 * ① detect 不通过 → no-op；② tokenMap 别名样式注入（幂等 + 引用计数）；
 * ③ patches 注入（同上）；④ 选择器发现接管组件库 DOM。
 * 注入的样式标签由 id 幂等 + 模块级引用计数管理：多 runtime 共享，最后一个 dispose 才移除。
 */

/** styleId → 引用计数（模块级：同页多个 runtime 场景共享标签） */
const styleRefCounts = new Map<string, { el: HTMLStyleElement; count: number }>();

function injectStyle(id: string, css: string): void {
  if (!css) return;
  let entry = styleRefCounts.get(id);
  if (!entry) {
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
    entry = { el, count: 0 };
    styleRefCounts.set(id, entry);
  }
  entry.count++;
}

function releaseStyle(id: string): void {
  const entry = styleRefCounts.get(id);
  if (!entry) return;
  entry.count--;
  if (entry.count <= 0) {
    entry.el.remove();
    styleRefCounts.delete(id);
  }
}

/** tokenMap → 别名规则（作用域与 --glass-* 完全一致：.lg-surface 元素自身，弹层继承不断链） */
export function renderTokenMapCss(tokenMap: Record<string, string>): string {
  const decls = Object.entries(tokenMap)
    .map(([libVar, glassVar]) => `  ${libVar}: var(${glassVar});`)
    .join("\n");
  return `:where(.lg-surface) {\n${decls}\n}`;
}

export function applyAdapter(
  glass: GlassRuntime<HTMLElement>,
  manifest: GlassAdapterManifest,
): GlassAdapterHandle {
  if (manifest.detect && !manifest.detect()) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console -- dev 提示
      console.warn(
        `[liquid-glass] adapter "${manifest.library}" detect() 未命中，已跳过（目标库未安装？）`,
      );
    }
    return { dispose() {} };
  }

  const tokenStyleId = `lg-adapter-${manifest.library}-tokens`;
  const patchStyleId = `lg-adapter-${manifest.library}-patches`;

  injectStyle(tokenStyleId, manifest.tokenMap ? renderTokenMapCss(manifest.tokenMap) : "");
  injectStyle(
    patchStyleId,
    manifest.patches?.length ? manifest.patches.map((p) => p.css).join("\n") : "",
  );

  const discovery: DiscoveryHandle = mountSelectorDiscovery(glass, { surfaces: manifest.surfaces });

  return {
    dispose() {
      discovery.dispose();
      releaseStyle(tokenStyleId);
      releaseStyle(patchStyleId);
    },
  };
}
