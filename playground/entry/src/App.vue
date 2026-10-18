<script setup lang="ts">
import { ref, watch } from 'vue'
import { loadRemote } from '@module-federation/runtime'
import DemoCenter from './components/DemoCenter.vue'

/**
 * playground 目录壳（MF host）：本包不再承载调试内容，只做"框架 + 目录"——
 * 顶部常驻导航切换调试区，舞台互斥挂载对应 MF remote（v1 互斥语义，见
 * playground-federation-design.md §6）。各调试区均为独立演示包，可单独
 * `pnpm playground:<name>` 访问，也可在此处挂载跳转。
 *
 * 挂载协议：mount(el, ctx?) / unmount()（§4）。Vue remote（workbench）无需
 * react-refresh 前导；antd-mobile（React）由 DemoCenter 内部处理前导与
 * ctx.runtime 注入。
 */

/**
 * workbench 挂载协议形状（§4 无 ctx 变体）。走官方 loadRemote 通道后，
 * liquid_glass_workbench 的完整类型待其 dev server 首跑流转生成（@mf-types），
 * 生成前 string 重载退化为 any，此形状作过渡断言（结构化兼容，类型流转后不冲突）。
 */
interface WorkbenchRemote {
  mount(el: HTMLElement): void
  unmount(): void
}

type ViewKey = 'directory' | 'workbench' | 'antd-mobile' | 'vant'

interface DebugTarget {
  /** 已实现挂载的视图，或未来占位（nutui / tdesign） */
  key: Exclude<ViewKey, 'directory'> | 'nutui' | 'tdesign'
  label: string
  desc: string
  /** standalone dev 端口（提示用） */
  port: number
  note?: string
  enabled: boolean
}

const views: DebugTarget[] = [
  {
    key: 'workbench',
    label: 'core/web 工作台',
    desc: '策略层可视化 + 真实运行时 + 效果画廊/WebGL 透镜（vite alias 直连源码，改包内代码即时生效）',
    port: 5175,
    enabled: true,
  },
  {
    key: 'antd-mobile',
    label: 'antd-mobile 演示',
    desc: '三方库玻璃化演示：零改动接入验收 + 演示中心迷你控制条实时驱动',
    port: 5174,
    enabled: true,
  },
  {
    key: 'vant',
    label: 'vant 演示',
    desc: 'Vue 线路演示：vant 4 零改动接入验收 + vue 绑定层 GlassSurface 展示',
    port: 5176,
    enabled: true,
  },
  { key: 'nutui', label: 'NutUI React', desc: 'P3 接入', port: 5178, note: 'P3 接入', enabled: false },
  { key: 'tdesign', label: 'TDesign React', desc: 'P3 接入', port: 5179, note: 'P3 接入', enabled: false },
]

const active = ref<ViewKey>('directory')

/* ---------------- workbench remote 挂载（Vue remote，无前导） ---------------- */

const workbenchSlot = ref<HTMLElement | null>(null)
const workbenchStatus = ref<'idle' | 'loading' | 'mounted' | 'error'>('idle')
const workbenchError = ref('')
let workbenchApi: WorkbenchRemote | null = null

async function mountWorkbench(): Promise<void> {
  if (!workbenchSlot.value) return
  await unmountWorkbench()
  workbenchStatus.value = 'loading'
  try {
    // 官方 loadRemote 通道（§4.1）：liquid_glass_workbench → http://localhost:5175/remoteEntry.js
    // 类型未流转时退化为 any（string 重载），见上方 WorkbenchRemote 注释
    const mod = (await loadRemote('liquid_glass_workbench/app')) as WorkbenchRemote & {
      default?: WorkbenchRemote
    }
    workbenchApi = mod.default ?? mod
    workbenchApi.mount(workbenchSlot.value)
    workbenchStatus.value = 'mounted'
  } catch (err) {
    workbenchStatus.value = 'error'
    // 真实错误必须浮出（同 DemoCenter 约定：空吞错会让"server 没起"掩盖实际原因）
    console.error('[hub] liquid_glass_workbench 挂载失败：', err)
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    workbenchError.value = `挂载失败：${detail}（确认 5175 dev server 在跑后可点重试）`
  }
}

