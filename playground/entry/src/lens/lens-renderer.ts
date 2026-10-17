/**
 * WebGL 整面凸透镜渲染器（playground 预研 demo，非正式 webgl-backend）。
 *
 * 光学管线参考 @zeroqs/liquid-toggle（位移场 → 乘性色散 → rim light），
 * 曲面高度场与 svg-backend 的 displacementCurve 同一物理（squircle 凸面 + 边缘陡/中心平），
 * bezel ∈ (0,1]：1.0 = 整面凸透镜（放大镜形态）。
 *
 * 三种受控背景源（image / video / canvas）作为 TexImageSource 直接采样——
 * 这是 backdrop-filter（合成器特权）之外的自采样路径，全浏览器可用：
 * - static 源（图片）：纹理只在替换时上传一次，滚动 = 采样偏移 uniform
 *   （快照零重传，liquidGL"滚动零重捕获"同思路）
 * - dynamic 源（video / 动画 canvas）：每帧 texImage2D，滚动同样只动 uniform
 * 源切换 = 双纹理槽交叉淡化（blend 0→1 动画），不闪变。
 */

export interface LensParams {
  /** 最大位移 px（liquid-toggle strength 同语义；tab 件 7px，展示卡可拉满） */
  strength: number;
  /** 折射带占半径比例 0.05..1（1 = 整面凸透镜） */
  bezel: number;
  /** 色散：R 采样 ×(1+a) / B ×(1-a)（ios27 校准 0.08） */
  aberration: number;
  /** rim light 强度 0..1（0 关闭） */
  rim: number;
  /** rim 光源方向角 rad（tab-interaction-spec §2.1 默认 π/3） */
  lightAngle: number;
}

export interface LensSource {
  image: TexImageSource;
  /** dynamic = 每帧 texImage2D 重新上传（video / 动画 canvas） */
  dynamic: boolean;
}

