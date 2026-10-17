import { applyAdapter } from "@et4proj/liquid-glass-adapter";
import type { GlassAdapterHandle } from "@et4proj/liquid-glass-adapter";
import { antdMobileAdapter } from "@et4proj/liquid-glass-adapter-antd-mobile";
import type { GlassRuntime } from "@et4proj/liquid-glass-web";

/**
 * adapter 接入点（显式优于隐式，无 auto 副作用入口）：
 * standalone 与 remote 两种入口共用——runtime 来源不同，接入动作相同。
 */
let handle: GlassAdapterHandle | null = null;

export function attachAdapter(runtime: GlassRuntime<HTMLElement>): void {
  if (!handle) handle = applyAdapter(runtime, antdMobileAdapter);
}

export function detachAdapter(): void {
  handle?.dispose();
  handle = null;
}
