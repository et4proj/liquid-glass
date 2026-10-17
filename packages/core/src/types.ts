/**
 * 液态玻璃核心契约（M0）
 * 对应架构文档 §4：Surface 声明 / Backend / Probe 三个契约接口。
 * 本包为纯逻辑，不依赖 DOM；仅作类型引用（如 TexImageSource）。
 */

/** 效果档位，能力从低到高 */
export type Tier = "none" | "solid" | "css" | "svg" | "webgl" | "native";

/** 档位高低顺序，用于比较与降级 */
export const TIER_ORDER = ["none", "solid", "css", "svg", "webgl", "native"] as const;

/** 表面角色 */
export type SurfaceRole = "bar" | "sheet" | "overlay" | "control" | "card" | "capsule";

/** 材质预设 */
export type MaterialPreset = "regular" | "clear" | "tinted";

/** 表面形状 */
export interface SurfaceShape {
  kind: "rounded" | "capsule" | "circle";
  radius?: number | "auto";
}

/** 折射所需背景的来源提示；css 档忽略 */
export type BackdropHint = "page" | "self" | { kind: "source"; id: string };

/** Surface 声明：适配层 / 绑定层向核心描述一个玻璃表面 */
export interface SurfaceDeclaration {
  role: SurfaceRole;
  shape?: SurfaceShape;
  material?: MaterialPreset;
  /** 0..1，覆盖全局强度 */
  intensity?: number;
  /** 覆盖着色 */
  tint?: string;
  /** 按压回弹、高光跟随 */
  interactive?: boolean;
  /** 同组玻璃块的"融合"分组（如相邻胶囊） */
  group?: string;
  backdrop?: BackdropHint;
  /** 该表面单独限制的档位上限 */
  maxTier?: Tier;
}

/** 已注册表面的句柄；target 由各平台后端解释（Web: HTMLElement；小程序: 组件 id/ref；原生壳: view tag） */
export interface SurfaceHandle<T = unknown> {
  id: string;
  target: T;
  declaration: SurfaceDeclaration;
}

/** 档位选择 / 降级原因，用于调试与线上排查（§5.4） */
export type ReasonCode =
  | "ok"
  | "a11y:reduce-transparency"
  | "a11y:increase-contrast"
  | "a11y:reduce-motion"
  | "rule:disabled"
  | "rule:max-tier"
  | "role:max-tier"
  | "surface:max-tier"
  | "cap:backdrop-filter"
  | "cap:backdrop-filter-svg"
  | "cap:webgl2"
  | "cap:native-glass"
  | "budget:max-surfaces";

/** 材质 token（§4.1 的 TS 形态，与 CSS 变量 --glass-* 一一对应）
 *  v2：形状冻结（css 后端零改动）；refraction 字段由 refraction 通道的 strength 投影 */
export interface MaterialTokens {
  /** 背景模糊半径 px */
  blur: number;
  /** 背景饱和度 */
  saturation: number;
  /** 着色 */
  tint: string;
  /** 描边 */
  border: string;
  /** 顶部/边缘高光强度 0..1 */
  highlight: number;
  /** 阴影 */
  shadow: string;
  /** 折射强度 0..1（= refraction 通道 strength 投影），仅 svg/webgl/native 档生效 */
  refraction: number;
  /** 圆角 px */
  radius: number;
}

/** 折射通道 token（token v2）：svg/webgl/native 档消费；
 *  css 档仅将 strength 投影为 --glass-refraction */
export interface RefractionTokens {
  /** 折射强度 0..1 */
  strength: number;
  /** 折射率（空气 1 → 玻璃 1.5） */
  ior?: number;
  /** 折射带宽度（占半径比例，0..1）：ios26/ios27 校准 0.18（边缘窄带），
   *  → 0.5 为穹顶透镜（外半环曲面），→ 1 为整面凸透镜（plano-convex 放大镜形态） */
  bezelWidth?: number;
  /** 色差强度（RGB 位移差；规划中仅 WebGL 档消费） */
  aberration?: number;
  /** 边缘 rim light 不透明度 0..1（0 关闭） */
  rimLight?: number;
  /** 开放字段（风格包先行、消费者后到） */
  [key: string]: number | undefined;
}