export interface LensHandle {
  setSource(src: LensSource | null): void;
  setParams(patch: Partial<LensParams>): void;
  /** 背景采样偏移（px，DOM 方向：y 向下 = 内容上滚） */
  setScroll(x: number, y: number): void;
  start(): void;
  dispose(): void;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;         // canvas 像素（GL 坐标系，y 向上）
uniform sampler2D uTexA;   // 当前源
uniform sampler2D uTexB;   // 旧源（仅交叉淡化期间使用）
uniform float uBlend;     // 0 = 旧源, 1 = 当前源
uniform vec2 uScroll;      // 背景采样偏移（DOM 方向 px，y 向下 = 内容上滚）
uniform vec2 uLens;        // 透镜中心（GL 坐标 px）
uniform float uLensR;      // 透镜半径 px
uniform float uStrength;
uniform float uBezel;
uniform float uAberration;
uniform float uRim;
uniform vec2 uLight;       // rim 光源方向（单位向量，DOM 方向）

// GL frag → 背景 uv：flipY + 滚动偏移（滚动作用于采样窗口，纹理不重传）
vec2 bgUv(vec2 frag) {
  vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
  uv += vec2(uScroll.x / uRes.x, -uScroll.y / uRes.y);
  return clamp(uv, vec2(0.0), vec2(1.0));
}
vec3 bg(vec2 frag) {
  return mix(texture2D(uTexB, bgUv(frag)).rgb, texture2D(uTexA, bgUv(frag)).rgb, uBlend);
}
// squircle 凸面高度：d 距边缘归一化 → 玻璃厚度（与 svg-backend squircleHeight 同族）
float prof(float d) {
  float x = clamp(d / uBezel, 0.0, 1.0);
  return pow(1.0 - pow(1.0 - x, 4.0), 0.25);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 dom = vec2(frag.x, uRes.y - frag.y);        // DOM 坐标（y 向下）
  vec2 p = (dom - vec2(uLens.x, uRes.y - uLens.y)) / uLensR;
  float r = length(p);
  vec3 col = bg(frag);
  if (r < 1.0) {
    // 高度径向梯度：中心平（顶点位移 0）、边缘陡（clamp 8 与 displacementCurve 一致）
    float e = 1.5 / uLensR;
    float grad = (prof((1.0 - r) + e) - prof((1.0 - r) - e)) / (2.0 * e);
    float m = clamp(grad, 0.0, 8.0);
    // 向心位移（DOM 空间）→ 采样点向中心收缩 → 中心内容放大（与 svg-backend 贴图 dx=-u/r*mag 同向）
    vec2 dispDom = (r > 1e-4 ? -p / r : vec2(0.0)) * m * uStrength;
    vec2 disp = vec2(dispDom.x, -dispDom.y);        // 转 GL 空间供 bg 采样
    vec3 lens;
    lens.r = bg(frag + disp * (1.0 + uAberration)).r;
    lens.g = bg(frag + disp).g;
    lens.b = bg(frag + disp * (1.0 - uAberration)).b;
    // rim light：径向法线点光，仅边缘带可见（liquid-toggle rim 公式简化版）
    vec2 n2 = r > 1e-4 ? p / r : vec2(0.0);
    float rimBand = smoothstep(0.72, 0.98, r);
    float spec = pow(max(dot(n2, uLight), 0.0), 1.5) * rimBand * uRim;
    lens += vec3(spec);
    // 透镜边缘抗锯齿（smoothstep 要求 edge0 < edge1）
    float aa = 1.0 - smoothstep(0.985, 1.0, r);
    col = mix(col, lens, aa);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_PARAMS: LensParams = {
  strength: 34,
  bezel: 1.0,
  aberration: 0.08,
  rim: 0.5,
  lightAngle: Math.PI / 3,
};

export function createLensRenderer(canvas: HTMLCanvasElement): LensHandle | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("[lens] shader compile:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[lens] link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // 全屏大三角（3 顶点覆盖）
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uni = (name: string) => gl.getUniformLocation(prog, name);
  const U = {
    res: uni("uRes"),
    texA: uni("uTexA"),
    texB: uni("uTexB"),
    blend: uni("uBlend"),
    scroll: uni("uScroll"),
    lens: uni("uLens"),
    lensR: uni("uLensR"),
    strength: uni("uStrength"),
    bezel: uni("uBezel"),
    ab: uni("uAberration"),
    rim: uni("uRim"),
    light: uni("uLight"),
  };

  const texA = gl.createTexture();
  const texB = gl.createTexture();
  const setupTex = (tex: WebGLTexture | null) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };
  setupTex(texA);
  setupTex(texB);

  const params: LensParams = { ...DEFAULT_PARAMS };
  const scroll = { x: 0, y: 0 };
  let srcA: LensSource | null = null; // 当前源（槽 A）
  let srcB: LensSource | null = null; // 旧源（仅交叉淡化期间保留）
  let dirtyA = true; // static 源只在替换时上传一次
  let blend = 1;
  let raf = 0;
  let disposed = false;

  const upload = (tex: WebGLTexture | null, src: LensSource) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src.image);
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    resize();
    if (blend < 1) blend = Math.min(1, blend + 0.06); // ≈0.28s 完成源过渡
    // dynamic 源逐帧重传；static 快照零重传；旧源仅过渡期内保持更新
    if (srcA && (dirtyA || srcA.dynamic)) {
      upload(texA, srcA);
      dirtyA = false;
    }
    if (srcB && blend < 1) upload(texB, srcB);
    if (blend >= 1) srcB = null;

    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform2f(U.scroll, scroll.x, scroll.y);
    gl.uniform2f(U.lens, canvas.width * 0.5, canvas.height * 0.58);
    gl.uniform1f(U.lensR, Math.min(canvas.width, canvas.height) * 0.3);
    gl.uniform1f(U.strength, params.strength);
    gl.uniform1f(U.bezel, params.bezel);
    gl.uniform1f(U.ab, params.aberration);
    gl.uniform1f(U.rim, params.rim);
    gl.uniform2f(U.light, Math.cos(params.lightAngle), -Math.sin(params.lightAngle));
    gl.uniform1f(U.blend, blend);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(U.texA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(U.texB, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    setSource(next) {
      if (!next) return;
      if (!srcA) {
        srcA = next;
        dirtyA = true;
        blend = 1;
        return;
      }
      srcB = srcA;
      srcA = next;
      dirtyA = true;
      blend = 0;
    },
    setParams(patch) {
      Object.assign(params, patch);
    },
    setScroll(x, y) {
      scroll.x = x;
      scroll.y = y;
    },
    start() {
      if (!raf && !disposed) raf = requestAnimationFrame(frame);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}
