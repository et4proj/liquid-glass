<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  createGlass,
  createCssBackend,
  createSvgBackend,
  createWebProbe,
  mountDiscovery,
} from '@et4proj/liquid-glass-web'
import type { GlassRuntime, DiscoveryHandle, SurfaceHandleApi } from '@et4proj/liquid-glass-web'
import type { RenderPlan } from '@et4proj/liquid-glass-core'

/**
 * 真实运行时演示：createGlass + webProbe + css/svg 双后端。
 * - 折射开关：svg 档（边缘透镜折射，Chromium）↔ css 档（纯磨砂）实时对比
 * - 交互：nav 胶囊高光跟随指针 + 按压回弹（lg-interactive）
 * - 声明式发现：data-glass 卡片由 mountDiscovery 自动注册
 * - 无障碍订阅真实 matchMedia（系统开启"降低透明度"实时降 solid）
 */

const navEl = ref<HTMLElement | null>(null)
const cardEl = ref<HTMLElement | null>(null)
const discoveryCard = ref<HTMLElement | null>(null)
const intensity = ref<'subtle' | 'regular' | 'strong'>('regular')
const refraction = ref(true)
const style = ref<'ios26' | 'ios27'>('ios27')

let glass: GlassRuntime<HTMLElement> | null = null
let discovery: DiscoveryHandle | null = null
let navHandle: SurfaceHandleApi<HTMLElement> | null = null

const plans = ref<Record<string, RenderPlan | null>>({})
const capsInfo = ref<string>('探测中…')

function refreshPlans(): void {
  if (!glass) return
  plans.value = {
    nav: glass.debug.explain(navEl.value!),
    card: glass.debug.explain(cardEl.value!),
    discovery: glass.debug.explain(discoveryCard.value!),
  }
  const caps = glass.debug.caps
  if (caps) {
    capsInfo.value = `${caps.engine} / ${caps.os} · svg 折射: ${caps.backdropFilterWithSvg ? '可用' : '不可用（降级 css）'}`
  }
}

onMounted(() => {
  glass = createGlass({
    config: { style: style.value, intensity: intensity.value, maxTier: refraction.value ? 'svg' : 'css' },
    probe: createWebProbe(),
    // 双后端：svg 可用时 resolve 选 svg（档位更高），否则能力门控降回 css
    backends: [createSvgBackend(), createCssBackend()],
  })
  navHandle = glass.register(navEl.value!, {
    role: 'bar',
    shape: { kind: 'capsule' },
    interactive: true,
  })
  glass.register(cardEl.value!, { role: 'card' })
  discovery = mountDiscovery(glass)
  // 探针异步完成后刷新决策展示
  setTimeout(refreshPlans, 50)
})

onBeforeUnmount(() => {
  discovery?.dispose()
  glass?.dispose()
})

function setIntensity(next: 'subtle' | 'regular' | 'strong'): void {
  intensity.value = next
  glass?.updateConfig({ intensity: next })
  refreshPlans()
}

/** 风格切换：ios26（磨砂基线）↔ ios27（更通透 · 暗化边缘 · 亮高光） */
function setStyle(next: 'ios26' | 'ios27'): void {
  style.value = next
  glass?.updateConfig({ style: next })
  refreshPlans()
}

/** 折射对比：svg 档（液态折射）↔ css 档（纯磨砂） */
function toggleRefraction(): void {
  refraction.value = !refraction.value
  glass?.updateConfig({ maxTier: refraction.value ? 'svg' : 'css' })
  refreshPlans()
}

function togglePause(): void {
  if (navHandle) {
    if (!paused.value) navHandle.pause()
    else navHandle.resume()
    paused.value = !paused.value
  }
}
const paused = ref(false)

const planEntries = computed(() =>
  Object.entries(plans.value).map(([key, plan]) => ({
    key,
    tier: plan?.tier ?? '-',
    reasons: plan?.reasons ?? [],
    blur: plan ? `${plan.tokens.material.blur}px` : '-',
    refraction: plan ? (plan.tokens.refraction?.strength ?? 0).toFixed(2) : '-',
  })),
)
</script>

