<script setup lang="ts">
import type { Capabilities, Tier } from '@et4proj/liquid-glass-core'

/**
 * 控制面板：直接修改传入的 reactive 状态对象（demo 场景，不追求纯 props 流）。
 * 三组状态：材质配置 / 平台能力模拟 / 无障碍模拟。
 */

defineProps<{
  config: {
    style: string
    intensity: number
    material: string
    maxTier: Tier
    maxSurfaces: number
    activeSurfaces: number
  }
  caps: {
    backdropFilter: boolean
    backdropFilterWithSvg: boolean
    webgl2: boolean
    nativeGlass: boolean
    engine: NonNullable<Capabilities['engine']>
    os: NonNullable<Capabilities['os']>
  }
  a11y: {
    reduceTransparency: boolean
    reduceMotion: boolean
    increaseContrast: boolean
  }
}>()

const tiers: Tier[] = ['none', 'solid', 'css', 'svg', 'webgl', 'native']
const intensityPresets = [
  { label: 'subtle', value: 0 },
  { label: 'regular', value: 0.5 },
  { label: 'strong', value: 1 },
]
</script>

<template>
  <aside class="panel">
    <section>
      <h3>材质配置</h3>

      <label class="field">
        <span>风格 style</span>
        <select v-model="config.style">
          <option value="ios26">ios26（磨砂基线）</option>
          <option value="ios27">ios27（主要方向）</option>
        </select>
      </label>

      <div class="field">
        <span>强度 intensity（0..1 线性插值）</span>
        <div class="preset-row">
          <button
            v-for="p in intensityPresets"
            :key="p.label"
            class="preset"
            :class="{ active: config.intensity === p.value }"
            @click="config.intensity = p.value"
          >{{ p.label }}</button>
        </div>
        <input v-model.number="config.intensity" type="range" min="0" max="1" step="0.01" />
        <code class="value">{{ config.intensity }}</code>
      </div>

      <label class="field">
        <span>材质 material</span>
        <select v-model="config.material">
          <option value="regular">regular</option>
          <option value="clear">clear</option>
          <option value="tinted">tinted</option>
        </select>
      </label>

      <label class="field">
        <span>全局档位上限 maxTier</span>
        <select v-model="config.maxTier">
          <option v-for="t in tiers" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
    </section>

    <section>
      <h3>平台能力模拟（Capabilities）</h3>
      <small class="hint">模拟不同环境的探针结果，观察 resolve 的档位选择与降级原因</small>

      <div class="field">
        <span>engine / os</span>
        <div class="row">
          <select v-model="caps.engine">
            <option value="blink">blink</option>
            <option value="webkit">webkit</option>
            <option value="gecko">gecko</option>
          </select>
          <select v-model="caps.os">
            <option value="ios">ios</option>
            <option value="android">android</option>
            <option value="desktop">desktop</option>
          </select>
        </div>
      </div>

      <label class="check">
        <input v-model="caps.backdropFilter" type="checkbox" />
        <span>backdropFilter <em>（css 档门槛）</em></span>
      </label>
      <label class="check">
        <input v-model="caps.backdropFilterWithSvg" type="checkbox" />
        <span>backdropFilterWithSvg <em>（svg 档门槛，Safari 通常 false）</em></span>
      </label>
      <label class="check">
        <input v-model="caps.webgl2" type="checkbox" />
        <span>webgl2 <em>（webgl 档门槛）</em></span>
      </label>
      <label class="check">
        <input v-model="caps.nativeGlass" type="checkbox" />
        <span>nativeGlass <em>（iOS 26+ 桥接，native 档门槛）</em></span>
      </label>
    </section>

    <section>
      <h3>无障碍（强制优先级最高）</h3>
      <label class="check">
        <input v-model="a11y.reduceTransparency" type="checkbox" />
        <span>prefers-reduced-transparency</span>
      </label>
      <label class="check">
        <input v-model="a11y.reduceMotion" type="checkbox" />
        <span>prefers-reduced-motion</span>
      </label>
      <label class="check">
        <input v-model="a11y.increaseContrast" type="checkbox" />
        <span>prefers-contrast</span>
      </label>
    </section>

    <section>
      <h3>预算 budget</h3>
      <label class="field">
        <span>maxSurfaces（同屏上限）</span>
        <input v-model.number="config.maxSurfaces" type="range" min="1" max="16" step="1" />
        <code class="value">{{ config.maxSurfaces }}</code>
      </label>
      <label class="field">
        <span>activeSurfaces（当前同屏）</span>
        <input v-model.number="config.activeSurfaces" type="range" min="0" max="16" step="1" />
        <code class="value">{{ config.activeSurfaces }}</code>
      </label>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border-radius: 16px;
  background: rgba(15, 18, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  height: fit-content;
}

section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #7ee0c0;
}

.hint {
  color: #8a93a8;
  line-height: 1.5;
  margin-top: -6px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #c6cddd;
}

.field > span {
  font-size: 12px;
  color: #9aa3b5;
}

.row {
  display: flex;
  gap: 8px;
}

select {
  flex: 1;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #171b2e;
  color: #e8eaf2;
  font-size: 13px;
}

input[type='range'] {
  width: 100%;
  accent-color: #7ee0c0;
}

.value {
  font-size: 12px;
  color: #7ee0c0;
  align-self: flex-end;
}

.preset-row {
  display: flex;
  gap: 6px;
}

.preset {
  flex: 1;
  padding: 4px 0;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #9aa3b5;
  cursor: pointer;
}

.preset.active {
  border-color: #7ee0c0;
  color: #7ee0c0;
  background: rgba(126, 224, 192, 0.1);
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #c6cddd;
  cursor: pointer;
}

.check em {
  font-style: normal;
  color: #8a93a8;
  font-size: 11px;
}

.check input {
  accent-color: #7ee0c0;
}
</style>
