<script setup lang="ts">
/**
 * WebGL 整面凸透镜 demo（受控背景 · 纹理模式）：
 * 三种背景源（图片 / video / canvas）交叉淡化切换；
 * 滚轮驱动"滚动"——采样偏移 uniform，纹理零重传（liquidGL 零重捕获思路）；
 * 参数滑杆直接改 shader uniform，观察透镜形态谱系（bezel 0.05 窄带 → 1 整面放大镜）。
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { createLensRenderer, type LensHandle } from '../lens/lens-renderer'
import { loadImageSource, makeVideoSource, makeCanvasSource } from '../lens/lens-sources'

type SourceKind = 'image' | 'video' | 'canvas'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const renderer = shallowRef<LensHandle | null>(null)
const failed = ref(false)
const kind = ref<SourceKind>('image')
const strength = ref(34)
const bezel = ref(1)
const aberrationOn = ref(true)
const rimOn = ref(true)
const scrollY = ref(0)

// 各源的资源清理器（video 需停 track，canvas 需停动画）
let disposers: Array<() => void> = []

const disposeAll = () => {
  disposers.forEach((d) => d())
  disposers = []
}

const params = () => ({
  strength: strength.value,
  bezel: bezel.value,
  aberration: aberrationOn.value ? 0.08 : 0,
  rim: rimOn.value ? 0.5 : 0,
})

const applyParams = () => renderer.value?.setParams(params())

const switchKind = async (next: SourceKind) => {
  if (next === kind.value || !renderer.value) return
  kind.value = next
  if (next === 'image') {
    const src = await loadImageSource()
    renderer.value.setSource(src) // 旧源（video/canvas）先移交过渡槽，稍后统一清理
    disposeAll() // 交叉淡化期间旧纹理已上传 GPU，DOM 资源可释放
  } else if (next === 'video') {
    const { source, dispose } = makeVideoSource()
    renderer.value.setSource(source)
    disposeAll()
    disposers.push(dispose) // 新源存活期间保留资源
  } else {
    const { source, dispose } = makeCanvasSource()
    renderer.value.setSource(source)
    disposeAll()
    disposers.push(dispose)
  }
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  scrollY.value = scrollY.value + e.deltaY * 0.5
  renderer.value?.setScroll(0, scrollY.value)
}

onMounted(async () => {
  if (!canvasRef.value) return
  const r = createLensRenderer(canvasRef.value)
  renderer.value = r
  if (!r) {
    failed.value = true
    return
  }
  r.setParams(params())
  const src = await loadImageSource()
  r.setSource(src)
  r.start()
})

onBeforeUnmount(() => {
  disposeAll()
  renderer.value?.dispose()
  renderer.value = null
})
</script>

<template>
  <section class="lens-demo">
    <header class="head">
      <h3>WebGL 整面凸透镜 · 受控背景（纹理模式）</h3>
      <p>
        背景源为 TexImageSource（图片 / video / canvas）时像素可直接采样，不依赖
        backdrop-filter，全浏览器可用。滚轮滚动背景 = 只改采样偏移 uniform，快照零重传；
        video / canvas 源每帧 texImage2D。源切换走双纹理交叉淡化，不闪变。
      </p>
    </header>

    <div class="controls">
      <div class="seg">
        <button :class="{ on: kind === 'image' }" @click="switchKind('image')">图片</button>
        <button :class="{ on: kind === 'video' }" @click="switchKind('video')">视频</button>
        <button :class="{ on: kind === 'canvas' }" @click="switchKind('canvas')">Canvas 动画</button>
      </div>
      <label class="slider">
        强度 {{ strength }}px
        <input v-model.number="strength" type="range" min="4" max="80" step="1" @input="applyParams" />
      </label>
      <label class="slider">
        透镜 bezel {{ bezel.toFixed(2) }}
        <input v-model.number="bezel" type="range" min="0.05" max="1" step="0.05" @input="applyParams" />
      </label>
      <label class="check"><input v-model="aberrationOn" type="checkbox" @change="applyParams" />色散</label>
      <label class="check"><input v-model="rimOn" type="checkbox" @change="applyParams" />边缘高光</label>
    </div>

    <div v-if="failed" class="fallback">当前环境无 WebGL，此面板不可用。</div>
    <canvas v-else ref="canvasRef" class="lens-canvas" @wheel="onWheel"></canvas>

    <p class="tip">提示：在画布上滚动滚轮——背景流动但纹理不重传（图片源最明显，切到 video/canvas 源观察逐帧采样）。</p>
  </section>
</template>

<style scoped>
.lens-demo {
  border: 1px solid #2a2a35;
  border-radius: 12px;
  padding: 20px;
  background: #16161d;
  margin-top: 24px;
}

.head h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.head p {
  margin: 0 0 14px;
  color: #9aa0b0;
  font-size: 12.5px;
  line-height: 1.7;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
  font-size: 12.5px;
  color: #c8ccd8;
}

.seg {
  display: flex;
  border: 1px solid #3a3a48;
  border-radius: 8px;
  overflow: hidden;
}

.seg button {
  background: transparent;
  color: #c8ccd8;
  border: 0;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 12.5px;
}

.seg button.on {
  background: #4b5bdb;
  color: #fff;
}

.slider {
  display: flex;
  align-items: center;
  gap: 6px;
}

.check {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.lens-canvas {
  width: 100%;
  height: 420px;
  border-radius: 10px;
  display: block;
  cursor: ns-resize;
  touch-action: none;
}

.fallback {
  height: 200px;
  display: grid;
  place-items: center;
  color: #9aa0b0;
  border: 1px dashed #3a3a48;
  border-radius: 10px;
}

.tip {
  margin: 10px 0 0;
  color: #7d8496;
  font-size: 12px;
}
</style>
