export { GlassProvider, GlassContext } from "./provider";
export type { GlassProviderProps, GlassContextValue } from "./provider";
export { GlassSurface } from "./surface";
export type { GlassSurfaceProps } from "./surface";
export { useGlass, useGlassSurface } from "./hooks";
// 类型 re-export：使用者无需另装 core/web
export type {
  SurfaceDeclaration,
  SurfaceRole,
  SurfaceShape,
  GlassConfigInput,
  GlassBackend,
  PlatformProbe,
} from "@et4proj/liquid-glass-core";
export type { GlassRuntime, SurfaceHandleApi, CreateGlassOptions } from "@et4proj/liquid-glass-web";
