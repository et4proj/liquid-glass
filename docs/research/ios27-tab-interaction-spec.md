# iOS 27 Tab 按压曲面镜交互：技术规格（预研）

> 状态：预研定稿（2026-10-15）｜ 类型：交互规格 / 算法笔记
> 现象定义：手指按住 Tab（或分段控件）拖动/切换时，选中"气泡"是一块真实曲面镜——跟随手指、拉伸变形、经过标签时边缘透镜弯折背景、松手后弹回目标位。
> 用途：胶囊 TabBar 增强件（M1）与 WebGL 后端（M2）的交互层依据。

## 1. 系统行为分解（iOS 26 引入 / 27 调优）

按住 Tab 的完整时间线：

```
按下   → 气泡玻璃变亮（brighten）+ 轻微缩放（系统 interactive glass 行为）
拖动   → 气泡跟随手指，速度方向上被"拉伸"（squash & stretch），
         拖出轨道边界时有橡皮筋阻力（rubber-band）
经过   → 气泡掠过相邻标签，玻璃像液滴一样部分覆盖标签文字，
         文字颜色按覆盖率实时混合（不被过滤/栅格化，始终清晰）
松手   → 弹簧动画弹回最近/目标 Tab，速度惯性带来 overshoot 回弹，
         快速连点可中断并从当前位置重新瞄准（retarget，非重启）
静止   → 多个玻璃元素近距离时相互"吸引融合"为连续表面（merge），
         分离时反向（split），而非两个独立层的交叠
```

对应 SwiftUI API（我们 Web 侧的语义对标物）：

| Apple API | 语义 | Web 对标 |
|---|---|---|
| `glassEffect(_:in:)` | 按形状应用玻璃材质 | `SurfaceDeclaration.shape` |
| `.interactive()` | 按压变亮/缩放/微光响应 | `.lg-interactive`（已实现按压回缩+高光跟随） |
| `GlassEffectContainer(spacing:)` | 组内玻璃统一采样/融合；spacing 为吸引融合距离阈值 | 增强件容器（待实现） |
| `glassEffectID(_:in:)` | 稳定 ID，视图增删时玻璃 merge/split 动画 | 气泡 morph 引擎（待实现） |
| `glassEffectUnion(id:namespace:)` | 多视图几何合并为单一玻璃胶囊 | 气泡与 TabBar 融合（待实现） |

## 2. 关键算法与参数（Web 实现路径）

### 2.1 曲面镜（透镜）本体 —— WebGL 单 pass shader

数据来源 @zeroqs/liquid-toggle（逐参数实测调优过的开源实现）：

```
管线：胶囊 SDF → 表面法线 → 向心位移（边缘最强、圆弧区增强）
     → RGB 三次采样微差偏移（色差）→ rim light

每帧成本：1 次 uniform2f + 1 次 draw call（~200×60 quad，全浏览器 WebGL）
```

**光学参数**（可直接作为增强件默认值）：

| 参数 | 默认值 | 说明 |
|---|---|---|
| strength | 7 px | 边缘最大位移（总强度旋钮）；对比静态卡片贴图的 20–45px，交互小件明显更收敛 |
| bezelWidth | 9 px | 折射带宽度（smear 深入透镜的程度） |
| axisStrength | {x: 1, y: 0.25} | 分轴阻尼——透镜比轨道高，顶/底全位移会把轨道 1px 描边拖成粗带 |
| cornerBoost | 1.5 | 圆弧端位移倍增（内容沿透镜曲线弯折的关键；平边保持平静） |
| cornerSpread | 0.45 | 增强区沿圆弧的展开范围（指数；越小弯折覆盖整段弧） |
| aberration | 0.08 | 色差：红采样 1+a、蓝 1−a 倍位移；0 关闭 |
| specularOpacity | 0.5 | 边缘 rim light 不透明度 |
| lightAngle | π/3 | rim light 光源方向 |
| quality | 2 | 透镜 canvas 与轨道纹理超采样（retina 文字保清晰） |

### 2.2 液滴运动 —— 弹簧 + squash & stretch

两种已验证的"流"模式（fluidkit LiquidTabs，语义直接对应系统行为）：

| 模式 | 行为 | 适用 |
|---|---|---|
| slide（液滴） | 单个带惯性的液滴迁移：速度方向压扁、尾部滞后、经张力场回融、落点摊平 | Tab 切换（默认） |
| stretch（太妃糖） | 整条不断裂的胶囊：前缘扑向目标、后缘滞后、跨间隙拉伸后回弹 | 分段控件 |

