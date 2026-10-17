import { createContext, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  createGlass,
  createWebProbe,
  createCssBackend,
  createSvgBackend,
} from "@et4proj/liquid-glass-web";
import type { GlassRuntime } from "@et4proj/liquid-glass-web";
import type { GlassConfigInput, GlassBackend, PlatformProbe } from "@et4proj/liquid-glass-core";

/**
 * React 绑定层（架构 §8，docs/proposals/react-binding-design.md §3）：
 * GlassProvider 持有唯一 GlassRuntime；渲染期零浏览器 API（SSR 安全），
 * probe / backends / register 全部发生在 effect / commit 期。
 */

export interface GlassProviderProps {
  /** 局部配置；prop 变化自动同步 runtime.updateConfig（引用比较） */
  config?: GlassConfigInput;
  /** 缺省 createWebProbe()；测试/复用场景可注入 */
  probe?: PlatformProbe;
  /** 缺省 [svg, css] 两条后端链，由 runtime 按 tier 取舍 */
  backends?: GlassBackend<HTMLElement>[];
  children: ReactNode;
}

export interface GlassContextValue {
  /** 惰性确保 runtime 存在（首个消费者调用时创建；StrictMode 重建后再次创建） */
  ensureRuntime(): GlassRuntime<HTMLElement>;
  /** 当前 runtime；未挂载/已销毁时为 null */
  readonly runtime: GlassRuntime<HTMLElement> | null;
}

export const GlassContext = createContext<GlassContextValue | null>(null);

export function GlassProvider({ config, probe, backends, children }: GlassProviderProps) {
  const holder = useRef<GlassRuntime<HTMLElement> | null>(null);
  // options 存 ref：StrictMode 重建 runtime 时取最新 props
  const optionsRef = useRef({ config, probe, backends });
  // eslint-disable-next-line react/refs -- render 期写 ref：StrictMode 重建 runtime 时取最新 props（m1-react-line 决定表 #11）
  optionsRef.current = { config, probe, backends };

  const ensureRuntime = useCallback(() => {
    if (holder.current === null) {
      const opts = optionsRef.current;
      holder.current = createGlass({
        config: opts.config,
        // 默认探针/后端链在此创建；createGlass 构造期零浏览器 API（caps 惰性探测）。
        // SSR 下必须注入 probe/backends（v1 语义，见设计文档 §3.2）
        probe: opts.probe ?? createWebProbe(),
        backends: opts.backends ?? [createSvgBackend(), createCssBackend()],
      });
    }
    return holder.current;
  }, []);

  // render 期惰性创建：useGlass 首帧即可拿到 runtime（无需等 effect）
  // eslint-disable-next-line react/refs -- createGlass 构造期零浏览器 API，render 期创建是设计决定（m1-react-line #11）
  if (holder.current === null) ensureRuntime();

  // config prop 变化 → 增量更新（引用比较：调用方换对象即表示要更新）
  const prevConfig = useRef(config);
  useEffect(() => {
    if (prevConfig.current !== config) {
      prevConfig.current = config;
      if (config) holder.current?.updateConfig(config);
    }
  }, [config]);

  // 生命周期：StrictMode 模拟卸载 → dispose 置 null → 重挂载时 render 未重跑，effect 兜底重建
  useEffect(() => {
    if (holder.current === null) ensureRuntime();
    return () => {
      holder.current?.dispose();
      holder.current = null;
    };
  }, [ensureRuntime]);

  const ctxValue = useMemo<GlassContextValue>(
    () => ({
      ensureRuntime,
      get runtime() {
        return holder.current;
      },
    }),
    [ensureRuntime],
  );

  return <GlassContext.Provider value={ctxValue}>{children}</GlassContext.Provider>;
}
