/**
 * 透镜 demo 的三种受控背景源：
 * - 图片：text_to_image 生成 → fetch → createImageBitmap（CORS 由 blob 中转规避 taint；失败回退程序化渐变）
 * - 视频：离屏动画 canvas → captureStream → <video>（真实 video 元素，验证 texImage2D(video) 路径）
 * - canvas：动画 2D canvas 直接作为纹理（texImage2D(canvas) 路径）
 * 三者都是 TexImageSource，走 BackdropSource 契约同族路径（core types.ts §4.5 预留）。
 */
import type { LensSource } from "./lens-renderer";

/** 带动画定时器的 canvas（_stop 停帧循环） */
export type AnimatedCanvas = HTMLCanvasElement & { _stop: () => void };

/** 动画背景 canvas：流动波纹（video 源与 canvas 源共用绘制器） */
export function makeAnimatedCanvas(w = 640, h = 400): AnimatedCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  let t = 0;
  const palette = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];
  const draw = () => {
    t += 0.012;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 六条正弦色带（高对比，透镜位移/色散肉眼可辨）
    for (let i = 0; i < palette.length; i++) {
      ctx.beginPath();
      ctx.strokeStyle = palette[i];
      ctx.lineWidth = 22;
      const base = h * (0.14 + i * 0.15);
      ctx.moveTo(0, base);
      for (let x = 0; x <= w; x += 8) {
        const y = base + Math.sin(x / 90 + t * 2 + i * 1.1) * 34 + Math.sin(x / 33 - t) * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 滚动指示网格点（验证"滚动只改采样偏移、纹理不重传"）
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let x = 0; x < w; x += 64) {
      for (let y = 0; y < h; y += 64) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
  };
  draw();
  const timer = window.setInterval(draw, 33);
  return Object.assign(canvas, { _stop: () => window.clearInterval(timer) });
}

/** 图片源：text_to_image 生成图 → bitmap（失败回退程序化渐变，保证 demo 永不空白） */
export async function loadImageSource(): Promise<LensSource> {
  const prompt = encodeURIComponent(
    "vibrant abstract flowing color gradient waves, silk texture, rich saturated colors, high detail photography",
  );
  const url = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${prompt}&image_size=landscape_16_9`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const image = await createImageBitmap(blob);
    return { image, dynamic: false };
  } catch (e) {
    console.warn("[lens] 图片源获取失败，回退程序化渐变：", e);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 640, 400);
    g.addColorStop(0, "#3b82f6");
    g.addColorStop(0.35, "#8b5cf6");
    g.addColorStop(0.7, "#ec4899");
    g.addColorStop(1, "#f59e0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("fallback gradient", 24, 48);
    return { image: canvas, dynamic: false };
  }
}

/** 视频源：动画 canvas → captureStream → video 元素（真实 video 采样路径） */
export function makeVideoSource(): { source: LensSource; dispose: () => void } {
  const bg = makeAnimatedCanvas(640, 400);
  const stream = (
    bg as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }
  ).captureStream?.(30);
  if (!stream) {
    // 浏览器不支持 captureStream（极旧环境）：退化为 canvas 直采
    return { source: { image: bg, dynamic: true }, dispose: () => bg._stop?.() };
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.srcObject = stream;
  video.play().catch(() => {});
  return {
    source: { image: video, dynamic: true },
    dispose: () => {
      bg._stop?.();
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** canvas 源：动画 canvas 直接作为纹理 */
export function makeCanvasSource(): { source: LensSource; dispose: () => void } {
  const bg = makeAnimatedCanvas(640, 400);
  return { source: { image: bg, dynamic: true }, dispose: () => bg._stop?.() };
}