**运动参数**（liquid-toggle 实测值）：

| 参数 | 默认值 | 说明 |
|---|---|---|
| attraction | 0.4 /帧 | 每帧逼近剩余距离的比例（0.4 ≈ 快速收敛） |
| stretchPerSpeed / maxStretch | 0.02 / 0.35 | 松手回弹：速度→拉伸映射与上限 |
| dragStretchPerSpeed / dragMaxStretch | 0.05 / 0.4 | 拖动中：更强的拉伸映射（拖动时形变更明显） |
| wobbleLerp | 0.2 /帧 | squash 尺度的逐帧平滑 |
| edgeResistance | 3（除数） | 拖出边界的橡皮筋阻力 |
| settleDistance / settleWobble | 0.1 / 0.01 | 低于阈值即静止并停掉 rAF（节能） |
| labelFadeLerp | 0.25 /帧 | 标签透明度收敛速度（视觉匹配 ~0.15s CSS fade） |

### 2.3 文字层架构（不可妥协项）

**文字永远不进被过滤/栅格化的子树**（fluidkit 的"house rule"，系统同款做法）：

```
容器
├── 指示器层（absolute、pointer-events:none、aria-hidden）
│     只含液滴主体（clip-path 几何 × 材质填充），无文字、无 blur 作用于文字
└── 按钮层（role="tab"，置顶，完全可交互）
      标签文字；激活色按"液滴覆盖度"逐帧数值混合（不经过 filter）
```

标签色混合：`labelColor → activeLabelColor` 按覆盖率 lerp（每帧数值计算，成本低且全程清晰）。

### 2.4 merge/split（气泡与容器融合）

系统行为 = `GlassEffectContainer` + `glassEffectID` 的 morph。Web 近似方案：

- **SVG 路径（Chromium）**：两块玻璃共用同一个 `feDisplacementMap` 滤镜节点，几何用 clip-path 联合（union），动画期间唯一变化的是 clip-path 路径 → 滤镜零重建
- **WebGL 路径（全浏览器，M2）**：透镜 quad 位置/缩放即 uniform，squash & stretch 在 GPU 合成层变换，单 uniform/帧
- 融合判定：间距 < spacing 阈值（系统语义）开始融合插值，t∈[0,1] 从两形到联合形

### 2.5 可访问性

- `prefers-reduced-motion`：指示器瞬移（无弹簧无流动），标签直接切换——与 fluidkit 降级一致，我们的 resolve 已有 `a11y.reduceMotion → interactive=false` 链路可复用
- `role="tablist"/"tab"` + 方向键/Home/End + roving tabindex（键盘可达）
- 拖动交互必须可与点击共存（click or drag release 语义）

## 3. 落地映射（本仓库）

| 能力 | 落点 | 里程碑 |
|---|---|---|
| 按压变亮/回缩/高光跟随 | `.lg-interactive`（已实现） | M1 ✅ |
| 液滴 slide / stretch 运动 + 弹簧 | 胶囊 TabBar 增强件（packages/web 增强，框架无关内核 + vue/react 绑定） | M1 |
| 曲面镜透镜（SDF→法线→位移→色差→rim） | WebGL 后端（webgl-backend.ts，§2.1 全参数） | M2 |
| 文字双层层架构 | 增强件内置（§2.3 不可妥协项） | M1 |
| merge/split 融合 | 增强件容器（SVG 路径先行，WebGL 统一后替换） | M1→M2 |

> 增强件内核应平台无关（几何/弹簧/覆盖率混合是纯数学），与 core 的 resolve 解耦；WebGL 透镜消费 `refraction` token（§2.1 strength 映射 refraction × 控件短边系数）。

## 4. 参考资料

- Apple Developer — Applying Liquid Glass to custom views（glassEffect / glassEffectUnion / Container）：developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views
- WWDC25 Session 323 "Build a SwiftUI app with the new design"（interactive glass：scaling, bouncing, shimmering）：developer.apple.com/videos/play/wwdc2025/323/
- spaceport.build "Liquid Glass in SwiftUI: A Practical Guide for iOS 27"（Container morphing 语义 + iOS 27 渲染成本下降）
- fluidkit LiquidTabs 文档（slide/stretch 双流、双层文字架构、a11y 降级）：github.com/runvendo/fluidkit · docs/primitives/liquid-tabs.md
- @zeroqs/liquid-toggle npm（曲面镜 shader 全参数 + 弹簧物理参数，本文 §2.1/2.2 数据源）：npmjs.com/package/@zeroqs/liquid-toggle
