import { computed, defineComponent, h } from "vue";
import type { ComponentPublicInstance, PropType, VNodeRef } from "vue";
import type {
  SurfaceDeclaration,
  SurfaceRole,
  SurfaceShape,
  BackdropHint,
  Tier,
} from "@et4proj/liquid-glass-core";
import { useGlassSurface } from "./hooks";

/**
 * 声明式玻璃表面组件（对应 react GlassSurface）：
 * <GlassSurface as="nav" role="bar" :shape="{ kind: 'capsule' }">
 * SurfaceDeclaration 字段平铺为 props；剩余 attrs 透传到根元素。
 * 纯 .ts（defineComponent + h）而非 SFC，避免 SFC 编译链（库形态 dts 更干净）。
 */

type SurfaceTag = "div" | "nav" | "header" | "footer" | "section" | "aside" | "main";

export const GlassSurface = defineComponent({
  name: "GlassSurface",
  props: {
    /** 多态标签，缺省 'div' */
    as: { type: String as PropType<SurfaceTag>, default: "div" },
    role: { type: String as PropType<SurfaceRole>, required: true },
    shape: { type: Object as PropType<SurfaceShape>, default: undefined },
    material: { type: String as PropType<SurfaceDeclaration["material"]>, default: undefined },
    intensity: { type: Number, default: undefined },
    tint: { type: String, default: undefined },
    interactive: { type: Boolean, default: undefined },
    group: { type: String, default: undefined },
    backdrop: { type: [String, Object] as PropType<BackdropHint>, default: undefined },
    maxTier: { type: String as PropType<Tier>, default: undefined },
  },
  setup(props, { attrs, slots }) {
    // computed 依赖收集 → useGlassSurface 的 decl watch 只在字段真正变化时触发
    const decl = computed<SurfaceDeclaration>(() => ({
      role: props.role,
      shape: props.shape,
      material: props.material,
      intensity: props.intensity,
      tint: props.tint,
      interactive: props.interactive,
      group: props.group,
      backdrop: props.backdrop,
      maxTier: props.maxTier,
    }));
    const { el } = useGlassSurface(decl);
    return () =>
      h(
        props.as,
        {
          ...attrs,
          // 函数 ref：同节点重渲染时赋同值，shallowRef 不再触发 watch（幂等）
          ref: ((node: Element | ComponentPublicInstance | null) => {
            el.value = (node as HTMLElement | null) ?? null;
          }) as VNodeRef,
        },
        slots.default?.(),
      );
  },
});
