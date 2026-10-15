# iOS 27 Liquid Glass 技术规格（预研）

> 状态：预研定稿（2026-10-15）｜ 类型：技术规格 / 算法笔记
> 定位：**iOS 27 为本框架的主要开发方向**（已正式发布，以 ultra-clear 取向为准）；iOS 26 作为历史基线保留。
> 用途：为 M1 校准与 M2 WebGL 后端提供关键数据与关键算法依据。代码变更另行排期。

参考资料见文末。

## 1. iOS 26 → iOS 27 官方变化（Apple 口径）

| 维度 | iOS 26 | iOS 27 | 来源 |
|---|---|---|---|
| 通透度 | 固定材质，较重磨砂 | **ultra clear ↔ fully tinted 滑杆**，默认显著更透（beta 5 "史上最透"） | Apple 新闻稿 / 9to5Mac |
| 扩散 | blur 均匀 | "更有效扩散背后复杂内容"（保可读性，blur 收敛而非砍光） | WWDC26 SOTU |
| 边缘 | 亮描边为主 | **darkened edge**（暗化边缘，制造纵深与分离） | WWDC26 SOTU |
| 高光 | 柔和 | **brighter specular highlights**（更亮镜面高光） | WWDC26 SOTU |
| 折射 | 边缘变形不均 | **more uniform refraction**（更均匀）+ 更高对比度 | Apple 官网 iOS 27 页 |
| 其他 | — | 图标更锐（多层玻璃 + 选择性折射，Icon Composer 支持） | MacRumors |

> "更透、更少磨砂" 与用户对当前 demo 的观感反馈一致——iOS 26 风格的 blur 权重是"磨砂感重"的直接原因。

## 2. 视觉效果分解：五层光学要素

液态玻璃 = 以下五层的叠加（WebGL 路径完整实现；SVG 路径实现 1+2+4；CSS 路径实现 1+4）：

1. **扩散 / 通透**（diffusion）：背后内容透过 + 柔化。iOS 27 特征：blur 半径小、饱和度补偿高（防"发灰"）。
2. **折射**（refraction）：玻璃作为透镜位移背景像素（非模糊），边缘弯折、中心不动。**这是"液态感"的核心**。
3. **色差**（chromatic aberration）：RGB 在透镜边缘折射率微差 → 彩色镶边。iOS 27 "uniform refraction" 暗示该项被收敛（弱化）。
4. **镜面高光**（specular highlight）：固定光方向的边缘亮环（rim light）。
5. **边缘暗化**（darkened edge，iOS 27 新增）：贴边暗环，与高光共同制造"玻璃厚度"纵深。

## 3. 关键算法

### 3.1 折射：Snell 定律 + squircle 表面 + 位移场（核心算法）

完整推导（kube.io）：把玻璃边缘建模为凸透镜截面，光线从空气（n₁=1）进入玻璃（n₂≈1.5）发生弯折，落到背景平面上的落点偏移即为位移场。

**步骤**（平台无关，可移植小程序 canvas / WebGL shader / SVG 贴图）：

```
1. 表面函数（bezel 内距边缘距离 x∈[0,1] → 玻璃高度 y）：
   Apple 偏好 squircle 凸面：y = (1 - (1-x)^4)^(1/4)
   （圆弧凸面过渡硬、拉伸后有内边痕迹；squircle 过渡平滑，bezel 视觉上更薄）
2. 数值求导得法线：dy/dx（中心差分，δ=0.001），normal = (-dy/dx, 1) 归一化
3. Snell：n₁·sin(θ₁) = n₂·sin(θ₂) → 折射方向
4. 光线行进到背景平面 → 落点 - 原始入射点 = 位移向量（指向内侧，凸面）
5. 预计算：沿单边半径采样 127 点（对齐 8bit 贴图分辨率），
   对称性 ⇒ 一次计算绕边复用（圆角矩形 = 中段拉伸）
6. 归一化：全部位移 / maxDisplacement ⇒ [0,1]，maxDisplacement(像素) 留作 scale
7. 编码位移贴图：R = 128 + vx·127（x 轴），G = 128 + vy·127（y 轴），128 = 中性
```

**关键参数**：

