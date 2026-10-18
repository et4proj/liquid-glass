export { liquidGlassVue, GLASS_KEY } from "./plugin";
export type { GlassPluginOptions, GlassContextValue } from "./plugin";
export { GlassSurface } from "./surface";
export { useGlass, useGlassSurface } from "./hooks";
export { sameDecl } from "./shared";
// 类型 re-export：使用者无需另装 core/web
export type {
  SurfaceDeclaration,
  SurfaceRole,
  SurfaceShape,
  BackdropHint,
  GlassConfigInput,
  GlassBackend,
  PlatformProbe,
} from "@et4proj/liquid-glass-core";
export type { GlassRuntime, SurfaceHandleApi, CreateGlassOptions } from "@et4proj/liquid-glass-web";
