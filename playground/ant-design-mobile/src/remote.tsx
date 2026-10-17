import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { GlassRuntime } from "@et4proj/liquid-glass-web";
import type { GlassConfigInput } from "@et4proj/liquid-glass-core";
import { attachAdapter, detachAdapter } from "./bootstrap";
import App from "./App";

/**
 * MF remote 出口（docs/proposals/playground-federation-design.md §4 挂载协议）：
 * mount(el, ctx) / unmount()；runtime 由 host 注入（ctx.runtime），
 * 演示区共享 playground 控制台的配置与风格切换。
 */
export interface DemoHostContext {
  runtime: GlassRuntime<HTMLElement>;
  mode: "remote";
  config: GlassConfigInput;
  demo: { platform: string; library: string };
}

let root: Root | null = null;

export function mount(el: HTMLElement, ctx: DemoHostContext): void {
  // host 的 runtime 接管 adapter（风格/强度调整即时作用于此演示区）
  attachAdapter(ctx.runtime);
  root = createRoot(el);
  root.render(<App />);
}

export function unmount(): void {
  root?.unmount();
  root = null;
  detachAdapter();
}

export default { mount, unmount };
