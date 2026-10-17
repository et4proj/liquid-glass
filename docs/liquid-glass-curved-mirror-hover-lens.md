# 曲面镜悬停/按压效果（Curved Mirror Hover Lens）实现方案

> 状态：草案 v0.3 ｜ 对应 iOS 27 Liquid Glass 的指针跟随高光与微形变交互 ｜ 范围：仅 Web 端（不要求兼容 React Native）
>
> 与 `liquid-glass-architecture.md` 的关系：本文档描述的是该架构中 Surface 的一个**子类型**（交互型曲面镜），不是独立的新架构；第 6 节说明它如何接入已有的四层分层。附录 A 收录了本次讨论中涉及整体架构（而非仅曲面镜效果本身）的调整建议，单独成节，便于后续合并进 `liquid-glass-architecture.md`。

---

## 1. 效果描述

### 1.1 这是什么

iOS 27 的 Liquid Glass 控件（按钮、Tab、分段控件）在手指触碰或指针悬停时，表面会像一小块凸起的曲面镜：

- 高光随触点位置移动，而不是固定在某个角落；
- 触点附近的背景内容发生轻微的折射位移，看起来像隔着一块凸透镜在看背后的内容；
- 控件整体有极轻微的"迎向"手指的形变感（更多是光影暗示，而非真实几何形变）；
- 松手或指针离开后，高光和形变以弹性动画归位，而不是直接消失。

### 1.2 四个阶段的行为

| 阶段                        | 触发                                      | 行为                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| idle（静止）                | 无交互                                    | 基础材质层：模糊、着色、边缘描边，无高光跟随                                                                                                                                                                                                                       |
| enter（进入）               | `pointerenter` / `touchstart`             | 高光淡入，形变强度从 0 用弹性曲线升到目标值                                                                                                                                                                                                                        |
| track（跟随）               | `pointermove` / `touchmove`               | 高光位置、折射中心实时跟随指针/触点坐标；离开控件边界时在边缘处"贴边"而不是消失                                                                                                                                                                                    |
| press（按下）               | `pointerdown`                             | 形变强度、折射强度短暂加强（模拟"按压使玻璃更凹陷"），材质轻微加深；参考 `ybouane/liquidglass` 的 `button` 模式，更具体的做法是press 时**压平斜切边缘（降低 `bevelDepth`）、同时加深阴影**，而不是单纯加大形变——"变平"比"变凹"更接近真实按压一块有厚度的玻璃的观感 |
| leave/release（离开或松开） | `pointerleave` / `pointerup` / `touchend` | 所有参数用弹性曲线回到 idle 态；track 态如果是被打断的（比如滚动），要能从任意中间值平滑回弹，不能跳变                                                                                                                                                             |

### 1.3 移动端与桌面端的关键差异

**触屏设备没有真正的 hover。** 这一点必须在设计阶段就明确，否则容易照搬桌面交互：

- 移动端只有 `touchstart → touchmove → touchend`，效果出现在"手指按住并移动"的过程中，而不是"悬停不点击"的过程中；一旦松手，效果立即进入 release 阶段。
- 没有"先 hover 预览、再决定要不要点"的中间态，所以 enter 阶段的动画要足够快（建议 100–150ms 起），否则用户会在动画完成前就已经抬手。
- 支持手写笔或外接鼠标的设备（iPad + 妙控键盘/鼠标）才有真正的 `pointerenter`/`pointermove` 不按下的悬停态，需要用 `pointerType` 区分 `mouse`/`pen` 与 `touch`，分别给出不同的参数集（鼠标态可以做更丰富的"预览型"跟随，触屏态主要体现在按压过程中）。
- 多指同时按压多个控件（比如 Tab 栏）要考虑用 `pointerId` 隔离，每个控件各自维护自己的跟随状态，不能互相干扰。

---

## 2. 参数详解

下面把效果拆成四组参数。每组给出参数名、含义、建议取值范围/默认值，以及它对应影响哪一层实现（对照第 3 节技术方案）。

### 2.1 几何形变参数（曲面感的来源）

| 参数             | 含义                                                                         | 建议范围 | 默认值                          | 影响层 |
| ---------------- | ---------------------------------------------------------------------------- | -------- | ------------------------------- | ------ |
| `deformStrength` | 触点附近表面"凹陷/凸起"的位移量（px 或相对单位）                             | 0–8px    | idle: 0，track: 3px，press: 5px | 几何   |
| `deformRadius`   | 形变影响半径，相对控件短边的比例                                             | 0.4–1.2  | 0.8                             | 几何   |
| `deformFalloff`  | 衰减曲线：`linear` / `quadratic` / `gaussian`                                | —        | `gaussian`                      | 几何   |
| `cornerClamp`    | 形变是否被圆角裁切，防止溢出控件轮廓                                         | boolean  | true                            | 几何   |
| `lensProfile`    | 曲面截面形状：`biconvex`（双凸胶囊，默认）/ `planoConvex`（穹顶/半球放大镜） | —        | `biconvex`                      | 几何   |

`deformFalloff` 推荐用高斯分布：中心形变最强，边缘快速衰减到 0，这样"曲面"的边界才显得柔和而不是生硬的圆形光斑。`lensProfile` 参考 `ybouane/liquidglass` 的 `bevelMode`：`planoConvex` 配合把 `deformRadius` 调到接近控件短边的一半，可以做出放大镜一样的效果，适合"展示级"场景（比如强调单个核心按钮），`biconvex` 更适合常规按钮和 Tab，观感更轻。

### 2.2 折射 / 位移贴图参数

| 参数                  | 含义                                                                                   | 建议范围          | 默认值                       | 影响层 |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | ------ |
| `refractionScale`     | 背景内容被位移的最大像素量，对应 `feDisplacementMap` 的 `scale` 或着色器里的采样偏移量 | 2–20              | idle: 0，track: 8，press: 12 | 折射   |
| `chromaticAberration` | 色散强度：R/G/B 三通道各自的位移差值                                                   | 0–3px             | 0.6px                        | 折射   |
| `bevelDepth`          | 边缘额外的折射强度（模拟玻璃厚度）                                                     | 0–0.3（相对系数） | 0.1                          | 折射   |
| `bevelWidth`          | 边缘折射带的宽度，相对控件尺寸                                                         | 0.05–0.3          | 0.15                         | 折射   |

色散（`chromaticAberration`）是让效果"看起来像真玻璃"而不是"像模糊按钮"的关键细节，即使很小的值（0.5–1px）也有明显的真实感提升,这是很多简化版实现会省略、但视觉差异很大的一项。

### 2.3 高光 / 镜面反射参数

