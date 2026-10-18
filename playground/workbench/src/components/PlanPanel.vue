<script setup lang="ts">
import { computed } from 'vue'
import type { RenderPlan } from '@et4proj/liquid-glass-core'

/**
 * RenderPlan 面板：展示 resolve 的完整输出——档位、token 数值、降级原因链。
 * 对应架构 §5.4 调试诉求（线上降级排查）与 §6 的 glass.debug.explain 雏形。
 */

const props = defineProps<{
  plan: RenderPlan
  title: string
}>()

const tokenRows = computed(() => {
  // token v2：material 通道形状冻结；refraction/motion 通道另列
  const t = props.plan.tokens.material
  const ref = props.plan.tokens.refraction
  const motion = props.plan.tokens.motion
  const rows: [string, string][] = [
    ['blur', `${t.blur.toFixed(1)}px`],
    ['saturation', t.saturation.toFixed(2)],
    ['highlight', t.highlight.toFixed(2)],
    ['refraction', t.refraction.toFixed(2)],
    ['radius', `${t.radius}px`],
    ['tint', t.tint],
    ['border', t.border],
    ['shadow', t.shadow],
  ]
  if (ref) {
    rows.push(
      ['refraction.strength', ref.strength.toFixed(2)],
      ['refraction.ior', (ref.ior ?? 1.5).toFixed(2)],
      ['refraction.bezelWidth', (ref.bezelWidth ?? 0.18).toFixed(2)],
    )
  }
  if (motion) {
    rows.push(
      ['motion.attraction', (motion.attraction ?? 0.4).toFixed(2)],
      ['motion.maxStretch', (motion.maxStretch ?? 0.35).toFixed(2)],
    )
  }
  return rows
})
</script>

<template>
  <div class="plan">
    <div class="head">
      <span class="title">{{ title }}</span>
      <span class="interactive" :class="{ on: plan.interactive }">
        interactive: {{ plan.interactive }}
      </span>
    </div>

    <table class="tokens">
      <tr v-for="[key, value] in tokenRows" :key="key">
        <td class="key">{{ key }}</td>
        <td class="val">{{ value }}</td>
      </tr>
    </table>
  </div>
</template>

<style scoped>
.plan {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgb(15 18 32 / 85%);
  border: 1px solid rgb(255 255 255 / 8%);
  font-size: 12px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.title {
  font-weight: 700;
  color: #c6cddd;
  font-size: 13px;
}

.interactive {
  font-family: ui-monospace, monospace;
  color: #f87171;
}

.interactive.on {
  color: #4ade80;
}

.tokens {
  width: 100%;
  border-collapse: collapse;
}

.tokens td {
  padding: 3px 0;
  border-bottom: 1px dashed rgb(255 255 255 / 6%);
}

.tokens tr:last-child td {
  border-bottom: none;
}

.key {
  color: #9aa3b5;
  font-family: ui-monospace, monospace;
  width: 40%;
  padding-right: 8px !important;
}

.val {
  color: #e8eaf2;
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
</style>
