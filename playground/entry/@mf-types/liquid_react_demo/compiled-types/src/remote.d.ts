import type { GlassRuntime } from '@et4proj/liquid-glass-web';
import type { GlassConfigInput } from '@et4proj/liquid-glass-core';
/**
 * MF remote 出口（docs/proposals/playground-federation-design.md §4 挂载协议）：
 * mount(el, ctx) / unmount()；runtime 由 host 注入（ctx.runtime），
 * 演示区共享 playground 控制台的配置与风格切换。
 */
export interface DemoHostContext {
    runtime: GlassRuntime<HTMLElement>;
    mode: 'remote';
    config: GlassConfigInput;
    demo: {
        platform: string;
        library: string;
    };
}
export declare function mount(el: HTMLElement, ctx: DemoHostContext): void;
export declare function unmount(): void;
declare const _default: {
    mount: typeof mount;
    unmount: typeof unmount;
};
export default _default;
