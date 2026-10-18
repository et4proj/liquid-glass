import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, inject, withDirectives, resolveDirective } from "vue";
import type { Plugin } from "vue";
import { GLASS_KEY, GlassSurface, liquidGlassVue, useGlass, useGlassSurface } from "../src";
import type { GlassContextValue, GlassPluginOptions } from "../src";
import { SURFACE_CLASS } from "@et4proj/liquid-glass-web";
import type { Capabilities } from "@et4proj/liquid-glass-core";

/**
 * Vue 绑定层单测（语义对齐 react/test/binding.spec.tsx）：
 * 生命周期 / 声明变化重挂 / 插件外安全 / 惰性创建 / v-glass 指令 / ctx dispose。
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

/** register → flush 是 macrotask 级（与 web 包单测一致），需显式等一帧 */
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
  await tick();
  await tick();
}

// 显式元组类型：mount 选项的 plugins 接受 [Plugin, options] 二元组
const global = {
  plugins: [[liquidGlassVue, { probe }] as [Plugin, GlassPluginOptions]],
};

const GlassBar = defineComponent({
  props: { intensity: { type: Number, default: undefined } },
  render() {
    return h(GlassSurface, { role: "bar", intensity: this.intensity, "data-testid": "s" });
  },
});

describe("liquidGlassVue 插件 + useGlassSurface 生命周期", () => {
  it("mount 后注册表面，unmount 后注销", async () => {
    const wrapper = mount(GlassBar, { global, attachTo: document.body });
    await settle();
    const el = document.querySelector('[data-testid="s"]') as HTMLElement;
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    wrapper.unmount();
    await settle();
    expect(document.querySelector('[data-testid="s"]')).toBeNull();
  });

  it("声明变化触发 unregister + re-register（恰好一份注册）", async () => {
    const wrapper = mount(GlassBar, { global, attachTo: document.body });
    await settle();
    await wrapper.setProps({ intensity: 0.9 });
    await settle();
    const el = document.querySelector('[data-testid="s"]') as HTMLElement;
    // 注册保持唯一（同元素 register 幂等/重挂后恰好一份）
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    expect(document.querySelectorAll("." + SURFACE_CLASS).length).toBe(1);
    wrapper.unmount();
  });

  it("useGlassSurface hook 版本：template ref 注册 + id 暴露", async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const { el, id } = useGlassSurface({ role: "control" });
          return () => h("nav", { ref: el, "data-id": id.value ?? "" });
        },
      }),
      { global, attachTo: document.body },
    );
    await settle();
    const nav = document.querySelector("nav") as HTMLElement;
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(true);
    expect(typeof nav.dataset.id).toBe("string");
    expect(nav.dataset.id!.length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("插件外 useGlassSurface 安全 no-op", async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const { el, id } = useGlassSurface({ role: "bar" });
          return () => h("nav", { ref: el, "data-id": id.value ?? "" });
        },
      }),
    );
    await settle();
    const nav = wrapper.element as HTMLElement;
    expect(nav.classList.contains(SURFACE_CLASS)).toBe(false);
    wrapper.unmount();
  });

  it("插件内 useGlass 首次调用即有 runtime（惰性创建语义）", async () => {
    let seen = false;
    const wrapper = mount(
      defineComponent({
        setup() {
          const glass = useGlass();
          // 语义：首个消费者调用时惰性创建，setup 同步即有值
          seen = !!glass;
          return () => h("nav");
        },
      }),
      { global },
    );
    await settle();
    expect(seen).toBe(true);
    wrapper.unmount();
  });

  it("v-glass 指令：注册/声明变化重挂/卸载注销", async () => {
    const wrapper = mount(
      defineComponent({
        props: { intensity: { type: Number, default: undefined } },
        render() {
          // render 函数中指令经 resolveDirective + withDirectives 挂载（SFC v-glass 的等价写法）
          const glassDir = resolveDirective("glass");
          if (!glassDir) throw new Error("v-glass 指令未注册");
          const decl = { role: "bar" as const, intensity: this.intensity };
          return withDirectives(h("nav", { "data-testid": "s" }), [[glassDir, decl]]);
        },
      }),
      { global, attachTo: document.body },
    );
    await settle();
    const el = document.querySelector('[data-testid="s"]') as HTMLElement;
    expect(el.classList.contains(SURFACE_CLASS)).toBe(true);
    await wrapper.setProps({ intensity: 0.9 });
    await settle();
    // 声明变化重挂后恰好一份
    expect(document.querySelectorAll("." + SURFACE_CLASS).length).toBe(1);
    wrapper.unmount();
    await settle();
    expect(document.querySelector('[data-testid="s"]')).toBeNull();
  });

  it("ctx.dispose 后 runtime 置 null，ensureRuntime 重建", async () => {
    let captured: GlassContextValue | null = null;
    const wrapper = mount(
      defineComponent({
        setup() {
          // 消费一次触发惰性创建（无人消费时 runtime 保持 null 是惰性语义本身）
          useGlass();
          captured = inject(GLASS_KEY, null);
          return () => h("nav");
        },
      }),
      { global, attachTo: document.body },
    );
    await settle();
    const ctx = captured!;
    expect(ctx).toBeDefined();
    expect(ctx.runtime).not.toBeNull();
    ctx.dispose();
    expect(ctx.runtime).toBeNull();
    const rebuilt = ctx.ensureRuntime();
    expect(rebuilt).not.toBeNull();
    ctx.dispose();
    wrapper.unmount();
  });
});
