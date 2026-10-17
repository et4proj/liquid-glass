/**
 * react-refresh 前导（React remote 被 Vue host 消费的 dev 专用）：
 *
 * antd-mobile 演示包（5174，MF remote）的 dev 模块由 @vitejs/plugin-react 转换，执行时检查
 * window.$RefreshReg$，缺失即抛 "can't detect preamble"。host 页面是 Vue，
 * 原生没有该全局，须复刻 plugin-react 注入其宿主页面的前导三步：
 *   ① import 远端的 /@react-refresh（纯导出模块，仅含 injectIntoGlobalHook，
 *      不自带任何副作用——import 成功 ≠ 前导就绪，必须手动走完 ②③）
 *   ② injectIntoGlobalHook(window)（react-refresh runtime 注入全局钩子）
 *   ③ window.$RefreshReg$ = () => {}、window.$RefreshSig$ = () => (type) => type
 *
 * 为什么不在 index.html 写 <script src="http://…">：MF 插件会把 host html
 * 所有 module script 包进 mf-html-entry-proxy，绝对 URL 会被拼上前导 "/"
 * 变成 host 相对路径（→ 5173 下的 404），故必须经本模块内部动态 import——
 * Vite 对 http(s) 绝对地址的动态导入保持外部化，浏览器原生跨域加载
 * （CORS 由 Vite dev server 反射 Origin 放行）。见 playground-federation-design.md H1。
 *
 * remote 未启动时此 Promise 走 catch，仅 remote 演示区不可用（DemoCenter
 * 自有兜底文案），host 其余面板不受影响。DemoCenter 挂载前 await 本 Promise，
 * 保证 React 模块链执行时前导已就绪。
 */
export const reactPreambleReady: Promise<void> = (async () => {
  try {
    // @ts-ignore -- 跨源模块无本地类型；@vite-ignore 保持外部化不被分析改写
    const mod = (await import(/* @vite-ignore */ "http://localhost:5174/@react-refresh")) as {
      injectIntoGlobalHook?: (win: Window) => void;
      default?: { injectIntoGlobalHook?: (win: Window) => void };
    };
    // /@react-refresh 同时有 named 与 default 两种导出形态，按远端自身页面同款优先 named
    const inject = mod.injectIntoGlobalHook ?? mod.default?.injectIntoGlobalHook;
    if (typeof inject !== "function") {
      throw new Error("/@react-refresh 未提供 injectIntoGlobalHook");
    }
    inject(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = (type: unknown) => type;
    if (typeof window.$RefreshReg$ !== "function") {
      console.warn("[DemoCenter] react-refresh 前导已安装但 $RefreshReg$ 仍未定义");
    }
  } catch (err) {
    console.warn(
      "[DemoCenter] react-refresh 前导加载失败（antd-mobile 演示包 dev server 未启动？）：",
      err,
    );
  }
})();

declare global {
  interface Window {
    /** @vitejs/plugin-react dev 前导注入的 react-refresh 注册函数（本模块按远端页面同款定义） */
    $RefreshReg$?: () => unknown;
    /** react-refresh 签名函数（透传类型标记） */
    $RefreshSig$?: (type: unknown) => unknown;
  }
}