/** 交互物理通道 token（token v2）：TabBar 液滴增强件等消费，
 *  参数语义见 docs/research/ios27-tab-interaction-spec.md §2.2 */
export interface MotionTokens {
  /** 每帧逼近剩余距离的比例（液滴快速收敛） */
  attraction?: number;
  /** 松手回弹：速度 → 拉伸映射 */
  stretchPerSpeed?: number;
  /** 松手回弹拉伸上限 */
  maxStretch?: number;
  /** 拖动中拉伸映射（拖动时形变更明显） */
  dragStretchPerSpeed?: number;
  /** 拖动中拉伸上限 */
  dragMaxStretch?: number;
  /** squash 尺度逐帧平滑系数 */
  wobbleLerp?: number;
  /** 拖出边界的橡皮筋阻力（除数） */
  edgeResistance?: number;
  /** 低于该距离即静止（节能停 rAF） */
  settleDistance?: number;
  /** 低于该抖动幅度即静止 */
  settleWobble?: number;
  /** 标签透明度收敛速度 */
  labelFadeLerp?: number;
  /** 开放字段 */
  [key: string]: number | undefined;
}

/** 通道化 token 集（token v2，docs/proposals/token-system-v2.md §3）：
 *  JS 对象是运行时唯一权威形态；CSS 变量 / uniforms 只是投影 */
export interface GlassTokens {
  /** 形状冻结（MaterialTokens 契约不变） */
  material: MaterialTokens;
  refraction?: RefractionTokens;
  motion?: MotionTokens;
  /** 未知通道透传（前向兼容：风格包先行、消费者后到） */
  [channel: string]: unknown;
}

/** 核心输出的渲染计划 */
export interface RenderPlan {
  tier: Tier;
  tokens: GlassTokens;
  interactive: boolean;
  reasons: ReasonCode[];
}

/** 渲染后端实例（§4.3） */
export interface BackendInstance {
  update(plan: RenderPlan): void;
  /** 不可见 / KeepAlive 失活 / 滚动中降级 */
  pause(): void;
  resume(): void;
  /** 必须幂等（React StrictMode 会重复挂载） */
  unmount(): void;
}

/** 渲染后端（§4.3） */
export interface GlassBackend<T = unknown> {
  readonly tier: Tier;
  readonly platform: Platform;
  supports(caps: Capabilities, surface: SurfaceHandle<T>): boolean;
  mount(surface: SurfaceHandle<T>, plan: RenderPlan): BackendInstance;
}

/** 平台 */
export type Platform = "web" | "miniprogram" | "native-shell";

/** 平台能力探测结果（§4.4） */
export interface Capabilities {
  platform: Platform;
  engine?: "blink" | "webkit" | "gecko" | "other";
  os?: "ios" | "android" | "harmony" | "desktop";
  osVersion?: string;
  backdropFilter: boolean;
  /** SVG 滤镜能否用于 backdrop-filter（Safari 通常为 false） */
  backdropFilterWithSvg: boolean;
  webgl2: boolean;
  webgpu?: boolean;
  htmlInCanvas?: boolean;
  /** iOS 26+ 且存在桥接 */
  nativeGlass: boolean;
  a11y: {
    reduceTransparency: boolean;
    reduceMotion: boolean;
    increaseContrast: boolean;
  };
  device: { tier: "low" | "mid" | "high"; dpr: number };
  /** 小程序基础库版本 */
  mp?: { sdkVersion: string };
}

/** 平台探针（§4.4） */
export interface PlatformProbe {
  readonly platform: Platform;
  detect(): Capabilities | Promise<Capabilities>;
  /** 系统设置变化（如"降低透明度"）时通知核心重新解析 */
  subscribe?(cb: (caps: Capabilities) => void): () => void;
}

/** 背景源，为 WebGL 档预留（§4.5） */
export interface BackdropSource {
  id: string;
  kind: "static-image" | "video" | "canvas" | "html-in-canvas";
  /** 返回可用于 WebGL 纹理上传的对象 */
  acquire(): Promise<TexImageSource | null>;
  release(): void;
}
