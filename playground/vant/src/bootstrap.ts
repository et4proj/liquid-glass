import { applyAdapter } from "@et4proj/liquid-glass-adapter";
import type { GlassAdapterHandle } from "@et4proj/liquid-glass-adapter";
import { vantAdapter } from "@et4proj/liquid-glass-adapter-vant";
import type { GlassRuntime } from "@et4proj/liquid-glass-web";
// vant 样式（两模式共用引入；产品侧可用 unplugin-vue-components 按需，demo 从简全量）
import "vant/lib/index.css";

/**
 * adapter 接入点（显式优于隐式，无 auto 副作用入口）：
 * standalone 与 remote 两种入口共用——runtime 来源不同，接入动作相同。
 */
let handle: GlassAdapterHandle | null = null;

export function attachAdapter(runtime: GlassRuntime<HTMLElement>): void {
  if (!handle) handle = applyAdapter(runtime, vantAdapter);
}

export function detachAdapter(): void {
  handle?.dispose();
  handle = null;
}
