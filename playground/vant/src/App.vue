<script setup lang="ts">
import { ref } from "vue";
import { NavBar, Tabbar, TabbarItem, Switch, Button, Popup, ActionSheet } from "vant";
import { showToast, showDialog } from "vant";
import { GlassSurface } from "@et4proj/liquid-glass-vue";

/**
 * vant 演示页（产品代码视角：对 liquid-glass 零感知——
 * 不写 data-glass、不调任何 glass API，玻璃化完全由 adapter manifest 接管）。
 * 唯一直接引用是 GlassSurface 演示卡（vue 绑定层，与 antd demo 的 React 绑定层卡对等）。
 */
const tab = ref(0);
const switchOn = ref(true);
const popupVisible = ref(false);
const sheetVisible = ref(false);

const tabs = [
  { icon: "apps-o", title: "画廊" },
  { icon: "orders-o", title: "文件" },
  { icon: "user-o", title: "我的" },
  { icon: "setting-o", title: "设置" },
];

const sheetActions = [
  { name: "玻璃 ActionSheet", subname: "挂 body 的弹层" },
  { name: "第二项" },
];
</script>

<template>
  <div class="demo-shell">
    <NavBar title="液态玻璃 · vant" />

    <main class="demo-body">
      <div class="demo-hero">
        <h2>无需改一行组件代码</h2>
        <p>
          本页全部 vant 组件未做任何 glass 相关修改；玻璃化由 adapter manifest（类名映射 +
          CSS 补丁）在运行时接管。
        </p>
      </div>

      <!-- vue 绑定层演示卡：GlassSurface 声明式表面 -->
      <GlassSurface role="card" class="demo-card">
        <h3>GlassSurface（vue 绑定层）</h3>
        <p>声明式表面：role="card"，由 useGlassSurface 注册。</p>
      </GlassSurface>

      <div class="demo-card">
        <h3>交互组件</h3>
        <div class="demo-row">
          <span>Switch（interactive 声明激活）</span>
          <Switch v-model="switchOn" />
        </div>
        <div class="demo-actions">
          <Button
            block
            type="primary"
            @click="showDialog({ title: '玻璃 Dialog', message: '挂 body 的弹层：--glass-* 变量挂元素自身，继承不断链。' })"
          >
            打开 Dialog
          </Button>
          <Button block type="primary" @click="popupVisible = true">打开 Popup</Button>
          <Button block type="primary" @click="sheetVisible = true">打开 ActionSheet</Button>
          <Button block type="primary" @click="showToast('玻璃 Toast')">打开 Toast</Button>
        </div>
      </div>
    </main>

    <Popup v-model:show="popupVisible" position="bottom" :style="{ height: '38vh' }">
      <div class="demo-popup-body">
        <h3>底部 Popup</h3>
        <p>弹层内容 — 检查 .van-popup 是否获得玻璃材质。</p>
      </div>
    </Popup>

    <ActionSheet
      v-model:show="sheetVisible"
      :actions="sheetActions"
      cancel-text="取消"
      close-on-click-action
    />

    <div class="demo-tabbar">
      <Tabbar :fixed="false" v-model="tab">
        <TabbarItem v-for="t in tabs" :key="t.title" :icon="t.icon">
          {{ t.title }}
        </TabbarItem>
      </Tabbar>
    </div>
  </div>
</template>
