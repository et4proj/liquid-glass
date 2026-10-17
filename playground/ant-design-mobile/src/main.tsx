import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerStyle } from "@et4proj/liquid-glass-core";
import {
  createGlass,
  createWebProbe,
  createSvgBackend,
  createCssBackend,
} from "@et4proj/liquid-glass-web";
import { ios27 } from "@et4proj/liquid-glass-style-ios27";
import { attachAdapter } from "./bootstrap";
import App from "./App";

/**
 * standalone 入口（零改动接入验收形态）：
 * 自建 runtime + 显式注册风格 + 显式挂 adapter，产品代码（App.tsx）对 liquid-glass 零感知。
 */
registerStyle(ios27);

const runtime = createGlass({
  config: { style: "ios27" },
  probe: createWebProbe(),
  backends: [createSvgBackend(), createCssBackend()],
});
attachAdapter(runtime);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
