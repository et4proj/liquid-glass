<script setup lang="ts">
/**
 * 效果画廊（M0 效果预览目标面板）：
 * 区 1 合成器模式——磨砂（css 档）/ 边缘折射（ios27 校准 bezel 0.18）/ 整面放大镜
 *   （bezel → 1 的凸透镜形态）三卡对比，DOM 背景下由 backdrop-filter 采样；
 *   整面放大镜卡暴露 bezelWidth / strength 滑杆，实时演示 refraction 通道调参。
 * 区 2 纹理模式——LensDemo（WebGL 自采样，受控背景 img/video/canvas）。
 * 两区正好覆盖背景两大赛道：任意 DOM 只能合成器采样；受控背景可主动采样。
 * 全部 interactive=false（纯效果展示，无指针交互）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  createGlass,
  createCssBackend,
  createSvgBackend,
  createWebProbe,
} from '@et4proj/liquid-glass-web'
import type { GlassRuntime } from '@et4proj/liquid-glass-web'
import LensDemo from './LensDemo.vue'

const frostedEl = ref<HTMLElement | null>(null)
const edgeEl = ref<HTMLElement | null>(null)
const domeEl = ref<HTMLElement | null>(null)

// 三卡各异 → 三个独立 runtime 实例（advanced 为 config 级，无法按表面差异化）
let cssRt: GlassRuntime<HTMLElement> | null = null
let edgeRt: GlassRuntime<HTMLElement> | null = null
let domeRt: GlassRuntime<HTMLElement> | null = null

const bezel = ref(1)
const strength = ref(1)

const MOTION_OFF = { interactive: false, respectReducedMotion: true }

onMounted(() => {
  const probe = createWebProbe()
  // 磨砂玻璃：档位上限 css（纯 backdrop-filter，全平台）
  cssRt = createGlass({
    config: { maxTier: 'css', motion: MOTION_OFF },
    probe,
    backends: [createCssBackend()],
  })
  cssRt.register(frostedEl.value!, { role: 'card' })

  // 边缘折射：ios27 校准（bezel 0.18 窄带，系统观感）
  edgeRt = createGlass({
    config: { maxTier: 'svg', motion: MOTION_OFF },
    probe,
    backends: [createSvgBackend(), createCssBackend()],
  })
  edgeRt.register(edgeEl.value!, { role: 'card' })

  // 整面放大镜：refraction 通道覆盖 → 凸透镜形态（滚动滑杆实时调参）
  domeRt = createGlass({
    config: {
      maxTier: 'svg',
      motion: MOTION_OFF,
      advanced: { refraction: { bezelWidth: bezel.value, strength: strength.value } },
    },
    probe,
    backends: [createSvgBackend(), createCssBackend()],
  })
  domeRt.register(domeEl.value!, { role: 'card' })
})

/** 滑杆 → advanced.refraction 覆盖（token 调参 → 贴图缓存重建 → 滤镜链更新） */
const applyDome = () => {
  domeRt?.updateConfig({
    advanced: { refraction: { bezelWidth: bezel.value, strength: strength.value } },
  })
}

onBeforeUnmount(() => {
  cssRt?.dispose()
  edgeRt?.dispose()
  domeRt?.dispose()
})
</script>

