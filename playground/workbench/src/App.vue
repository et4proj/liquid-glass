<script setup lang="ts">
import { computed, reactive } from 'vue'
import { defineConfig, resolve } from '@et4proj/liquid-glass-core'
import type { Capabilities, SurfaceDeclaration, Tier } from '@et4proj/liquid-glass-core'
import GlassCard from './components/GlassCard.vue'
import ControlPanel from './components/ControlPanel.vue'
import PlanPanel from './components/PlanPanel.vue'
import RuntimeDemo from './components/RuntimeDemo.vue'
import EffectGallery from './components/EffectGallery.vue'

/**
 * core/web 工作台（独立演示包，MF remote 被 entry 挂载或 standalone 访问）：
 * 左侧改配置/能力 → 中间玻璃卡片实时渲染 token → 下方查看 RenderPlan 决策细节。
 * 本包自带完整 core/web 模块图（vite alias 直连源码）——改 packages 源码即时生效，
 * 不消费 host 注入的 ctx.runtime（与三方库 demo 的差异：工作台自持运行时）。
 */

/* ---------------- 可调状态（被 ControlPanel 直接修改） ---------------- */

const configState = reactive({
  style: 'ios27',
  intensity: 0.5,
  material: 'regular',
  maxTier: 'css' as Tier,
  maxSurfaces: 8,
  activeSurfaces: 0,
})

const capsState = reactive({
  backdropFilter: true,
  backdropFilterWithSvg: true,
  webgl2: true,
  nativeGlass: false,
  engine: 'blink' as NonNullable<Capabilities['engine']>,
  os: 'android' as NonNullable<Capabilities['os']>,
})

const a11yState = reactive({
  reduceTransparency: false,
  reduceMotion: false,
  increaseContrast: false,
})

/* ---------------- resolve 组装 ---------------- */

const caps = computed<Capabilities>(() => ({
  platform: 'web',
  engine: capsState.engine,
  os: capsState.os,
  osVersion: '14',
  backdropFilter: capsState.backdropFilter,
  backdropFilterWithSvg: capsState.backdropFilterWithSvg,
  webgl2: capsState.webgl2,
  nativeGlass: capsState.nativeGlass,
  a11y: { ...a11yState },
  device: { tier: 'high', dpr: 3 },
}))

const config = computed(() =>
  defineConfig({
    style: configState.style,
    intensity: configState.intensity,
    material: configState.material as 'regular' | 'clear' | 'tinted',
    maxTier: configState.maxTier,
    budget: { maxSurfaces: configState.maxSurfaces },
  }),
)

/** 三个典型 surface：胶囊 TabBar、卡片、控件（不同 role 的默认表现） */
const surfaces: Array<{
  key: string
  label: string
  variant: 'bar' | 'card' | 'control'
  declaration: SurfaceDeclaration
}> = [
  {
    key: 'bar',
    label: 'role: bar · capsule',
    variant: 'bar',
    declaration: { role: 'bar', shape: { kind: 'capsule' }, interactive: true },
  },
  {
    key: 'card',
    label: 'role: card · rounded',
    variant: 'card',
    declaration: { role: 'card' },
  },
  {
    key: 'control',
    label: 'role: control · interactive',
    variant: 'control',
    declaration: { role: 'control', interactive: true },
  },
]

const plans = computed(() =>
  Object.fromEntries(
    surfaces.map(({ key, declaration }) => [
      key,
      resolve({
        config: config.value,
        caps: caps.value,
        surface: declaration,
        budget: { activeSurfaces: configState.activeSurfaces },
      }),
    ]),
  ),
)
</script>

