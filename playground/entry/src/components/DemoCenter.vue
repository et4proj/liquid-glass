<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { registerStyle } from '@et4proj/liquid-glass-core'
import { createGlass, createWebProbe, createSvgBackend, createCssBackend } from '@et4proj/liquid-glass-web'
import { ios26 } from '@et4proj/liquid-glass-style-ios26'
import { ios27 } from '@et4proj/liquid-glass-style-ios27'
import { reactPreambleReady } from '../react-preamble'

/**
 * 演示中心（docs/proposals/playground-federation-design.md）：
 * 平台 × 三方库选择器 + MF remote 挂载区。host 的 runtime 经 ctx 注入 remote，
 * 本面板的迷你控制条 updateConfig → 演示区即时生效（shared 单例的等效保障：
 * playground 源码 alias 模式下 MF shared 不匹配，一致性由 ctx.runtime 直传保证）。
 */

// 风格注册（幂等；host 注册表承载 remote 的 config.style 取用）
registerStyle(ios26)
registerStyle(ios27)

const runtime = createGlass({
  config: { style: 'ios27' },
  probe: createWebProbe(),
  backends: [createSvgBackend(), createCssBackend()],
})

/* ---------------- 演示矩阵（H3） ---------------- */

interface DemoTarget {
  key: string
  label: string
  note?: string
  enabled: boolean
}

const libraries = reactive<DemoTarget[]>([
  { key: 'antd-mobile', label: 'antd-mobile v5', enabled: true },
  { key: 'nutui', label: 'NutUI React', note: 'P3 接入', enabled: false },
  { key: 'tdesign', label: 'TDesign React', note: 'P3 接入', enabled: false },
  { key: 'vant', label: 'Vant (Vue 线路)', note: '后续', enabled: false },
])
const activeLibrary = ref('antd-mobile')

/* ---------------- 迷你控制条（ctx.config 的活来源） ---------------- */

const control = reactive({ style: 'ios27', intensity: 0.5 })
function applyControl(): void {
  runtime.updateConfig({ style: control.style, intensity: control.intensity })
}

/* ---------------- remote 挂载协议（§4） ---------------- */

interface RemoteApi {
  mount(el: HTMLElement, ctx: Record<string, unknown>): void
  unmount(): void
}

const slotEl = ref<HTMLElement | null>(null)
const status = ref<'idle' | 'loading' | 'mounted' | 'error'>('idle')
const errorMsg = ref('')
let remoteApi: RemoteApi | null = null

async function mountDemo(): Promise<void> {
  if (!slotEl.value) return
  await unmountDemo()
  status.value = 'loading'
  try {
    // react-refresh 前导先于 React 模块链就绪（缺它则 plugin-react 的 dev
    // 转换模块直接抛 "can't detect preamble"，见 react-preamble.ts）
    await reactPreambleReady
    // MF remote 动态加载（liquid_react_demo → http://localhost:5174/remoteEntry.js）
    // @ts-ignore -- MF remote 无本地类型（remote dts 接入为 v2 项）
    const mod = (await import('liquid_react_demo/app')) as RemoteApi & { default?: RemoteApi }
    remoteApi = mod.default ?? mod
    remoteApi.mount(slotEl.value, {
      runtime,
      mode: 'remote',
      config: { style: control.style, intensity: control.intensity },
      demo: { platform: 'web-react', library: activeLibrary.value },
    })
    status.value = 'mounted'
  } catch (err) {
    status.value = 'error'
    // 真实错误必须浮出：MF 链路错误形态多样（网络/共享协商/remote 运行时），
    // 空吞错会让"server 没起"的猜测掩盖实际原因（调试踩坑，见 m1-react-line.md 遗留项）
    console.error('[DemoCenter] remote 挂载失败：', err)
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    errorMsg.value = `挂载失败：${detail}（确认 5174 dev server 在跑后可点重试）`
  }
}

async function unmountDemo(): Promise<void> {
  remoteApi?.unmount()
  remoteApi = null
  // DOM 兜底清理（remote 的 style 标签残留按 §6 风险表接受）
  if (slotEl.value) slotEl.value.innerHTML = ''
  if (status.value !== 'error') status.value = 'idle'
}

function selectLibrary(key: string): void {
  const target = libraries.find((l) => l.key === key)
  if (!target?.enabled) return
  activeLibrary.value = key
  void mountDemo()
}

onMounted(() => {
  void mountDemo()
})
onUnmounted(() => {
  void unmountDemo()
  runtime.dispose()
})
</script>

<template>
  <section class="demo-center">
    <h3>演示中心 · 三方库玻璃化</h3>
    <p class="desc">
      选择目标组件库 → MF remote 动态挂载真实组件演示；控制条实时驱动演示区（host runtime 注入）。
    </p>

    <div class="toolbar">
      <div class="chips">
        <button
          v-for="l in libraries"
          :key="l.key"
          class="chip"
          :class="{ active: activeLibrary === l.key, disabled: !l.enabled }"
          :title="l.note"
          @click="selectLibrary(l.key)"
        >
          {{ l.label }}<small v-if="l.note"> · {{ l.note }}</small>
        </button>
      </div>
      <div class="controls">
        <label>风格
          <select v-model="control.style" @change="applyControl">
            <option value="ios27">ios27</option>
            <option value="ios26">ios26</option>
          </select>
        </label>
        <label>强度 {{ control.intensity.toFixed(2) }}
          <input v-model.number="control.intensity" type="range" min="0" max="1" step="0.05" @input="applyControl" />
        </label>
      </div>
    </div>

    <div class="device" :data-status="status">
      <div v-if="status === 'error'" class="fallback">
        <p>{{ errorMsg }}</p>
        <button @click="mountDemo">重试挂载</button>
      </div>
      <div v-else-if="status === 'loading'" class="fallback"><p>正在加载 remote…</p></div>
      <div ref="slotEl" class="slot" />
    </div>
  </section>
</template>

<style scoped>
.demo-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 16px;
  background: rgb(10 13 24 / 50%);
  border: 1px solid rgb(255 255 255 / 7%);
}

.demo-center h3 {
  margin: 0;
  font-size: 15px;
}

.desc {
  margin: 0;
  font-size: 12px;
  color: #9aa3b5;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 14%);
  background: transparent;
  color: #c6cddd;
  font-size: 12px;
  cursor: pointer;
}

.chip.active {
  border-color: #7ee0c0;
  color: #7ee0c0;
}

.chip.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chip small {
  opacity: 0.6;
}

.controls {
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 12px;
  color: #9aa3b5;
}

.controls select {
  margin-left: 6px;
  background: #16182a;
  color: #e7ecf5;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 6px;
  padding: 3px 6px;
}

.device {
  position: relative;
  height: 640px;
  border-radius: 22px;
  border: 1px solid rgb(255 255 255 / 10%);
  overflow: hidden;
  background: #0c0e18;
}

.slot {
  height: 100%;
}

.fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  color: #9aa3b5;
  font-size: 13px;
  padding: 0 32px;
  text-align: center;
}

.fallback button {
  padding: 6px 18px;
  border-radius: 8px;
  border: 1px solid #7ee0c0;
  color: #7ee0c0;
  background: transparent;
  cursor: pointer;
}
</style>