| 参数 | 建议值 | 说明 |
|---|---|---|
| IOR n₂ | 1.5 | 玻璃标准折射率 |
| bezel width | 边长的 15–20%（贴图 18%） | 折射区宽度；胶囊形取短边 |
| 表面函数 | squircle 凸面 | iOS 观感；Switch 等特殊件用 lip 形（凸+凹混合） |
| 位移上限 | maxDisplacement ≈ 20–45px（按控件尺寸） | 归一化基准，同时是 feDisplacementMap 的 scale |
| 贴图分辨率 | 127 级/边（8bit 上限） | 圆角矩形可只用 1D 曲线 + 两轴渐变近似（现 svg-backend 做法） |

**feDisplacementMap 消费**（SVG 路径，Chromium only）：

```
backdrop-filter: url(#filter) blur(var(--glass-blur)) saturate(var(--glass-saturation))
filter 内：feImage(位移贴图) → feDisplacementMap(in=SourceGraphic, in2=贴图,
           scale=maxDisplacement, x=R, y=G, color-interpolation-filters=sRGB)
```

注意：sRGB 插值（默认 linearRGB 会偏移中性灰 128 造成整体平移）；scale 可动画用于淡入淡出而无需重算贴图。

**WebGL 路径**（M2）：同一位移场改在 fragment shader 中采样背景纹理 `texture2D(bg, uv + displacement * scale)`；色差为 R/G/B 三次采样 × 微差 scale（±1~2%）。

### 3.2 扩散 / 通透：低 blur + 饱和补偿

iOS 27 的"更少磨砂"不是去掉 blur，而是**降 blur、提饱和、靠折射承担质感**：

| 量 | ios26（现值） | ios27 方向 | 依据 |
|---|---|---|---|
| blur (regular) | 16px | 6–8px | ultra clear 默认 + "更有效扩散复杂内容"（少量 blur 保可读） |
| saturation | 1.3 | 1.5–1.6 | 低 blur 下背景更"生"，需饱和度补偿防发灰 |
| tint alpha (regular) | 0.18 | 0.06–0.10 | 更透；tinted 滑杆末端 ~0.22+ |

> CSS `backdrop-filter: blur() saturate()` 顺序无影响（函数分别应用），但 blur 半径是"磨砂感"的第一杠杆。

### 3.3 镜面高光：rim light 模型

Apple 实现为边缘光环，强度 = f(表面法线与固定光方向的夹角)：

```
光源方向固定（约 -60°，左上）；对位移场的法线（贴图已含方向信息）：
intensity = max(0, cos(θ_normal - θ_light))^k   // k 控制锐度，k≈2-4
颜色：白 + 高饱和参数（kube.io demo: opacity 0.2–0.5, saturation 4–9）
```

CSS 路径近似（现实现）：`inset 0 1px 0` 上内描边 + `::before` 135° 渐变，强度由 `--glass-highlight` 驱动。iOS 27 要求 highlight 权重上调（0.5 → 0.75 regular）。

### 3.4 边缘暗化（iOS 27 新增）

两层做法（可叠加）：

1. **CSS 近似（已实现）**：`box-shadow: inset 0 0 0 1px rgba(0,0,0,0.10-0.14)` 贴边暗环。
2. **精确做法**：位移贴图 B 通道编码"距边缘距离"（0 贴边 → 128 内部），消费端乘以 `darken = mix(0.85, 1.0, edgeDist)` 或叠加 `rgba(0,0,0, (1-edgeDist)·0.12)`。WebGL/SVG 路径可用；CSS 路径用方案 1 近似即可。

### 3.5 着色滑杆（ultra clear ↔ fully tinted）

系统级连续轴，映射到我们的 token 体系：

```
slider s ∈ [0,1]（0=ultra clear, 1=fully tinted）
tint.alpha = lerp(0.03, 0.24, s)
blur       = lerp(3, 12, s) px        // 着色越重磨砂越重（视觉平衡）
其余（折射/高光/暗边）不变
```

对应框架映射：`material`（clear/regular/tinted）为离散档，`intensity` 为连续轴——**用户级滑杆 = intensity + tint 联动**，落点在绑定层（`v-glass` / `<Glass>` 的 prop），core 不新增概念。

## 4. 平台实现路径映射