async function unmountWorkbench(): Promise<void> {
  workbenchApi?.unmount()
  workbenchApi = null
  if (workbenchSlot.value) workbenchSlot.value.innerHTML = ''
  if (workbenchStatus.value !== 'error') workbenchStatus.value = 'idle'
}

// v-if 挂载后 slot ref 置位 → 拉起 remote；切走时先于 DOM 移除 unmount
watch(workbenchSlot, (el) => {
  if (el) void mountWorkbench()
})
watch(active, (_next, prev) => {
  if (prev === 'workbench') void unmountWorkbench()
})

function selectView(key: ViewKey | DebugTarget['key']): void {
  if (key === 'directory') {
    active.value = 'directory'
    return
  }
  const target = views.find((v) => v.key === key)
  if (!target?.enabled) return
  // enabled 的目标必属可挂载视图（上面运行时校验兜底，静态侧收窄）
  active.value = key as ViewKey
}
</script>

<template>
  <div class="layout">
    <!-- 彩色光斑背景（style.css 中定义） -->
    <div class="blob blob-1" />
    <div class="blob blob-2" />
    <div class="blob blob-3" />
    <div class="blob blob-4" />

    <header class="header">
      <h1>liquid-glass <span>playground</span></h1>
      <p>演示目录 —— 选择调试区进入；各调试区为独立演示包，也可单独 dev 访问</p>
    </header>

    <nav class="nav">
      <button
        class="chip"
        :class="{ active: active === 'directory' }"
        @click="selectView('directory')"
      >
        目录
      </button>
      <button
        v-for="v in views"
        :key="v.key"
        class="chip"
        :class="{ active: active === v.key, disabled: !v.enabled }"
        :title="v.note"
        @click="selectView(v.key)"
      >
        {{ v.label }}<small v-if="v.note"> · {{ v.note }}</small>
      </button>
    </nav>

    <main class="stage">
      <!-- 目录视图：调试区卡片 -->
      <section v-if="active === 'directory'" class="directory">
        <article v-for="v in views" :key="v.key" class="card" :class="{ disabled: !v.enabled }">
          <h2>{{ v.label }}<small v-if="v.note"> · {{ v.note }}</small></h2>
          <p>{{ v.desc }}</p>
          <footer>
            <button v-if="v.enabled" class="enter" @click="selectView(v.key)">进入 →</button>
            <small v-else>暂未开放</small>
            <small class="port">standalone · http://localhost:{{ v.port }}</small>
          </footer>
        </article>
      </section>

      <!-- core/web 工作台（MF remote 互斥挂载） -->
      <section v-else-if="active === 'workbench'" class="remote-stage" :data-status="workbenchStatus">
        <div v-if="workbenchStatus === 'error'" class="fallback">
          <p>{{ workbenchError }}</p>
          <button @click="mountWorkbench">重试挂载</button>
        </div>
        <div v-else-if="workbenchStatus === 'loading'" class="fallback"><p>正在加载 liquid_glass_workbench…</p></div>
        <div ref="workbenchSlot" class="slot" />
      </section>

      <!-- antd-mobile 演示（DemoCenter 内部处理 react 前导 + ctx.runtime 注入） -->
      <DemoCenter v-else-if="active === 'antd-mobile'" />

      <!-- vant 演示（Vue remote 无前导；复用演示中心面板，初始库锁定 vant） -->
      <DemoCenter v-else-if="active === 'vant'" initial-library="vant" />
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

.nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 32px 0;
}

.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 14%);
  background: transparent;
  color: #c6cddd;
  font-size: 13px;
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

.stage {
  flex: 1;
  padding: 20px 32px 48px;
}

/* 目录卡片 */
.directory {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  border-radius: 16px;
  background: rgb(10 13 24 / 50%);
  border: 1px solid rgb(255 255 255 / 7%);
}

.card.disabled {
  opacity: 0.55;
}

.card h2 {
  margin: 0;
  font-size: 16px;
}

.card h2 small {
  opacity: 0.6;
  font-weight: 400;
}

.card p {
  margin: 0;
  font-size: 13px;
  color: #9aa3b5;
  line-height: 1.7;
  flex: 1;
}

.card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.enter {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid #7ee0c0;
  color: #7ee0c0;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
}

.card .port {
  color: #7d8699;
  font-size: 11px;
}

/* remote 舞台 */
.remote-stage {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  min-height: 640px;
}

.slot {
  min-height: 100vh;
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
