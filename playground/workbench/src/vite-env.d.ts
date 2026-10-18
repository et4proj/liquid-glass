/// <reference types="vite/client" />

// vue SFC 模块声明：dts-plugin 派生 tsconfig 编译 remote.ts（import './App.vue'）必需——
// 无此声明 MF DTS 生成失败 #TYPE-001（workbench dist/@mf-types 残缺的根因）
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