<template>
  <section class="gallery">
    <header class="head">
      <h2>效果画廊 · 磨砂玻璃与曲面镜</h2>
      <p>
        左右两条渲染路径：任意 DOM 背景只能由合成器采样（backdrop-filter，区 1）；
        受控背景（图片 / video / canvas）的像素可直接采样，WebGL 自绘透镜全浏览器可用（区 2）。
      </p>
    </header>

    <!-- 区 1：合成器模式（DOM 背景） -->
    <div class="stage">
      <div class="stage-label">区 1 · 合成器模式（DOM 背景 · backdrop-filter，Safari 自动降磨砂）</div>
      <div class="dom-bg">
        <p class="lorem">
          The glass bends the light at its curved edge. Background strokes warp, letters
          stretch and flow, and the whole surface behaves like a physical lens. 透镜边缘的光线
          弯折——线条、文字在玻璃边缘被拉伸、弯折、流动，如同真实光学器件。
        </p>
        <div class="stripes">
          <span v-for="i in 7" :key="i" :style="{ background: `hsl(${i * 44}, 85%, 58%)` }"></span>
        </div>
        <div class="cards">
          <div ref="frostedEl" class="glass-card">
            <span class="card-tag">磨砂玻璃 · css 档</span>
          </div>
          <div ref="edgeEl" class="glass-card">
            <span class="card-tag">边缘折射 · ios27 校准（bezel 0.18）</span>
          </div>
          <div ref="domeEl" class="glass-card">
            <span class="card-tag">整面放大镜 · 凸透镜（bezel 滑杆可调）</span>
          </div>
        </div>
        <div class="grid-lines" aria-hidden="true"></div>
      </div>
      <div class="dome-controls">
        <label>
          bezelWidth {{ bezel.toFixed(2) }}（0.05 窄带 → 1 整面凸透镜）
          <input v-model.number="bezel" type="range" min="0.05" max="1" step="0.05" @input="applyDome" />
        </label>
        <label>
          strength {{ strength.toFixed(2) }}
          <input v-model.number="strength" type="range" min="0.1" max="1" step="0.05" @input="applyDome" />
        </label>
      </div>
    </div>

    <!-- 区 2：纹理模式（受控背景） -->
    <div class="stage">
      <div class="stage-label">区 2 · 纹理模式（受控背景 · WebGL 自采样，全浏览器）</div>
      <LensDemo />
    </div>

    <footer class="note">
      <table>
        <thead>
          <tr><th>背景类型</th><th>像素可获得性</th><th>渲染路径</th><th>滚动成本</th></tr>
        </thead>
        <tbody>
          <tr><td>任意 DOM</td><td>合成器私有，脚本不可读</td><td>backdrop-filter + SVG 滤镜（区 1）</td><td>免费（合成器线程）</td></tr>
          <tr><td>图片 / video / canvas</td><td>TexImageSource 可直接采样</td><td>WebGL 透镜纹理采样（区 2）</td><td>快照零重传 / dynamic 逐帧</td></tr>
          <tr><td>低频变化 DOM</td><td>html-to-image 快照（低频）</td><td>纹理模式 + 脏区节流重拍</td><td>重拍贵但低频（未实现，规划）</td></tr>
        </tbody>
      </table>
    </footer>
  </section>
</template>

<style scoped>
.gallery {
  margin-top: 32px;
}

.head h2 {
  margin: 0 0 6px;
  font-size: 17px;
}

.head p {
  margin: 0 0 16px;
  color: #9aa0b0;
  font-size: 12.5px;
  line-height: 1.7;
}

.stage {
  border: 1px solid #2a2a35;
  border-radius: 12px;
  padding: 16px;
  background: #16161d;
  margin-bottom: 20px;
}

.stage-label {
  font-size: 12.5px;
  color: #7d8496;
  margin-bottom: 12px;
}

.dom-bg {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  padding: 24px;
  background: linear-gradient(135deg, #2b2b40, #1a2340 55%, #402a3a);
}

.lorem {
  max-width: 720px;
  font-size: 13.5px;
  line-height: 1.8;
  color: #dfe3ee;
  margin: 0 0 18px;
}

.stripes {
  display: flex;
  height: 26px;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 20px;
}

.stripes span {
  flex: 1;
}

.cards {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  position: relative;
  z-index: 2;
}

.glass-card {
  flex: 1;
  min-width: 220px;
  height: 150px;
  border-radius: 22px;
  display: flex;
  align-items: flex-end;
  padding: 12px 14px;
}

.card-tag {
  font-size: 12px;
  color: #f2f4fa;
  text-shadow: 0 1px 4px rgb(0 0 0 / 60%);
  background: rgb(0 0 0 / 35%);
  padding: 3px 8px;
  border-radius: 999px;
}

.grid-lines {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgb(255 255 255 / 16%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 16%) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
}

.dome-controls {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 14px;
  font-size: 12.5px;
  color: #c8ccd8;
}

.dome-controls label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  color: #c8ccd8;
}

.note th,
.note td {
  border: 1px solid #2a2a35;
  padding: 8px 10px;
  text-align: left;
}

.note th {
  background: #1c1c26;
  color: #e7eaf3;
}
</style>
