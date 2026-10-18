import { createApp } from "vue";
import type { App as VueApp } from "vue";
import { liquidGlassVue } from "@et4proj/liquid-glass-vue";
import type { GlassRuntime } from "@et4proj/liquid-glass-web";
import type { GlassConfigInput } from "@et4proj/liquid-glass-core";
import { attachAdapter, detachAdapter } from "./bootstrap";
import App from "./App.vue";

/**
 * MF remote 出口（docs/proposals/playground-federation-design.md §4 挂载协议）：
 * mount(el, ctx) / unmount()；runtime 由 host 注入（ctx.runtime），
 * 演示区共享 playground 控制台的配置与风格切换。
 * Vue remote 无需 react preamble；vue 不进 shared，独立实例 createApp 挂 el 无碍。
 */
export interface DemoHostContext {
  runtime: GlassRuntime<HTMLElement>;
  mode: "remote";
  config: GlassConfigInput;
  demo: { platform: string; library: string };
}

let app: VueApp | null = null;

export function mount(el: HTMLElement, ctx: DemoHostContext): void {
  // host 的 runtime 接管 adapter（风格/强度调整即时作用于此演示区）
  attachAdapter(ctx.runtime);
  app = createApp(App);
  // 绑定层 runtime 独立创建，初始 config 取 host 注入值保持视觉一致
  app.use(liquidGlassVue, { config: ctx.config });
  app.mount(el);
}

export function unmount(): void {
  app?.unmount();
  app = null;
  detachAdapter();
}

export default { mount, unmount };