<template>
  <section class="runtime-demo">
      <header class="rt-head">
      <h2>真实运行时 <code>createGlass</code></h2>
      <p>
        命令式 <code>register()</code> + 声明式 <code>data-glass</code> 发现；双后端按能力自动选档
        <span class="caps">{{ capsInfo }}</span>
      </p>
    </header>

    <div class="rt-controls">
      <div class="seg">
        <button
          :class="{ active: style === 'ios26' }"
          @click="setStyle('ios26')"
        >ios26 磨砂</button>
        <button
          :class="{ active: style === 'ios27' }"
          @click="setStyle('ios27')"
        >ios27 通透</button>
      </div>
      <div class="seg">
        <button
          v-for="i in (['subtle', 'regular', 'strong'] as const)"
          :key="i"
          :class="{ active: intensity === i }"
          @click="setIntensity(i)"
        >{{ i }}</button>
      </div>
      <button class="ghost" :class="{ on: refraction }" @click="toggleRefraction">
        {{ refraction ? '折射 ON（svg 档·液态）' : '折射 OFF（css 档·磨砂）' }}
      </button>
      <button class="ghost" @click="togglePause">{{ paused ? 'resume nav' : 'pause nav（降开销）' }}</button>
      <button class="ghost" @click="refreshPlans">explain 刷新</button>
    </div>

    <div class="rt-stage">
      <!-- 命令式：register() -->
      <nav ref="navEl" class="rt-nav">
        <b>●</b> 首页 · 发现 · 我的
        <small class="hint-move">← 指针划过 / 按下试试</small>
      </nav>

      <!-- 命令式：register() -->
      <div ref="cardEl" class="rt-card">
        <b>register() 卡片</b>
        <small>命令式 API 挂载</small>
      </div>

      <!-- 声明式：data-glass 自动发现（mountDiscovery） -->
      <div ref="discoveryCard" class="rt-card" data-glass="card" data-glass-intensity="0.8">
        <b>data-glass 卡片</b>
        <small>声明式发现 · intensity 0.8</small>
      </div>
    </div>

    <div class="rt-plans">
      <div v-for="e in planEntries" :key="e.key" class="rt-plan">
        <code class="k">{{ e.key }}</code>
        <span class="tier">{{ e.tier }}</span>
        <span class="blur">blur {{ e.blur }} · refraction {{ e.refraction }}</span>
        <span v-for="r in e.reasons" :key="r" class="r">{{ r }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.runtime-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 16px;
  background: rgb(15 18 32 / 60%);
  border: 1px solid rgb(255 255 255 / 8%);
}

.rt-head h2 {
  margin: 0;
  font-size: 16px;
}

.rt-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9aa3b5;
}

.caps {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 4px;
  background: rgb(126 224 192 / 12%);
  color: #7ee0c0;
  font-family: ui-monospace, monospace;
}

.rt-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.seg {
  display: flex;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 8px;
  overflow: hidden;
}

.seg button {
  padding: 6px 14px;
  font-size: 12px;
  background: transparent;
  color: #9aa3b5;
  border: none;
  cursor: pointer;
}

.seg button.active {
  background: rgb(126 224 192 / 15%);
  color: #7ee0c0;
}

.ghost {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid rgb(255 255 255 / 14%);
  background: transparent;
  color: #c6cddd;
  cursor: pointer;
}

.ghost.on {
  border-color: #7ee0c0;
  color: #7ee0c0;
}

.hint-move {
  margin-left: 10px;
  font-weight: 400;
  color: rgb(255 255 255 / 60%);
}

.rt-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 玻璃外观由 cssBackend 注入的 .lg-surface 全局样式驱动，这里只管布局 */
.rt-nav {
  align-self: flex-start;
  padding: 12px 28px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.rt-nav b {
  color: #7ee0c0;
}

.rt-card {
  padding: 16px 20px;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.rt-card small {
  color: rgb(255 255 255 / 72%);
}

.rt-plans {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rt-plan {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: ui-monospace, monospace;
}

.rt-plan .k {
  color: #9aa3b5;
}

.rt-plan .tier {
  color: #22c55e;
  font-weight: 700;
}

.rt-plan .blur {
  color: #c6cddd;
}

.rt-plan .r {
  padding: 1px 7px;
  border-radius: 4px;
  background: rgb(255 255 255 / 7%);
  color: #fbbf24;
}
</style>