| 参数                | 含义                                                             | 建议范围 | 默认值                          | 影响层 |
| ------------------- | ---------------------------------------------------------------- | -------- | ------------------------------- | ------ |
| `specularPosition`  | 高光中心坐标，跟随指针，归一化到控件局部坐标系 (0–1, 0–1)        | —        | 跟随指针                        | 高光   |
| `specularIntensity` | 高光强度（不透明度或亮度增益）                                   | 0–1      | idle: 0，track: 0.6，press: 0.8 | 高光   |
| `specularRadius`    | 高光光斑半径，相对控件短边                                       | 0.3–0.8  | 0.5                             | 高光   |
| `specularFeather`   | 高光边缘羽化程度                                                 | 0–1      | 0.6                             | 高光   |
| `lightAngle`        | 虚拟光源角度，决定高光形状是否随设备倾斜变化（可选，联动陀螺仪） | 0–360°   | 固定或联动 `deviceorientation`  | 高光   |
| `fresnel`           | 菲涅尔反射强度：视角越趋近掠射角（边缘），反光越强               | 0–1      | 0.3                             | 高光   |

`fresnel` 是我们之前几版参数表里缺的一项——`specularIntensity` 只建模了"跟随指针的一块高光"，而真实玻璃的边缘在任何角度下都会比中心更反光，这是独立于指针位置的效果，`ybouane/liquidglass` 把它作为默认开启的参数（默认值 1.00，权重很高），建议我们也作为常开项而不是仅在 enhanced/showcase 档启用。

### 2.4 材质基础层参数（随 hover/press 联动变化）

| 参数         | 含义                         | idle | track | press                          |
| ------------ | ---------------------------- | ---- | ----- | ------------------------------ |
| `blur`       | 背景模糊半径                 | 16px | 18px  | 14px（按压时玻璃"变薄"的错觉） |
| `saturation` | 背景饱和度增益               | 1.4  | 1.5   | 1.5                            |
| `tint`       | 着色透明度                   | 0.18 | 0.2   | 0.26                           |
| `scale`      | 控件整体缩放（模拟轻微下压） | 1.0  | 1.0   | 0.97                           |

### 2.5 动效参数（决定"手感"）

| 参数              | 含义                               | 建议值                                             |
| ----------------- | ---------------------------------- | -------------------------------------------------- |
| `springStiffness` | 弹簧刚度，指针坐标到渲染坐标的平滑 | 适中偏高，太低会有明显拖尾延迟感                   |
| `springDamping`   | 弹簧阻尼，控制是否有回弹震荡       | 中等阻尼，允许轻微过冲但不来回震荡                 |
| `enterDuration`   | enter 阶段动画时长                 | 100–150ms                                          |
| `leaveDuration`   | leave 阶段动画时长                 | 200–300ms，略慢于 enter，模拟"液体回落"            |
| `easing`          | 非弹簧场景下的缓动函数             | 类似 `cubic-bezier(0.22, 1, 0.36, 1)` 的带回弹曲线 |

**关键原则：指针坐标到渲染参数之间不要用普通的 CSS `transition`，要用弹簧物理（spring）。** 这是"液态感"和"机械跟随感"的主要差异来源——普通 transition 是固定时长的插值，弹簧是基于物理状态的连续响应，在指针快速移动、中途改变方向时表现完全不同,后者才会有"粘稠"的质感。

---

## 3. 技术方案

同一个效果有三种实现路径，复杂度和效果上限依次提高，建议按场景分层使用而不是只选一种。

### 3.1 方案 A：CSS 高光跟随（无真实折射）

**原理**：不做背景像素位移，只做高光跟随和材质层的数值变化。用一个绝对定位的径向渐变层，`transform: translate()` 跟随指针坐标；`backdrop-filter` 的 blur/saturate 数值随阶段切换。

```css
.glass-surface {
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-saturation, 1.4));
  transition:
    backdrop-filter 160ms ease-out,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-surface::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--spec-x, 50%) var(--spec-y, 50%),
    rgba(255, 255, 255, var(--spec-intensity, 0)) 0%,
    rgba(255, 255, 255, 0) var(--spec-radius, 50%)
  );
  transition: opacity 160ms ease-out;
}

.glass-surface:active {
  transform: scale(0.97);
  --glass-blur: 14px;
  --glass-tint: 0.26;
}
```

```ts
function bindPointerTracking(el: HTMLElement, spring: SpringModel) {
  const update = (clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    spring.setTarget(x, y); // 弹簧平滑后再写入 CSS 变量，而不是直接写
  };

  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") update(e.clientX, e.clientY);
  });
  el.addEventListener("pointerenter", (e) => {
    el.style.setProperty("--spec-intensity", "0.6");
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--spec-intensity", "0");
  });
  // 触屏：按住并移动时才触发
  el.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      update(t.clientX, t.clientY);
    },
    { passive: true },
  );
}
```

- **优点**：全平台兼容（含 iOS Safari），性能开销小，弹簧只需要对 2 个数值（x, y）做物理计算。
- **缺点**：没有真实折射，"曲面镜"的感觉主要靠高光和材质数值变化营造，上限有限。
- **适用**：绝大多数按钮、Tab、Switch 等高频交互控件的默认方案。

### 3.2 方案 B：SVG `feDisplacementMap` + `feSpecularLighting`（折射感最强的 Web 方案）

**原理**：

1. 实时生成一张位移贴图（高度场）：以指针位置为中心的径向渐变，中心亮、按 `deformFalloff` 衰减到灰（128 灰度代表 0 位移）。
2. 用 `feImage` 把这张贴图载入滤镜，`feDisplacementMap` 用它对 `backdrop-filter` 采样到的背景做像素位移，`scale` 对应 `refractionScale`。
3. 色散：拆成三份 `feDisplacementMap`（R/G/B 通道用不同 `scale`），再用 `feBlend`/`feComposite` 合成，对应 `chromaticAberration`。
4. 高光：用 `feSpecularLighting` + `fePointLight`，光源的 `x/y` 跟随指针，对应 `specularPosition`。

