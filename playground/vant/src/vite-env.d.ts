/// <reference types="vite/client" />

// *.vue shim：tsc 对 SFC 只做存在性放行（MF DTS #TYPE-001 同款，见 workbench）
// SFC 内部的类型检查由 vite plugin-vue 的 IDE 侧 volar 承担
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
