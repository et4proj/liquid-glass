import { createApp } from "vue";
import { registerStyle } from "@et4proj/liquid-glass-core";
import { ios26 } from "@et4proj/liquid-glass-style-ios26";
import { ios27 } from "@et4proj/liquid-glass-style-ios27";
import App from "./App.vue";
import "./style.css";

// standalone 入口：风格注册（幂等；remote 入口见 remote.ts，注册路径一致）
registerStyle(ios26);
registerStyle(ios27);

createApp(App).mount("#app");