| 路径 | 折射 | 扩散 | 高光 | 暗边 | 色差 | 状态 |
|---|---|---|---|---|---|---|
| CSS（全浏览器） | ✗ | blur+saturate | 内描边+渐变 | inset 暗环 | ✗ | M1 已实现 |
| SVG backdrop-filter（Chromium） | 贴图位移 | 同上串联 | feBlend 叠加 rim | B 通道/暗环 | 弱（可选） | M1 已实现（简化贴图） |
| WebGL（M2） | shader 采样 | 双 pass blur | rim shader | edge shader | ✓ | 规划 |
| 小程序（M3） | canvas 离屏合成或半透+blur 近似 | ✓ | ✓ | ✓ | ✗ | 规划 |
| native bridge（M4） | 系统材质 | 系统 | 系统 | 系统 | 系统 | 规划 |

SVG 贴图升级点（对比现 svg-backend 的线性渐变近似）：按 §3.1 完整 squircle + Snell 计算 1D 位移曲线，生成真实位移贴图（现为两轴线性渐变，无 IOR 概念）——列入 M1 校准任务。

## 5. iOS 27 关键数据汇总（STYLE_PRESETS.ios27 校准目标）

现有草案（tokens.ts）对照本规格的修订建议：

| token | 现草案 | 建议校准值 | 说明 |
|---|---|---|---|
| blur | 3/8/14 | **2/6/12** | 进一步压磨砂；strong 仍需可读性下限 |
| saturation | 1.35/1.55/1.75 | 1.4/1.6/1.8 | 饱和补偿随 blur 降低而上调 |
| highlight | 0.45/0.75/1.0 | 0.5/0.8/1.0 | brighter specular |
| refraction | 0.3/0.65/0.95 | 0.35/0.7/1.0 | uniform refraction + 更强 |
| tint (regular/clear/tinted) | 0.10/0.04/0.22 | 0.08/0.03/0.24 | 对齐滑杆两端 |
| border | 0.22/0.16/0.35 | 维持 | — |
| 暗环（shadow inset） | 0.10–0.14 | 维持（B 通道精确化为 0.12） | darkened edge |
| refraction→scale 映射 | MAX_SCALE=56 | **按控件短边自适应**：scale ≈ bezelWidth × IOR 系数，上限 45px | 固定 56 与控件尺寸无关，大件过冲 |

> 以上为规格目标值，落地时按真机截图校准（方法：iOS 27 系统控件截图 → 高对比条纹背景 → 量取边缘位移像素/ blur 半径 / 暗环宽度）。

## 6. 决策记录（本文档产出）

1. **iOS 27 为主要开发方向**：`STYLE_PRESETS.ios27` 按本文档 §5 校准；后续默认 `config.style` 切换为 `'ios27'`（代码变更，另行排期——涉及 core 默认值 + playground + 文档三处）。
2. ios26 保留为历史基线风格（不删除）。
3. 着色滑杆语义落在绑定层 prop（intensity+tint 联动），core 不加概念。
4. svg-backend 贴图从线性渐变近似升级为 squircle+Snell 真实位移场（M1 校准任务）。
5. 色差仅 WebGL 路径实现（iOS 27 已弱化该特征，低优先级）。

## 7. 参考资料

- Apple 新闻稿（iOS 27 设计更新，2026-09）：apple.com newsroom "Major updates for Apple's software platforms"
- WWDC26 Platforms State of the Union（Liquid Glass 调优 + 滑杆）：developer.apple.com/videos/play/wwdc2026/112/
- Apple 官网 iOS 27 页（uniform refraction / contrast / slider）：apple.com/os/ios/
- MacRumors "Here's How Liquid Glass Is Changing in iOS 27"（2026-06-10）
- 9to5Mac "iOS 27 beta 5 ultra clear"（2026-08-11）
- kube.io "Liquid Glass in the Browser: Refraction with CSS and SVG"（Snell + squircle + 位移贴图完整推导，本文 §3.1 主要依据）
- html-in-canvas.dev "Liquid Glass Effect in CSS and WebGL"（五层光学要素分解）
- mycatwrotethis.blog "Building Apple's Liquid Glass Effect for Web"（feDisplacementMap scale 解码：负值=放大镜）
