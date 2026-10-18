import { createApp } from "vue";
import { registerStyle } from "@et4proj/liquid-glass-core";
import {
  createGlass,
  createWebProbe,
  createSvgBackend,
  createCssBackend,
} from "@et4proj/liquid-glass-web";
import { ios27 } from "@et4proj/liquid-glass-style-ios27";
import { liquidGlassVue } from "@et4proj/liquid-glass-vue";
import { attachAdapter } from "./bootstrap";
import App from "./App.vue";
import "./demo.css";

/**
 * standalone 入口（零改动接入验收形态）：
 * 自建 runtime + 显式注册风格 + 显式挂 adapter，产品代码（App.vue）对 liquid-glass 零感知。
 * vue 绑定层插件并行安装：GlassSurface 演示卡经绑定层 runtime 注册（v1 双轨语义，
 * 绑定层与 adapter 的 runtime 各自独立，见 m2-vue-line.md）。
 */
registerStyle(ios27);

const runtime = createGlass({
  config: { style: "ios27" },
  probe: createWebProbe(),
  backends: [createSvgBackend(), createCssBackend()],
});
attachAdapter(runtime);

createApp(App)
  .use(liquidGlassVue, { config: { style: "ios27" } })
  .mount("#root");
