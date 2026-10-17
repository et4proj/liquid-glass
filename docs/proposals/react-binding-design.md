# packages/react 设计文档：React 绑定层（v1）

> 状态：设计定稿，待实现 ｜ 日期：2026-10-17 ｜ 上游：[react-line-roadmap.md](react-line-roadmap.md)（P0）
> 架构依据：架构文档 §8 绑定层规范、§3.2 依赖方向（绑定层 → core ← 探针）

## 1. 定位与设计原则

把 React 生命周期**翻译**成 web 运行时的 `register / unregister / updateConfig / dispose`，仅此而已。

三条原则：

1. **薄**：不缓存状态、不重渲染玻璃（渲染由 web 后端自治），React 侧只做"声明 → 注册"的桥。
2. **非硬依赖**（架构 §8）：React 项目可以完全不用本包——`data-glass` 属性声明式路线照常工作。本包的价值是类型安全的声明式 JSX 体验。
3. **幂等**：StrictMode 双挂载、竞态 unmount、重复 dispose，任何顺序都安全。

## 2. 包结构

```
packages/react/
  src/
    provider.tsx      # GlassProvider + GlassContext
    surface.tsx        # GlassSurface 组件
    hooks.ts           # useGlass / useGlassSurface / useGlassConfig
    index.ts           # re-export core/web 类型 + 本包 API
  package.json         # @et4proj/liquid-glass-react，peerDeps: react ^18
```

依赖：`@et4proj/liquid-glass-core`（类型）+ `@et4proj/liquid-glass-web`（运行时，peer）+ `react`（peer）。测试：Vitest + jsdom + @testing-library/react。

## 3. 架构设计

### 3.1 组件树与 runtime 所有权

```
<GlassProvider config backends?>        ← 唯一 GlassRuntime 实例的所有者
  <nav>                                  ← 普通 DOM
    <GlassSurface role="bar" shape={capsule}>
      TabBar 内容（任意子树，含 Portal）
    </GlassSurface>
  ...
```

- **runtime 实例挂在 Provider 的 `useRef` 上**（不用 useMemo：StrictMode 会丢弃重算，ref 在组件实例存续期稳定）。
- Provider 卸载时 `runtime.dispose()`；StrictMode 模拟卸载后二次挂载时允许"dispose → 重建"，register 队列与 flush 语义（web 运行时已有）保证恢复正确。
- 默认后端链 `[svgBackend, cssBackend]`、默认探针 `createWebProbe()`，均可通过 props 替换（测试与小程序复用）。
- Provider 可嵌套：内层 Provider 创建独立 runtime（多实例场景），`useGlass` 取最近一层。v1 不做实例间通信——多 runtime 的 budget 各自独立（core resolve 语义本就是 per-runtime）。

### 3.2 SSR 安全

Provider 与 Surface 的**渲染期零浏览器 API**：probe / backends / register 全部发生在 effect 中（SSR 不跑 effect）。web 包的模块导入本身无副作用（`createWebProbe` 只在调用时触碰 window），因此 Next.js / SSR 下客户端组件直接可用；v1 明确不支持服务端渲染玻璃（架构 §8），文档标注。

## 4. 工作流程

### 4.1 生命周期 → 运行时映射

```
GlassProvider mount
  └ lazy: runtime = createGlass({ config, probe, backends })   // ref 持有，幂等
GlassSurface mount
  └ useEffect: handle = runtime.register(el, decl)
     cleanup: handle.unregister()                               // 必须幂等
GlassSurface decl 变化（浅比较）
  └ handle.unregister() → runtime.register(el, nextDecl)       // M0 简化语义：
     声明变更走"重挂"而非"原地更新"（web 契约无 per-surface update API）
GlassProvider config prop 变化
  └ useEffect: runtime.updateConfig(partial)                   // 深比较按通道，避免无谓重渲染
卸载
  GlassSurface cleanup → unregister；GlassProvider cleanup → dispose()
```

### 4.2 StrictMode（dev 双挂载，react-demo 强制开启）

```
effect#1: register → handle₁
cleanup#1: handle₁.unregister()
effect#2: register → handle₂        ← 最终状态一致，surface 仍在 runtime 中恰有一份
```

可靠性前提（web 包已有/需补）：