```html
<svg width="0" height="0" style="position:absolute">
  <filter id="curved-mirror" x="-20%" y="-20%" width="140%" height="140%">
    <!-- 位移贴图：由 JS 动态生成并通过 feImage 载入，href 指向 data URI 或 <canvas> 转的 blob URL -->
    <feImage result="displacementMap" href="" x="0" y="0" width="100%" height="100%" />

    <!-- 背景先做一点模糊，位移在模糊后的背景上更自然 -->
    <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blurred" />

    <!-- R 通道位移（色散） -->
    <feDisplacementMap
      in="blurred"
      in2="displacementMap"
      scale="9"
      xChannelSelector="R"
      yChannelSelector="G"
      result="dispR"
    />
    <feColorMatrix
      in="dispR"
      type="matrix"
      values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
      result="chanR"
    />

    <!-- G 通道位移 -->
    <feDisplacementMap
      in="blurred"
      in2="displacementMap"
      scale="8"
      xChannelSelector="R"
      yChannelSelector="G"
      result="dispG"
    />
    <feColorMatrix
      in="dispG"
      type="matrix"
      values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
      result="chanG"
    />

    <!-- B 通道位移 -->
    <feDisplacementMap
      in="blurred"
      in2="displacementMap"
      scale="7"
      xChannelSelector="R"
      yChannelSelector="G"
      result="dispB"
    />
    <feColorMatrix
      in="dispB"
      type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
      result="chanB"
    />

    <feBlend in="chanR" in2="chanG" mode="screen" result="rg" />
    <feBlend in="rg" in2="chanB" mode="screen" result="refracted" />

    <!-- 镜面高光，光源位置由 JS 实时更新 fePointLight 的 x/y -->
    <feSpecularLighting
      in="displacementMap"
      surfaceScale="3"
      specularConstant="0.8"
      specularExponent="12"
      lighting-color="#ffffff"
      result="specular"
    >
      <fePointLight x="50" y="50" z="60" />
    </feSpecularLighting>
    <feComposite in="specular" in2="refracted" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
  </filter>
</svg>
```

```css
.glass-surface--mirror {
  backdrop-filter: url(#curved-mirror);
}
```

```ts
// 每帧（或节流后）重新生成位移贴图并更新光源位置
function updateDisplacementMap(
  ctx: CanvasRenderingContext2D,
  pointer: { x: number; y: number },
  radius: number,
) {
  const { width, height } = ctx.canvas;
  const grad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
  grad.addColorStop(0, "rgb(255,128,0)"); // 中心：R 通道编码 x 位移，G 通道编码 y 位移，蓝色通道不使用
  grad.addColorStop(1, "rgb(128,128,0)"); // 边缘：无位移（128 为中性值）
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  // 转成 data URI 后设置到 <feImage href="">
}

function updateLight(filterEl: SVGFilterElement, x: number, y: number) {
  const light = filterEl.querySelector("fePointLight");
  light?.setAttribute("x", String(x));
  light?.setAttribute("y", String(y));
}
```

- **优点**：真实像素级折射 + 色散 + 镜面高光，是 Web 上效果最接近原生的方案之一；不需要自己管理背景纹理，`backdrop-filter` 直接拿页面真实内容。
- **缺点**：`backdrop-filter` 配合 SVG 滤镜在 Safari 上的支持一直不稳定，需要在目标 iOS 机型上实测；位移贴图如果每帧用 Canvas 重绘再转 data URI，有一定开销，建议节流到指针移动事件触发时更新，而不是跟渲染帧率绑定；多个控件同时存在时，每个都要有独立的 `<filter>` 和贴图，数量多时需要做节流和复用。
- **适用**：Chromium 环境，或接受 iOS 上自动降级到方案 A 的场景；首屏重点按钮、品牌页的核心交互优先用这个方案。

### 3.3 方案 C：Canvas/WebGL 着色器（效果上限最高）

**原理**：把目标区域的背景绘制为纹理（Canvas 截图或共享 WebGL canvas 里的内容），以指针位置为中心实时计算一个球面法线场（不需要贴图资源，用解析公式：以指针为圆心、`deformRadius` 为半径，在半径内按球面方程算出每个像素的法线方向），在片元着色器里用法线对背景纹理做真正的折射采样偏移，同时叠加色散（对 R/G/B 用略微不同的折射率采样三次）和镜面高光（Blinn-Phong 或简化的 Fresnel 近似）。

```glsl
// 片元着色器核心思路（伪代码简化版）
uniform sampler2D u_background;
uniform vec2 u_pointer;       // 归一化指针坐标
uniform float u_radius;       // deformRadius
uniform float u_refraction;   // refractionScale
uniform float u_chromatic;    // chromaticAberration
uniform vec2 u_lightPos;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float dist = distance(uv, u_pointer);
  float falloff = smoothstep(u_radius, 0.0, dist);     // 高斯近似：越靠近指针越强

  // 球面法线（简化：径向方向 * falloff 强度）
  vec2 normal = normalize(uv - u_pointer) * falloff;

  // 色散：R/G/B 用不同的折射强度采样
  float rChan = texture2D(u_background, uv + normal * u_refraction * (1.0 + u_chromatic)).r;
  float gChan = texture2D(u_background, uv + normal * u_refraction).g;
  float bChan = texture2D(u_background, uv + normal * u_refraction * (1.0 - u_chromatic)).b;

  vec3 color = vec3(rChan, gChan, bChan);

  // 简化镜面高光（Fresnel 近似）
  float spec = pow(falloff, 8.0) * smoothstep(0.0, 1.0, 1.0 - distance(uv, u_lightPos));
  color += vec3(spec);

  gl_FragColor = vec4(color, 1.0);
}
```

- **优点**：不依赖浏览器对"SVG 滤镜作用于 backdrop-filter"的支持，Safari 上也能稳定工作；折射、色散、高光全部逐像素实时计算，细节表现上限最高；可以做更复杂的几何（比如非对称的曲面、随倾斜角变化的法线场）。
- **缺点**：开发成本显著高于方案 A/B；背景需要自己提供纹理，不能像方案 B 那样直接"白嫖"浏览器的 backdrop 采样，这正是此前架构讨论中 `BackdropSource` 抽象要解决的问题；移动端的 GPU 功耗和发热需要实测，不建议大量同屏使用。
- **适用**：首页 hero、品牌强曝光的按钮等数量少、视觉权重极高的场景；不建议用在列表、表单这类高密度场景。

### 3.4 三方案对比

|                   | 方案 A（CSS）                | 方案 B（SVG 滤镜）   | 方案 C（WebGL）          |
| ----------------- | ---------------------------- | -------------------- | ------------------------ |
| 真实折射          | 无                           | 有                   | 有，细节最丰富           |
| 色散              | 无（可用双层渐变模拟近似感） | 有                   | 有                       |
| iOS Safari 稳定性 | 好                           | 需实测，历史上不稳定 | 好（自绘，不依赖该特性） |
| 背景来源          | 不需要                       | 浏览器自动提供       | 需要自行提供纹理         |
| 开发与维护成本    | 低                           | 中                   | 高                       |
| 建议使用密度      | 可大量使用                   | 中等密度，重点控件   | 少量，高权重场景         |

---

## 4. 极致方案：Worker + WASM + WebGPU（追求最高保真度）

不满足于"降级兜底"的效果，而是要把 Web 端能做到的上限推到最高，需要先分清楚两件事：哪部分的天花板由算力决定（可以靠 Worker/WASM/WebGPU 堆上去），哪部分的天花板由浏览器的安全模型决定（堆多少算力都突破不了）。混淆这两者，容易把工程投入放到不会有回报的地方。

