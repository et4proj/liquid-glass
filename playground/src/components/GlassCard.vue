<script setup lang="ts">
import { computed } from 'vue'
import type { RenderPlan, Tier } from '@et4proj/liquid-glass-core'

/**
 * 玻璃卡片：把 MaterialTokens 映射为 --glass-* CSS 变量并渲染真实玻璃效果。
 * 这是 M1 CSS 后端（token → 内联样式）思路的预演。
 */

const props = defineProps<{
  plan: RenderPlan
  label: string
  /** 内容形态：bar / card / control，展示不同 role 的典型外观 */
  variant?: 'bar' | 'card' | 'control'
}>()

const tierColor: Record<Tier, string> = {
  none: '#6b7280',
  solid: '#9ca3af',
  css: '#22c55e',
  svg: '#3b82f6',
  webgl: '#8b5cf6',
  native: '#f59e0b',
}

/** token → CSS 变量（与架构 §4.1 一一对应；token v2：消费 material 通道） */
const cssVars = computed<Record<string, string>>(() => {
  const t = props.plan.tokens.material
  return {
    '--glass-blur': `${t.blur}px`,
    '--glass-saturation': String(t.saturation),
    '--glass-tint': t.tint,
    '--glass-border': t.border,
    '--glass-highlight': String(t.highlight),
    '--glass-shadow': t.shadow,
    '--glass-refraction': String(t.refraction),
    '--glass-radius': `${t.radius}px`,
  }
})
</script>

<template>
  <div class="glass-card" :class="`variant-${variant ?? 'card'}`" :style="cssVars">
    <!-- 玻璃主体：半透明底 + backdrop-filter + 边缘高光 -->
    <div class="glass">
      <slot />
    </div>

    <!-- 档位徽章与降级原因 -->
    <div class="meta">
      <span class="label">{{ label }}</span>
      <span class="tier" :style="{ color: tierColor[plan.tier] }">{{ plan.tier }}</span>
      <span
        v-for="reason in plan.reasons"
        :key="reason"
        class="reason"
        :class="reason.split(':')[0]"
      >{{ reason }}</span>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.glass {
  position: relative;
  border-radius: var(--glass-radius);
  background: var(--glass-tint);
  border: 1px solid var(--glass-border);
  box-shadow:
    var(--glass-shadow),
    /* 顶部高光，强度随 --glass-highlight */
    inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-highlight) * 0.7)),
    inset 0 -1px 0 rgba(255, 255, 255, calc(var(--glass-highlight) * 0.25));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
  overflow: hidden;
  transition: background 0.25s, box-shadow 0.25s;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 22px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

/* 顶部斜向高光渐变（iOS 玻璃质感的关键一环） */
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, calc(var(--glass-highlight) * 0.22)) 0%,
    transparent 42%
  );
  pointer-events: none;
}

/* bar 形态：胶囊 */
.variant-bar .glass {
  border-radius: 999px;
  padding: 12px 28px;
}

/* control 形态：小圆角控件 */
.variant-control .glass {
  border-radius: 14px;
  min-height: 48px;
  padding: 10px 18px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9aa3b5;
}

.label {
  font-weight: 600;
  color: #c6cddd;
}

.tier {
  font-weight: 700;
  font-family: ui-monospace, monospace;
  padding: 1px 8px;
  border: 1px solid currentColor;
  border-radius: 4px;
}

.reason {
  font-family: ui-monospace, monospace;
  padding: 1px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.07);
}

.reason.ok {
  color: #4ade80;
}

.reason.a11y {
  color: #f87171;
}

.reason.rule {
  color: #fbbf24;
}

.reason.cap {
  color: #fb923c;
}

.reason.budget {
  color: #c084fc;
}

.reason.role,
.reason.surface {
  color: #60a5fa;
}
</style>
