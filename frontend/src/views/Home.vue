<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Compass, GitBranch, Route } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useWorkspace } from '../store'

interface ProcessStep {
  icon: typeof Compass
  label: string
  text: string
}

const store = useWorkspace()
const router = useRouter()

const ctaLabel = computed(() => (store.hasDraft ? '继续我的规划' : '开始我的规划'))

const steps: ProcessStep[] = [
  {
    icon: BriefcaseBusiness,
    label: '读懂岗位要求',
    text: '从招聘样本中，看见真正需要的能力。',
  },
  {
    icon: BookOpen,
    label: '连接课程与实践',
    text: '把专业所学，变成能展示的作品。',
  },
  {
    icon: Route,
    label: '规划每个学期',
    text: '结合你的基础，安排能完成的行动。',
  },
  {
    icon: GitBranch,
    label: '跟着变化调整',
    text: '目标或时间变了，成长路线也能改变。',
  },
]

function loadDemoProfile(): void {
  store.loadDemo()
  router.push('/plan')
}
</script>

<template>
  <div class="home-page">
    <section class="hero page-container">
      <div class="hero-eyebrow">
        <span class="tiny-line"></span>
        岗位需求 × 大学成长
        <span class="tiny-line"></span>
      </div>

      <div class="hero-compass">
        <Compass :size="42" :stroke-width="1.35" />
        <span class="compass-spark"></span>
      </div>

      <h1>
        从岗位要求出发，<br />规划大学<span class="gold-text hero-emphasis">每一步<svg viewBox="0 0 245 14" aria-hidden="true">
          <path d="M3 10Q112 0 240 7" />
        </svg></span>。
      </h1>

      <div class="hero-actions">
        <RouterLink to="/plan" class="button primary large">{{ ctaLabel }}<ArrowRight :size="19" /></RouterLink>
        <button class="button secondary large" @click="loadDemoProfile">载入演示画像<ArrowUpRight :size="18" /></button>
      </div>
    </section>

    <section class="page-container home-process" aria-labelledby="process-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">一条有依据的成长路径</span>
          <h2 id="process-title">从岗位要求，到你的下一步</h2>
        </div>
        <RouterLink to="/analysis" class="subtle-link">查看岗位依据 <ArrowUpRight :size="16" /></RouterLink>
      </div>

      <div class="process-grid">
        <article v-for="(item, index) in steps" :key="item.label" class="process-item">
          <div class="process-icon">
            <component :is="item.icon" :size="23" :stroke-width="1.5" />
          </div>
          <span class="step-number">0{{ index + 1 }}</span>
          <h3>{{ item.label }}</h3>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