### 4.1 一个算力绕不过去的边界

浏览器不允许任何脚本——不管是 JS、WASM 还是 WebGPU——读取"元素背后实际渲染出的页面像素"。方案 B 里 `backdrop-filter` 之所以能看到背景并做模糊，是因为它是**合成器（compositor）的特权操作**，直接在 GPU 合成阶段处理，从不把这些像素交还给页面脚本；这是安全边界，不是性能限制，目的是防止网站窥视跨域 iframe、被遮挡内容等它本不该看到的渲染结果。

也就是说：**只要背景是"页面上已有的任意 DOM 内容"，折射效果的上限就是方案 B（`backdrop-filter` + SVG 滤镜）能做到的那些**，再强的 WebGPU 管线也无法突破这一点,除非使用第 4.5 节讨论的实验性 API。这决定了下面必须分两条赛道。

### 4.2 赛道 A：受控背景——Worker + WebGPU + 真流体模拟

当背景是你自己提供的内容（图片、视频、Canvas/WebGPU 场景）时，上面那个边界不存在，因为背景本来就是你的纹理，不需要"偷看"合成器。这是值得投入顶级技术栈的场景，对应之前架构文档里"受控背景场景"的定位。

**整体管线：把渲染完全搬出主线程。**

```ts
// 主线程：只采集坐标并转发，不做任何渲染
const canvas = document.querySelector(".glass-surface canvas");
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker("glass-renderer.worker.js", { type: "module" });
worker.postMessage({ type: "init", canvas: offscreen }, [offscreen]);

el.addEventListener("pointermove", (e) => {
  // getCoalescedEvents 拿到浏览器实际采样的所有中间点，而不是被节流到一帧一个点
  const events = e.getCoalescedEvents?.() ?? [e];
  worker.postMessage({
    type: "pointer",
    points: events.map((ev) => ({ x: ev.offsetX, y: ev.offsetY, t: ev.timeStamp })),
  });
});
```

```ts
// Worker 内：独立的 WebGPU 设备、独立的渲染循环，主线程卡顿完全不影响它
let device: GPUDevice;
let context: GPUCanvasContext;

self.onmessage = async (e) => {
  if (e.data.type === "init") {
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();
    context = e.data.canvas.getContext("webgpu");
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });
    requestAnimationFrame(renderLoop);
  }
  if (e.data.type === "pointer") {
    fluidSim.injectForce(e.data.points); // 把指针轨迹喂给流体模拟
  }
};
```

`OffscreenCanvas` 的 `transferControlToOffscreen()` 已是 Baseline 特性，Safari 16.4+、Firefox 105+、Chrome 69+ 均支持，Worker 内创建 `webgpu` 上下文也在规范中有明确定义，这条管线在当前目标浏览器上是可落地的，不是纸面方案。

**流体模拟而不是静态位移贴图。** 方案 B 的位移贴图是"径向渐变，中心亮边缘暗"的静态图形，看起来是"凸起"，但不是真正的"液体"。在 WebGPU 的 compute shader 里跑一个 Stable Fluids（Jos Stam 的经典方法：在网格纹理上做速度场的平流-扩散-投影，每帧用指针位置注入力）可以得到真正会"荡漾""回弹""相互影响"的液面，这是静态贴图方案做不到的质感：

```wgsl
// compute shader 伪代码：advect + diffuse + project，经典的 stable fluids 三步
@compute @workgroup_size(8, 8)
fn simulate(@builtin(global_invocation_id) id: vec3<u32>) {
  let velocity = sampleVelocity(id.xy);
  let advected = advect(velocityField, velocity, dt);
  let diffused = diffuse(advected, viscosity);
  let projected = project(diffused); // 去除散度，保证不可压缩，这是"液体感"的关键
  textureStore(velocityFieldOut, id.xy, projected);
}
```

模拟结果（一张高度场/法线场纹理）直接喂给片元着色器做折射采样偏移 + 色散 + 镜面高光，复用方案 C 的着色思路，只是折射源从"手写的球面公式"换成了"真实模拟出来的液面"。

**WASM 在这条赛道里的角色**，不是替代 WebGPU，而是补 WebGPU 不擅长的部分：

- **CPU 端兜底渲染器**：用 Rust 写一套同样逻辑的 CPU 流体模拟（WASM SIMD 加速），给极少数不支持 WebGPU 又不愿意完全降级的设备用；现在 WebGPU 覆盖率已经不低（见 4.3），这一层优先级不高，除非你有强烈的"不降级"诉求。
- **复杂几何/状态管理**：比如多个玻璃控件靠近时的"融合"判定（Metaball 风格的等值面合并）、squircle 圆角的精确数学（iOS 用的不是普通 border-radius，是超椭圆），这类计算密集但不天然并行的逻辑，WASM 比 JS 快，又不需要上 GPU。
- **真正的多线程**：WASM 的 `SharedArrayBuffer` + `Atomics` 可以让 CPU 端的物理计算并行，但这需要页面开启跨源隔离头（见 4.6）。

### 4.3 WebGPU 当前的可用性

这条赛道的前提是目标浏览器支持 WebGPU 且带 compute shader。截至 2025 年 11 月，WebGPU 已在 Chrome、Edge、Firefox（Windows 及 Apple Silicon Mac）、Safari 默认开启；Safari 从 26.0 起在 macOS Tahoe、iOS 26、iPadOS 26、visionOS 26 上支持，包含 compute shader。也就是说，只要目标用户是 iOS 26/27 设备（这正是你液态玻璃效果的目标人群），WebGPU 管线是可用的；iOS 25 及更早版本的 Safari 不带 WebGPU，需要回落到方案 A/B。建议用一个支持双路径的渲染库（比如 three.js 的 `WebGPURenderer`，内置在 WebGPU 不可用时自动回落到 WebGL2），避免自己维护两套着色器。

### 4.4 赛道 B：任意 DOM 背景——把浏览器允许的能力榨干

既然不能突破合成器边界，这条赛道的"极致"不是堆算力，而是把浏览器原生合成能力用到极限，同时把一切能搬出主线程的东西搬出去：

- **位移贴图不要用 Canvas 每帧重绘再转 data URI。** 这是很多现有实现（包括此前调研的几个开源库）的主要性能瓶颈——`toDataURL` 是同步的，且每次都要重新编码。更好的做法是直接操作 SVG 原生的 `<radialGradient>`，用 `setAttribute` 更新 `cx`/`cy`/`r`，让浏览器自己在滤镜管线里栅格化，不经过 JS 这一层的图像编码。
- **用 CSS Houdini 的 Paint Worklet 画高光层。** `registerPaint` 注册的绘制逻辑运行在独立的 paint worklet 线程，天然不占主线程，配合 CSS Properties and Values API（`@property`）把指针坐标声明成可动画的自定义属性。这部分浏览器支持和在液态玻璃场景下的实际表现需要你实测，目前没有现成案例验证过。
- **强制元素提升为独立合成层**：`will-change: filter, transform` 或 `transform: translateZ(0)`，避免 `backdrop-filter` 触发整个父级的重绘，这是最基础但常被忽略的一项。
- **节流而不是每帧更新位移贴图**：指针移动用 `requestAnimationFrame` 合并，但贴图本身的更新频率可以低于渲染帧率（比如贴图 30Hz 更新，配合 CSS transition 做插值），肉眼很难分辨差异，但能省一半的重绘开销。

