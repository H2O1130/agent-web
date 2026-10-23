<script setup lang="ts">
import { ArrowRight, Compass } from '@lucide/vue'
</script>

<template>
  <div class="page-container workspace-page">
    <section class="empty-state panel">
      <Compass :size="45" />
      <span class="eyebrow">404 · 暂时偏离了路线</span>
      <h1>这个页面还没有路径</h1>
      <p>返回首页，继续规划你的下一步。</p>
      <RouterLink to="/" class="button primary">返回首页 <ArrowRight :size="17" /></RouterLink>
    </section>
  </div>
</template>
