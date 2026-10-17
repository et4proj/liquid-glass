import type { SurfaceDeclaration, SurfaceRole } from "@et4proj/liquid-glass-core";
import type { GlassRuntime } from "./runtime";

/**
 * 声明式发现（架构 §4.2）：扫描 data-glass 属性并翻译为 SurfaceDeclaration。
 * <nav data-glass="bar" data-glass-shape="capsule" data-glass-intensity="0.8">
 *
 * mountDiscovery：初始扫描 + MutationObserver 监听后续增删；返回 dispose。
 */

const ROLE_VALUES: ReadonlySet<string> = new Set([
  "bar",
  "sheet",
  "overlay",
  "control",
  "card",
  "capsule",
]);

export function parseDataGlass(el: Element): SurfaceDeclaration | null {
  const role = el.getAttribute("data-glass");
  if (!role || !ROLE_VALUES.has(role)) return null;
  const decl: SurfaceDeclaration = { role: role as SurfaceRole };

  const shape = el.getAttribute("data-glass-shape");
  if (shape === "rounded" || shape === "capsule" || shape === "circle") {
    const radiusRaw = el.getAttribute("data-glass-radius");
    const radius = radiusRaw === "auto" || radiusRaw === null ? "auto" : Number(radiusRaw);
    decl.shape = {
      kind: shape,
      ...(Number.isNaN(radius) ? {} : { radius: radius as number | "auto" }),
    };
  }

  const intensity = el.getAttribute("data-glass-intensity");
  if (intensity !== null) {
    const n = Number(intensity);
    if (!Number.isNaN(n)) decl.intensity = Math.min(1, Math.max(0, n));
  }

  const material = el.getAttribute("data-glass-material");
  if (material === "regular" || material === "clear" || material === "tinted")
    decl.material = material;

  const group = el.getAttribute("data-glass-group");
  if (group) decl.group = group;

  const maxTier = el.getAttribute("data-glass-max-tier");
  if (maxTier) decl.maxTier = maxTier as SurfaceDeclaration["maxTier"];

  const interactive = el.getAttribute("data-glass-interactive");
  if (interactive === "true" || interactive === "false") decl.interactive = interactive === "true";

  return decl;
}

export interface DiscoveryHandle {
  /** 停止监听并注销所有由发现机制注册的表面 */
  dispose(): void;
}

/**
 * 选择器发现（adapter 体系的声明源，docs/proposals/adapter-system-design.md §3.3）：
 * 按类名选择器扫描组件库 DOM（如 .adm-tab-bar）并注册为玻璃表面。
 * 与 mountDiscovery（data-glass 属性源）并列；同一时刻可共存。
 */
export interface SelectorSurface {
  /** CSS 选择器（组件库类名）；surfaces 顺序即优先级，同一元素命中多条时首条生效 */
  selector: string;
  declaration: SurfaceDeclaration;
  /** 挂 body 的弹层标记（语义标注，供适配层验收清单使用；发现机制本身不做特殊处理） */
  overlay?: boolean;
}

export function mountSelectorDiscovery(
  glass: GlassRuntime<HTMLElement>,
  options: { surfaces: SelectorSurface[]; root?: ParentNode },
): DiscoveryHandle {
  const { surfaces, root = document } = options;
  if (surfaces.length === 0) return { dispose() {} };

  const registered = new Map<Element, ReturnType<GlassRuntime<HTMLElement>["register"]>>();
  const combined = surfaces.map((s) => s.selector).join(",");

  const match = (el: Element): void => {
    if (registered.has(el)) return;
    for (const surface of surfaces) {
      if (el.matches(surface.selector)) {
        // 首条命中即生效（manifest 顺序 = 优先级）
        registered.set(el, glass.register(el as HTMLElement, surface.declaration));
        return;
      }
    }
  };

  const scan = (node: ParentNode): void => {
    for (const el of Array.from(node.querySelectorAll(combined))) match(el);
  };

  const detach = (el: Element): void => {
    const handle = registered.get(el);
    if (handle) {
      handle.unregister();
      registered.delete(el);
    }
  };

  scan(root);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      for (const node of Array.from(m.removedNodes)) {
        if (node instanceof Element) {
          detach(node);
          node.querySelectorAll?.(combined).forEach(detach);
        }
      }
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof Element) {
          // querySelectorAll 不含自身，需单独尝试
          match(node);
          scan(node);
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return {
    dispose() {
      observer.disconnect();
      for (const handle of registered.values()) handle.unregister();
      registered.clear();
    },
  };
}

export function mountDiscovery(
  glass: GlassRuntime<HTMLElement>,
  root: ParentNode = document,
): DiscoveryHandle {
  const registered = new Map<Element, ReturnType<GlassRuntime<HTMLElement>["register"]>>();

  const scan = (node: ParentNode): void => {
    for (const el of Array.from(node.querySelectorAll("[data-glass]"))) {
      const decl = parseDataGlass(el);
      if (decl && !registered.has(el)) {
        registered.set(el, glass.register(el as HTMLElement, decl));
      }
    }
  };

  const detach = (el: Element): void => {
    const handle = registered.get(el);
    if (handle) {
      handle.unregister();
      registered.delete(el);
    }
  };

  scan(root);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of Array.from(m.removedNodes)) {
          if (node instanceof Element) {
            detach(node);
            node.querySelectorAll?.("[data-glass]").forEach(detach);
          }
        }
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof Element) {
            scan(node);
            // 节点自身带 data-glass 时 querySelectorAll 不含自身
            const decl = parseDataGlass(node);
            if (decl && !registered.has(node)) {
              registered.set(node, glass.register(node as HTMLElement, decl));
            }
          }
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return {
    dispose() {
      observer.disconnect();
      for (const handle of registered.values()) handle.unregister();
      registered.clear();
    },
  };
}