这条赛道投入 WebGPU/WASM 的性价比不高，因为瓶颈不在计算能力，而在"能不能拿到背景像素"这个权限问题上。

**第三种背景获取方式：DOM 光栅化快照，不依赖 `backdrop-filter`。** 调研到的两个开源库(`naughtyduk/liquidGL`、`ybouane/liquidglass`)都没有用 `backdrop-filter` + SVG 这条路，而是用 `html-to-image` 这类库把背景 DOM 子树重新序列化成 SVG `foreignObject`、包成 data URI 图片，再用浏览器自己的解码器重新光栅化成一张纹理。这条路不依赖 `backdrop-filter`，所以完全绕开了方案 B 在 Safari 上的那个稳定性风险，折射本身可以用普通的 WebGL/WebGPU 着色器去做，不受"SVG 滤镜能否作用于 backdrop-filter"这个前提限制。代价是：

- 这是"重新渲染一份克隆"而不是"读取真实合成结果"，复杂场景（自定义字体加载时机、部分伪元素、跨 iframe 内容）可能和真实渲染有细微差异，这是 `html2canvas`/`dom-to-image` 这类技术的通病；
- 静态内容只需要光栅化一次并缓存，但任何之后发生的视觉变化都需要显式感知——`<video>` 可以直接逐帧 `drawImage` 自动处理，其余动态内容（CSS 动画、JS 改的 `canvas`/`img.src`）需要显式标记或调用方法触发重新光栅化，天然做不到"自动感知任意变化"；
- 跨域图片和 Web 字体必须有正确的 CORS 响应头，否则纹理会被污染或直接失败。

**是否要重新光栅化，建议做成按需的脏区判断，而不是定时轮询。** `ybouane/liquidglass` 的实现值得参考：静态内容缓存一次，`<video>`/显式标记的元素视为"永远脏"，其余变化通过监听 DOM 变更、布局变化等自动检测，检测不到的情况（比如直接操作 canvas 像素、换 `img.src`）则提供一个 `markChanged(element)` 方法，内部按"采样矩形是否与该元素相交"来判断哪些玻璃面板需要重新渲染，不相交的面板直接跳过渲染管线——页面上没有动态内容时，渲染循环几乎不做任何工作。这个"按 Surface 做脏区判断、只重绘真正变化的面板"的机制，比单纯"节流更新频率"更彻底，值得作为 Backend 接口的一部分（见附录 A.6）。

### 4.5 HTML-in-Canvas：能否用来突破 4.1 的边界？

**结论：值得作为隔离的实验性增强去探索，但目前不能作为产品能力依赖，原因如下。**

HTML-in-Canvas（WICG 提案）提供 `drawElementImage`（2D）、`texElementImage2D`（WebGL）、`copyElementImageToTexture`（WebGPU）三个新原语，可以把真实的 DOM 子树渲染进 canvas 或 GPU 纹理——如果这个 API 成熟，`copyElementImageToTexture` 几乎是为你的场景量身定做的：直接把任意 DOM 背景拷进 WebGPU 纹理，4.1 节的边界、4.2 节"需要自己提供背景纹理"的限制都会被解决。但现状是：

- **仅 Chrome 以 Origin Trial 形式提供**，当前这轮试用在 Chrome 148–154 开放，截至发稿排期到 Chrome 155（2026 年 10 月）前结束，也就是**试用窗口即将到期**，是否续期或转正尚不确定。不注册 Origin Trial 的站点需要用户手动开启 `chrome://flags/#canvas-draw-element` 才能用，不可能用于面向普通用户的生产环境。
- **Firefox（Gecko）给出的是负面（Negative）立场**，主要顾虑是该 API 会暴露渐变、表单控件等内容的像素信息，带来指纹识别和跨源信息泄露的风险；Mozilla 没有反对它推进到规范的第二阶段，但明确表示不认可当前的 API 设计。
- **Safari（WebKit）目前是"无信号"（No Signal）**，既没有承诺实现，也没有明确反对。

三方对齐基本等于"至少几年内不会成为跨浏览器可用的标准"。考虑到你的目标用户大量在 iOS Safari 上，这个 API 在可预见的时间里无法覆盖你的主战场。

**建议的处理方式**：

- 把它当成一个完全可选、默认关闭、通过能力探测开启的"实验后端"（比如 `Probe.capabilities.htmlInCanvas`），任何业务逻辑都不能假设它存在。
- 可以在内部 Demo 或公司内网的 Chrome 环境下做技术预研，验证 `copyElementImageToTexture` 配合流体模拟的效果上限，作为未来路线的技术储备，但不进入当前的产品路线图。
- 持续关注 Origin Trial 是否续期、Firefox 立场是否松动——如果 Safari 后续给出正面信号，情况会发生实质变化，值得定期复查而不是现在下结论"不可行"。

### 4.6 COOP/COEP 部署约束

`SharedArrayBuffer`（WASM 多线程、部分高性能 Worker 通信模式需要）要求页面发送 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` 这两个响应头。这两个头会让页面上所有跨域资源（第三方统计脚本、广告、某些 CDN 资源、无 CORS 头的图片）默认被拦截，除非它们也配合返回正确的头——这对"接入已有存量项目、业务代码零改动"的定位是个潜在冲突点。

不需要 `SharedArrayBuffer` 的部分（单线程 WASM、WebGPU 本身）没有这个限制，只有当你确实要用 WASM 多线程做 CPU 端并行（4.2 节提到的兜底渲染器）时才会碰到。建议把这个能力做成客户显式开启的高级选项，并在交付文档里写清楚部署前提，而不是默认行为。

---

## 5. 推荐的档位策略

承接 §2.5 的"弹簧而非 transition"原则，四个方案在档位选择上建议：

1. **baseline（默认）**：方案 A，所有控件、所有平台的兜底。
2. **enhanced（增强，按能力探测开启）**：方案 B，仅在探测到 Chromium 内核、且验证过 `backdrop-filter` 能正确应用 SVG 滤镜时启用;iOS 上默认不开启，除非后续实测通过。
3. **showcase（展示级，受控背景，显式指定）**：方案 C 的手写着色器，或 §4.2 的 Worker + WebGPU 流体模拟版本——后者效果更高但开发成本也更高，可以先上线方案 C 的简化版，再按需升级到流体模拟。
4. **experimental（实验级，默认关闭）**：§4.5 的 HTML-in-Canvas 后端，仅限内部验证或 Chrome 专属场景，不作为产品承诺。

四档共享同一套参数定义（第 2 节），只是渲染后端不同——这正是"效果参数与渲染后端解耦"的意义所在：产品或设计师调整 `refractionScale`、`specularIntensity` 这些数值时，各后端都能响应，不需要为每个后端单独调参。

---

## 6. 在现有移动端组件库适配架构上扩展的可能性

结论：**可行，而且这个效果正好是此前架构里专门为它预留了接口的那类场景**——不需要推翻分层，但需要在几处做针对性扩展。逐项说明：

### 6.1 Surface 声明需要扩展交互子类型

此前定义的 `SurfaceDeclaration` 已经有 `interactive: boolean` 字段，但只是一个开关,曲面镜效果需要更细的声明，建议扩展为：

```ts
export interface SurfaceDeclaration {
  // ...原有字段
  interactive?: boolean | InteractiveSpec;
}