- `unregister()` 幂等：对同一 handle 重复调用安全（web 现实现需在 P0 补一个幂等测试确认，不满足则修 web）。
- `register(el, decl)` 对同一元素重复注册：后注册覆盖前注册（先 unregister 同元素旧 handle，避免预算双占位）。P0 一并核实。

### 4.3 Portal 弹层

React 的 Portal **保留 React context**，`useGlass` / `<GlassSurface>` 在 Portal 子树照常工作——绑定层无需特殊处理。真正的深水区是 DOM 侧：弹层挂到 `document.body` 后 `--glass-*` 变量继承断链，这属于 adapter 层的 overlay 注入问题（见 [adapter-system-design.md](adapter-system-design.md) §3.4），本包不解决也不重复解决。

## 5. API 设计

```ts
// index.ts 导出面
export { GlassProvider, GlassSurface, useGlass, useGlassSurface, useGlassConfig };
export type { GlassProviderProps, GlassSurfaceProps };
// 类型 re-export（免得使用者再装 core/web）
export type {
  SurfaceDeclaration,
  GlassConfigInput,
  GlassRuntime,
  PlatformProbe,
  GlassBackend,
} from "...";

interface GlassProviderProps {
  /** 局部配置；prop 变化自动同步 runtime.updateConfig（按通道浅比较） */
  config?: GlassConfigInput;
  /** 缺省 createWebProbe()；测试/复用场景可注入 */
  probe?: PlatformProbe;
  /** 缺省 [createSvgBackend(), createCssBackend()]，按 tier 排序由 runtime 决定取舍 */
  backends?: GlassBackend<HTMLElement>[];
  children: ReactNode;
}

interface GlassSurfaceProps extends SurfaceDeclaration {
  /** 多态标签，缺省 'div' */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  // SurfaceDeclaration 全部字段（role / shape / interactive / priority …）平铺为 props
}

/** 取最近 Provider 的 runtime；Provider 外调用返回 null + dev 警告 */
function useGlass(): GlassRuntime<HTMLElement> | null;

/**
 * 无 JSX 场景的 hook 版（给既有组件加玻璃而不改 DOM 结构）：
 * const { ref, id } = useGlassSurface({ role: 'bar' })
 * return <nav ref={ref}>…</nav>
 */
function useGlassSurface(decl: SurfaceDeclaration): {
  ref: (el: HTMLElement | null) => void;
  id: string | null; // register 后的 surfaceId，未挂载为 null
};
```

设计取舍记录：

| 决定                                            | 理由                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| decl 变化走 unregister+re-register              | web 契约无 per-surface update；声明变更低频，KISS                                                                           |
| `useGlassSurface` 用 ref 回调而非 effect+useRef | React 19 中 ref 回调的 cleanup 语义更贴合 unregister；同时避免"effect 跑时 ref 还是 null"的时序坑                           |
| 组件用 forwardRef                               | 兼容 React 18（19 的 ref-as-prop 向后兼容）                                                                                 |
| 不提供 `pause()/resume()` 组件 API              | web 的 `BackendInstance` 已有 pause；KeepAlive 场景（Vue 侧）在 React 不存在，Tab 切换失活由用户自行调用 runtime，v1 不包装 |
| 类型直接 re-export core/web                     | 用户零额外依赖心智；peer 关系保持                                                                                           |

## 6. 测试策略

1. **生命周期单测**（@testing-library/react + jsdom）：mount 后 surface 注册成功；unmount 后 unregister；decl 变化重挂；StrictMode 双挂载后恰好一份注册（用 mock runtime 计数断言）。
2. **幂等测试**：重复 unregister / dispose 后再操作不抛错。
3. **Portal 测试**：`createPortal` 内的 GlassSurface 能拿到 context runtime 并注册。
4. **SSR 冒烟**：`renderToString(GlassProvider + GlassSurface)` 不触碰 window（jsdom 下 mock 掉 window 抛错兜底）。
5. 真实效果验收不在单测——在 `playground/ant-design-mobile`（人眼 + 真机，用户自验）。

## 7. 范围边界（v1 不做）

- 服务端渲染玻璃（SSR 输出玻璃 HTML/CSS）——M2。
- 任何 L2 增强组件（气泡 TabBar / 液态 Switch）——P4，另行设计。
- Vue 侧对应物（`packages/vue`）——本线路只做 React。
- 声明式的 `data-glass` 与本包的共存冲突处理（两者都指向同一元素时后到者胜）——P0 测试覆盖后写结论即可。
