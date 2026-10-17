import { describe, expect, it } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { GlassProvider, GlassSurface, useGlass, useGlassSurface } from "../src";
import { SURFACE_CLASS } from "@et4proj/liquid-glass-web";
import type { Capabilities } from "@et4proj/liquid-glass-core";

// React 18 act 环境声明（RTL 16 要求）
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * React 绑定层单测（docs/proposals/react-binding-design.md §6）：
 * 生命周期 / StrictMode 幂等 / 声明变化重挂 / Provider 外安全。
 */

const caps: Capabilities = {
  platform: "web",
  engine: "blink",
  os: "android",
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  a11y: { reduceTransparency: false, reduceMotion: false, increaseContrast: false },
  device: { tier: "high", dpr: 3 },
};

const probe = { platform: "web" as const, detect: () => caps };

/** register → flush 是 macrotask 级（与 web 包单测一致），act 内需显式等一帧 */
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = () =>
  act(async () => {
    await tick();
  });

function setup(children: ReactNode) {
  return render(<GlassProvider probe={probe}>{children}</GlassProvider>);
}

describe("GlassProvider + useGlassSurface 生命周期", () => {
  it("mount 后注册表面，unmount 后注销", async () => {
    const { unmount } = setup(<GlassSurface role="bar" data-testid="s" />);
    await settle();
    const el = document.querySelector('[data-testid="s"]') as HTMLElement;
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    unmount();
    await settle();
    expect(document.querySelector('[data-testid="s"]')).toBeNull();
  });

  it("声明变化触发 unregister + re-register", async () => {
    const { rerender } = setup(<GlassSurface role="bar" data-testid="s" />);
    await settle();
    rerender(
      <GlassProvider probe={probe}>
        <GlassSurface role="bar" intensity={0.9} data-testid="s" />
      </GlassProvider>,
    );
    await settle();
    const el = document.querySelector('[data-testid="s"]') as HTMLElement;
    // 注册保持唯一（同元素 register 幂等/重挂后恰好一份）
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    expect(document.querySelectorAll("." + SURFACE_CLASS).length).toBe(1);
  });

  it("StrictMode 双挂载后恰好一份注册", async () => {
    render(
      <StrictMode>
        <GlassProvider probe={probe}>
          <GlassSurface role="bar" />
        </GlassProvider>
      </StrictMode>,
    );
    await settle();
    expect(document.querySelectorAll("." + SURFACE_CLASS).length).toBe(1);
    cleanup();
  });

  it("useGlassSurface hook 版本：ref 注册 + id 暴露", async () => {
    let capturedId: string | null = null;
    function Probe() {
      const { ref, id } = useGlassSurface({ role: "control" });
      // eslint-disable-next-line react/globals -- 测试捕获渲染结果供断言（组件外计数器惯用法）
      capturedId = id;
      return <nav ref={ref} />;
    }
    setup(<Probe />);
    await settle();
    const nav = document.querySelector("nav") as HTMLElement;
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(true);
    expect(typeof capturedId).toBe("string");
    cleanup();
  });

  it("Provider 外 useGlassSurface 安全 no-op", async () => {
    function Orphan() {
      const { ref, id } = useGlassSurface({ role: "bar" });
      return <nav ref={ref} data-id={id ?? ""} />;
    }
    expect(() => render(<Orphan />)).not.toThrow();
    await settle();
    expect(document.querySelector("nav")!.classList.contains(SURFACE_CLASS)).toBe(false);
    cleanup();
  });

  it("Provider 内 useGlass 首帧即可取到 runtime（render 期惰性创建语义）", async () => {
    const seen: Array<boolean> = [];
    function Child() {
      const glass = useGlass();
      const { ref } = useGlassSurface({ role: "bar" });
      // 语义：Provider render 期惰性创建，子组件 render 即有值
      seen.push(!!glass);
      return <nav ref={ref} />;
    }
    setup(<Child />);
    await settle();
    expect(seen[0]).toBe(true);
    cleanup();
  });
});