export interface InteractiveSpec {
  pointerTracking: boolean; // 是否需要指针/触点坐标跟随
  deform?: Partial<DeformParams>; // 2.1 节参数
  refraction?: Partial<RefractionParams>; // 2.2 节参数
  specular?: Partial<SpecularParams>; // 2.3 节参数
  motion?: Partial<MotionParams>; // 2.5 节参数
  tier?: "baseline" | "enhanced" | "showcase"; // 对应 §4 的档位，可单独覆盖该控件的档位
}
```

这与之前文档里"材质 token 是公共契约"的原则一致：这里新增的也是一组 token（`--glass-deform-*`、`--glass-refraction-*`、`--glass-specular-*`），适配层和业务 CSS 都可以读写,不需要为这个效果单独设计一套配置体系。

### 6.2 渲染后端：新增 pointer-tracking 能力位，而不是新建后端类型

现有的 `css` / `svg` / `webgl` / `native` 几个后端刚好对应本文档的方案 A / B / C（原生桥接对应 iOS 系统的真实渲染）；`webgl` 后端按附录 A 的建议升级为 `webgpu` 后端后同样适用。不需要为曲面镜效果新增后端类型，但每个后端要新增"是否支持指针跟随"这个能力位，并在 `BackendInstance` 接口上增加一个方法：

```ts
export interface BackendInstance {
  update(plan: RenderPlan): void;
  pause(): void;
  resume(): void;
  unmount(): void;
  trackPointer?(point: { x: number; y: number } | null): void; // 新增：null 表示指针离开
}
```

`trackPointer` 内部自己做弹簧平滑（§2.5），上层只需要高频地把原始坐标传进来，不需要关心平滑逻辑——这样指针事件的节流、RAF 调度可以统一在核心层做一次，而不是每个后端各写一套。

### 6.3 Probe 需要新增能力探测项

```ts
export interface Capabilities {
  // ...原有字段
  pointerFine: boolean; // 是否有精确指针设备（鼠标/触控笔），对应 (pointer: fine) 媒体查询
  backdropFilterWithSvg: boolean; // 已有字段，决定方案 B 是否可用
  webgpu: boolean; // 决定 §4.2 的受控背景流体模拟管线是否可用
  gpuTier?: "low" | "mid" | "high"; // 决定方案 C/showcase 档是否默认开启，可复用已有的 device.tier
  htmlInCanvas?: boolean; // §4.5 的实验级能力，默认 false，需要显式检测 Origin Trial 或 flag 是否生效
}
```

`pointerFine` 直接决定是否启用"鼠标态的预览型跟随"（§1.3 提到的桌面/iPad 外设场景），触屏设备即使 `pointerFine` 为 false，也仍然需要在 `touchmove` 过程中跟随，只是语义上对应 track 态而非"预览"。

### 6.4 适配层：增强组件的自然归属

§1.3 提到的 touch/mouse 行为差异、多指隔离（`pointerId`），属于此前架构文档 §7.6 里定义的"增强组件"范畴——这类交互逻辑没法靠改 CSS 变量实现，需要真正的代码，而且正好是"效果质量"这个核心竞争力最集中的地方。具体到某个组件库（比如 Vant 的 TabBar、Switch），适配包要做的是：

1. 在对应组件上挂载 `trackPointer` 的事件绑定（pointerdown/move/up + touchstart/move/end 的归一化处理）；
2. 把组件原本的 DOM 结构作为"宿主"，曲面镜效果作为叠加层，不改变组件内部结构（延续此前"只加属性和类名，不改 DOM 结构"的原则）；
3. 针对该组件的默认参数做一版预设（比如 Tab 的 `deformRadius` 应该比大按钮小、Switch 的 `pointerTracking` 范围应限制在滑块本身而不是整个轨道）。

### 6.5 真正的新增工作量在哪里

分层本身不需要改,需要新增的主要是：

- 核心层的"指针/触点坐标 → 弹簧平滑 → 下发给后端"这条通路（新增，量不大，是通用逻辑，所有后端共享）；
- 方案 B 的位移贴图实时生成与节流逻辑（放在 `glass-web` 包里，作为 SVG 后端的一部分）；
- 方案 C / §4.2 流体模拟的着色器和 Worker 管线（对应路线图里优先级较低的阶段，§4.2 的完整版本成本显著高于方案 C 的简化版）；
- 每个适配包针对自己组件库的默认参数预设和事件绑定（工作量会随适配的组件库数量线性增加，这也是为什么此前建议先在一个库上打磨清楚，再横向复制）。

### 6.6 与原路线图的衔接建议

原路线图里 M1（CSS 皮肤 + Vite 插件 + 一个适配包 + 一个增强件）已经包含"胶囊 TabBar 的选中气泡"这个增强件,建议把**方案 A 的曲面镜跟随**也并入 M1，因为它同样是方案 A（CSS 档），成本低、全平台兼容，而且是验收标准（对照架构文档 §11）里最容易被客户和用户直观感知到的细节。方案 B 放在 SVG 折射后端阶段，方案 C 的简化版和 §4.2 的完整流体模拟放在更后面的阶段，§4.5 的 HTML-in-Canvas 不进入路线图，只作为技术储备。

---

## 7. 待验证事项

- `backdrop-filter` 配合 SVG 滤镜在不同 iOS 版本 Safari 上的实际表现（历史上不稳定，需要在 iOS 27 的真机上重新验证，不能完全沿用旧版本的测试结论）。
- 位移贴图实时生成（Canvas 转 data URI）在中低端 Android 设备上的帧开销，决定方案 B 的节流策略和是否需要降级。
- 多指同时操作（比如快速划过多个 Tab）时，`pointerId` 隔离方案在真实触屏设备上的手感是否自然。
- 方案 C / §4.2 流体模拟的功耗和发热，决定是否真的只限制在"展示级"场景，还是可以适度放宽。
- §4.2 的 Worker + WebGPU 流体模拟在中低端 Android 设备（WebGPU 覆盖率、实际算力）上的表现，决定这条赛道是否需要进一步的降级子档位。
- HTML-in-Canvas 的 Origin Trial 续期情况、Firefox/Safari 立场是否变化，建议按季度复查而不是一次性下结论。
- COOP/COEP 对客户现有第三方脚本（统计、广告、客服组件等）的实际影响范围，需要在真实存量项目上试点评估，而不是假设"开启就行"。

## 8. 增量预研（2026-10-17）：滚动混合背景切换 + 三方源码调研

### 8.1 三方实现源码级调研（补强 A.7 结论）

- **naughtyduk/liquidGL v3**：每实例一块 fixed 视口 canvas，全局 renderer Set + rAF 统一驱动，`gl.viewport()` 在共享 canvas 上切分各玻璃区域。v3 已弃 html-to-image，改自研 Canvas 2D 光栅化器（`paintChunked` 每帧 8ms 预算分块）。**滚动零重捕获**：整页快照一次上传大纹理，滚动只改采样偏移（scrollY + visualViewport overscroll 补偿），滚动期挂起重捕获。video 自动检测免注册：每帧抓帧 → 局部合成 → `texSubImage2D` 局部上传；动态元素 250ms 节流 + `requestIdleCallback` 局部重光栅化。
- **ybouane/liquidglass v1.0.3**：每实例独立 WebGL 上下文（浏览器约 16 个上限）。脏区三层：`markChanged` 队列 → 下帧 AABB 相交扇出（元素矩形 vs 各玻璃采样矩形）→ 只重渲染命中者；且感知绘制顺序（先画者不读后画者，只标"画在变更元素之后"的玻璃）。video/canvas 直接子元素走 `drawImage` 快路径（跳过 DOM 光栅化）；每帧成本主要在采样区 `texImage2D` 全量上传。直接子元素限制成因：玻璃输出 canvas 注入玻璃元素内部，嵌套会被外层捕获导致二次折射。
- **@zeroqs/liquid-toggle v0.4.0**：单 quad 单 pass；胶囊 SDF 中心差分求法线；强度 = 边缘最强、bezel 内二次衰减；圆弧区 cornerBoost 增强；**乘性色散**（disp × (1±aberration) 三次采样）；rim = 径向法线点光 × 边缘 smoothstep。**关键限制：不采样任意 DOM——背景是组件自绘 track（手工重绘到离屏 canvas）**，即实时折射的前提是"背景像素自持"。
- **html-to-image**：clone + computed style 拷贝 + 字体/图片 base64 内联 + SVG foreignObject 光栅化。限制：::marker 等伪元素、无 CORS 跨域图、跨域 CSS 字体、Shadow DOM 均不支持；toPng 主线程同步阻塞。**结论：只能当"变化时重拍"的低频快照源，不可逐帧**。

### 8.2 滚动中背景切换（DOM ↔ canvas/video）的设计框架

同一个玻璃表面在滚动中背后内容类型会动态变化，而背景类型决定可用的像素路径，因此渲染路径必须**三模式分层 + 运行时切换**：

| 背景类型              | 像素可获得性              | 渲染路径                                       | 滚动成本                  |
| --------------------- | ------------------------- | ---------------------------------------------- | ------------------------- |
| 任意 DOM              | 合成器私有，脚本不可读    | 合成器模式：backdrop-filter + SVG 滤镜（§3.2） | 免费（合成器线程）        |
| 图片 / video / canvas | TexImageSource 可直接采样 | 纹理模式：WebGL 透镜采样（§3.3 / §4.2 赛道 A） | 快照零重传 / dynamic 逐帧 |
| 低频变化 DOM          | html-to-image 快照        | 纹理模式 + 脏区节流重拍（A.6）                 | 重拍贵但低频              |

切换平滑的关键机制（后续 webgpu 后端的设计输入）：

1. **切换判定借 ybouane 的 AABB 相交扇出**：玻璃采样矩形 ∩ 受控背景元素矩形覆盖率，高阈值升级纹理模式 / 低阈值降级回合成器模式，中间带滞回（hysteresis）防边界抖动；过渡期双模强度交叉淡化。
2. **滚动性能借 liquidGL 的"快照 + 采样偏移"**：纹理模式下背景纹理一次上传，滚动只改 shader 采样 offset uniform；滚动中 texImage2D 挂起，停稳后再重捕获/升级——降级方向立即切（性能保护），升级方向等滚动 idle。
3. **Safari/非 Chromium 的 DOM 背景天然只有合成器模式**（blur 无折射），video/canvas 背景仍可走纹理模式——降级叙事完整，无断崖。

### 8.3 playground 已落地验证

- 整面放大镜：`bezelWidth` 语义放宽至 0..1（0.18 校准窄带 → 1.0 整面凸透镜），效果画廊滑杆实时验证形态谱系（仅注释放宽，ios27 校准值不变）。
- WebGL 透镜预研 demo（playground `lens/lens-renderer.ts`）：liquid-toggle 同款管线改整面 squircle 凸面；图片 / video（captureStream）/ 动画 canvas 三源交叉淡化切换；滚轮 = 采样偏移 uniform（快照零重传）；色散 + rim light 均按 refraction token 参数化。为 webgpu 后端（A.2，M2）储备了可运行参考实现。

---

## 附录 A：架构层调整建议（供后续合并入 liquid-glass-architecture.md）

本节内容不是曲面镜效果本身的实现细节，而是这次讨论中涉及**整体架构**的调整建议，单独成节是为了方便你之后在编辑器里把它们融合进 `liquid-glass-architecture.md` 对应的章节，而不必在那份文档里逐处翻找改动点。

### A.1 范围调整：不再要求兼容 React Native

此前架构文档的路线图里包含原生桥接档（对应 `glass-bridge` 包，面向 iOS 26+ 混合应用场景）。现在的决定是只做 Web 端，建议：

- 从主路线图中移除 `glass-bridge` 包和对应的"原生桥接档"里程碑；
- 在架构文档里把这部分降级为"未来可能扩展"的附录内容，而不是直接删除——调研阶段已经确认 `@callstack/liquid-glass`、`expo-glass-effect` 等现成方案可以覆盖这个场景，真要做的时候不需要从零设计。

### A.2 `webgl` 后端建议升级为 `webgpu` 后端

原因见本文档 §4.3：WebGPU 已经覆盖了目标用户所在的主要平台（iOS 26/27 Safari、Chromium 系、Firefox），且自带 compute shader，能支持 §4.2 的真流体模拟，这是原来的 WebGL 方案做不到的。建议：

- 架构文档里凡是提到 `webgl` 后端/档位的地方（包级结构、降级矩阵、路线图），统一替换为 `webgpu`，内部用支持双路径回落的渲染库（如 three.js 的 `WebGPURenderer`）保留对纯 WebGL2 设备的兼容，不需要自己维护两套着色器代码。
- Probe 的 `Capabilities` 接口里把能力位也从"是否支持 WebGL2"调整为"是否支持 WebGPU（含 compute shader）"，并保留 WebGL2 作为该后端内部的回落检测，而不是暴露成独立的能力位。

### A.3 Backend 默认运行在 Worker 里，应写进接口约定

本文档 §4.2 展示的 `OffscreenCanvas` + Worker 管线，建议作为 `webgpu` 后端（以及未来任何重后端）的默认实现方式，而不是可选优化。建议在架构文档的 Backend 接口说明里补一句明确的约定：**凡是涉及 GPU 渲染的后端，`mount` 阶段应当把 canvas 控制权转移到 Worker，在 Worker 内持有渲染状态**；主线程只负责指针事件采集与转发（可以用 `PointerEvent.getCoalescedEvents()` 提高采样精度）。这样可以保证：无论主线程被业务代码的重渲染、长任务阻塞多久，玻璃效果本身的渲染都不受影响，反过来也一样——重计算不会拖慢业务交互。

### A.4 新增部署约束：COOP/COEP

架构文档此前的"风险"章节里没有提到跨源隔离头这个约束。建议补充一条：当客户项目需要开启 WASM 多线程（`SharedArrayBuffer`）时，必须要求客户的页面发送 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`，这会影响页面上所有未正确配置 CORS/CORP 头的第三方资源（统计脚本、广告、部分 CDN）。这应该是一个客户显式确认的高级选项，而不是默认行为，和"低侵入接入存量项目"的产品定位直接相关，建议在交付清单和 `glass doctor` 诊断工具里都加上这一项检测。

