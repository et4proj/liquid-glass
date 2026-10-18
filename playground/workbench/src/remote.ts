import { createApp, type App as VueApp } from "vue";
import { registerStyle } from "@et4proj/liquid-glass-core";
import { ios26 } from "@et4proj/liquid-glass-style-ios26";
import { ios27 } from "@et4proj/liquid-glass-style-ios27";
import App from "./App.vue";

/**
 * MF remote 挂载协议（liquid_glass_workbench，参照 antd-mobile 演示包的 mount/unmount 形状）。
 *
 * 与三方库 demo 的差异：工作台自持 core/web 运行时与风格注册表（本包 vite alias
 * 直连 packages 源码，改码即时生效），不消费 host 经 ctx 注入的 runtime——ctx 仅
 * 保留协议形状，允许为空。风格注册放 mount 内（幂等）：standalone 与 remote 两次
 * 入口共享同一注册路径，避免 remote 模式下依赖宿主先注册。
 */

let app: VueApp | null = null;

export function mount(el: HTMLElement): void {
  registerStyle(ios26);
  registerStyle(ios27);
  app = createApp(App);
  app.mount(el);
}

export function unmount(): void {
  app?.unmount();
  app = null;
}

export default { mount, unmount };
