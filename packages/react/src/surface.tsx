import { forwardRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { SurfaceDeclaration } from "@et4proj/liquid-glass-core";
import { useGlassSurface } from "./hooks";

/**
 * 声明式玻璃表面组件（docs/proposals/react-binding-design.md §5）：
 * <GlassSurface as="nav" role="bar" shape={{ kind: 'capsule' }}>
 * SurfaceDeclaration 字段平铺为 props；DOM ref 正常转发（与内部注册 ref 合并）。
 */

type SurfaceTag = "div" | "nav" | "header" | "footer" | "section" | "aside" | "main";

export interface GlassSurfaceProps extends SurfaceDeclaration {
  /** 多态标签，缺省 'div' */
  as?: SurfaceTag;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(
  function GlassSurface(props, forwardedRef) {
    const {
      as: Tag = "div",
      role,
      shape,
      material,
      intensity,
      tint,
      interactive,
      group,
      backdrop,
      maxTier,
      className,
      style,
      children,
      ...rest
    } = props;
    const { ref } = useGlassSurface(
      { role, shape, material, intensity, tint, interactive, group, backdrop, maxTier },
      forwardedRef,
    );
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 多态标签的 rest 透传
      <Tag ref={ref as any} className={className} style={style} {...rest}>
        {children}
      </Tag>
    );
  },
);