### A.5 新增可选能力：HTML-in-Canvas（实验级，默认关闭）

详见本文档 §4.5。建议在架构文档的 Probe 接口和降级矩阵里新增一个 `experimental` 档位（或在 `webgpu` 档之上再加一档），默认关闭，仅在显式开启且检测到 Chrome 的 Origin Trial 或 flag 生效时启用。不建议现阶段把它写进任何客户交付的路线图承诺里，更适合作为内部技术储备，定期复查其标准化进展（Origin Trial 续期情况、Firefox/Safari 立场变化）。

### A.6 Backend 接口需要补一个"脏区判断"方法，不只是节流

此前的 `BackendInstance` 接口只有 `update`/`pause`/`resume`/`unmount`，隐含假设是"有变化就调 update"，顶多在调用方做节流。调研 `ybouane/liquidglass` 后发现它的做法更彻底：静态内容只渲染一次并缓存，之后的渲染循环会跳过没有变化的面板，整体效果是"没有动态内容的页面，渲染循环几乎不做事"，而不是"降低更新频率但始终在跑"。建议把这个概念补进 Backend 接口：

```ts
export interface BackendInstance {
  update(plan: RenderPlan): void;
  pause(): void;
  resume(): void;
  unmount(): void;
  trackPointer?(point: { x: number; y: number } | null): void;
  /** 显式标记某个背景区域已变化，需要下次渲染时重新捕获/重绘；
   *  不调用则后端可以假设背景未变，直接复用缓存结果。
   *  核心层可以在检测不到的场景（如业务代码直接操作 canvas 像素、换 img.src）下，
   *  提供给适配层或业务代码调用。 */
  markDirty?(region?: DOMRect): void;
}
```