<template>
  <div class="layout">
    <!-- 彩色光斑背景（style.css 中定义） -->
    <div class="blob blob-1" />
    <div class="blob blob-2" />
    <div class="blob blob-3" />
    <div class="blob blob-4" />

    <header class="header">
      <h1>liquid-glass <span>workbench</span></h1>
      <p>core/web 工作台 —— 调整左侧配置与能力模拟，实时观察 token 渲染与档位决策</p>
    </header>

    <main class="main">
      <ControlPanel :config="configState" :caps="capsState" :a11y="a11yState" />

      <section class="stage">
        <!-- 背景内容层：给 backdrop-filter 提供细节（滚动验证模糊效果） -->
        <div class="backdrop-content">
          <h2>受控背景</h2>
          <p>
            玻璃效果依赖背后的内容。滚动此区域观察 backdrop-filter 的实时表现；
            纯白/纯色背景会让玻璃"发灰"（架构 §11.2 受控背景场景的动机）。
          </p>
          <div class="swatches">
            <div v-for="c in 12" :key="c" class="swatch" :style="{ background: `hsl(${c * 30}, 80%, 60%)` }">
              {{ c * 30 }}
            </div>
          </div>
          <div class="text-block">
            <p v-for="n in 6" :key="n">
              Liquid Glass {{ n }} —— 数值由风格包三锚点插值：ios27 subtle 2px →
              strong 12px；饱和度 1.4 → 1.8；高光 0.5 → 1.0（未注册风格回退 basic）。
            </p>
          </div>
        </div>

        <!-- 玻璃卡片：悬浮于背景之上 -->
        <div class="cards">
          <GlassCard
            v-for="s in surfaces"
            :key="s.key"
            :plan="plans[s.key]"
            :label="s.label"
            :variant="s.variant"
          >
            <span v-if="s.variant === 'bar'" class="demo-bar">
              <b>●</b> 首页 &nbsp;·&nbsp; 发现 &nbsp;·&nbsp; 我的
            </span>
            <span v-else-if="s.variant === 'control'">⏻ 液态开关</span>
            <span v-else>
              <b>Glass Card</b><br />
              <small>{{ configState.style }} · {{ configState.material }}</small>
            </span>
          </GlassCard>
        </div>

        <!-- 真实运行时（createGlass + cssBackend + data-glass 发现） -->
        <RuntimeDemo />

        <!-- 效果画廊：磨砂 / 边缘折射 / 整面放大镜（DOM 背景）+ WebGL 透镜（受控背景） -->
        <EffectGallery />

        <!-- RenderPlan 决策细节 -->
        <div class="plans">
          <PlanPanel
            v-for="s in surfaces"
            :key="s.key"
            :plan="plans[s.key]"
            :title="`RenderPlan · ${s.key}`"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.layout {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 28px 32px 8px;
}

.header h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.02em;
}

.header h1 span {
  color: #7ee0c0;
  font-weight: 400;
}

.header p {
  margin: 6px 0 0;
  color: #9aa3b5;
  font-size: 13px;
}

.main {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 24px;
  padding: 20px 32px 48px;
  align-items: start;
}

.stage {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

/* 受控背景：可滚动，玻璃卡片叠加其上 */
.backdrop-content {
  position: relative;
  border-radius: 16px;
  padding: 20px;
  max-height: 300px;
  overflow: auto;
  background: rgb(10 13 24 / 50%);
  border: 1px solid rgb(255 255 255 / 7%);
}

.backdrop-content h2 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #c6cddd;
}

.backdrop-content p {
  margin: 0 0 12px;
  font-size: 13px;
  color: #9aa3b5;
  line-height: 1.7;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.swatch {
  aspect-ratio: 2 / 1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: rgb(0 0 0 / 55%);
  font-weight: 700;
}

.text-block p {
  margin: 0 0 6px;
  font-size: 12px;
  color: #7d8699;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.demo-bar {
  font-size: 15px;
  font-weight: 600;
}

.demo-bar b {
  color: #7ee0c0;
}

.plans {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

small {
  color: rgb(255 255 255 / 75%);
}

@media (width <= 900px) {
  .main {
    grid-template-columns: 1fr;
  }
}
</style>