这个方法对哪些后端有意义需要区分着说：CSS 档（方案 A）和原生档本身就是声明式的，背景由浏览器持续合成，不存在"要不要重新捕获背景"这个问题，`markDirty` 对它们是空操作；SVG 档（方案 B）同样依赖 `backdrop-filter` 实时合成，背景部分也不需要这个机制，但位移贴图的重新生成仍然可以按同样的思路做节流；`markDirty` 真正有价值的地方，是采用"DOM 光栅化快照"（本文档 §4.4 新增的第三种背景获取方式）或 §4.2 受控背景场景的后端——这两种情况下背景不是浏览器持续合成的，而是某一时刻的"快照"或"自行渲染的纹理"，需要知道什么时候该重新生成。

### A.7 两个参考实现的架构取舍，决定我们该学哪个

调研到的 `naughtyduk/liquidGL` 和 `ybouane/liquidglass` 在几个关键设计上走了不同路线，而这几个设计点正好对应我们架构文档里已经做过的决策，可以互相印证或提醒风险：

| 设计点                  | naughtyduk/liquidGL                       | ybouane/liquidglass                                                 | 对我们的启示                                                                                                                                            |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多实例渲染资源          | 全局共享一个 canvas，实测 30 个实例无压力 | 每个 root 一个独立 WebGL 上下文，浏览器通常限制并发上下文数约 16 个 | 印证架构文档里"共享单个 canvas 绘制所有玻璃块"这条原则是对的；如果要借鉴这两个库的实现，优先学 naughtyduk 的共享资源模式，避免重蹈 ybouane 这个上限问题 |
| 玻璃元素的 DOM 结构要求 | 任意匹配选择器的元素即可，无结构限制      | 必须是某个 root 的**直接子元素**，嵌套会被拒绝                      | 我们的目标是适配 Vant/antd-mobile 这类深层嵌套的组件库内部结构，ybouane 这种强结构约束不适合直接采用，这一点在评估是否直接用它做参考实现时要特别注意    |
| 动态内容感知粒度        | 需要显式 `registerDynamic` 注册，较粗     | 自动监听 DOM 变更 + 相交判定的 `markChanged`，较细（见 A.6）        | 这部分值得学 ybouane，已体现在 A.6 的接口设计里                                                                                                         |
| 背景捕获方式            | 自建光栅化器（html-to-image 同类技术）    | 同上，明确用 `html-to-image`                                        | 两者都不依赖 `backdrop-filter`，说明这条路线在业界已有两个独立实现验证过可行，值得作为 §4.4 "任意 DOM 背景"赛道的正式选项之一，而不只是理论设想         |

结论：如果后续要做技术选型，架构层面（共享资源、DOM 结构兼容性）更接近 naughtyduk 的设计，但渲染细节和脏区判断的精细度应该参考 ybouane；两个库都不是可以直接拿来"装进"组件库适配层的现成方案（前者的具体折射效果打磨程度、后者的结构限制都是障碍），更适合当作实现自己的 `webgpu` 后端时的参考代码,而不是直接依赖。
