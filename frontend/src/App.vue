<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUpRight, Compass, KeyRound, Menu, X } from '@lucide/vue'
import { remotePlanEnabled, requestLlmStatus } from './api'
import LlmSettingsDialog from './components/LlmSettingsDialog.vue'
import { llmSettingsOpen, llmReady, closeLlmSettings, openLlmSettings, setServerLlm } from './llm'
import { useWorkspace } from './store'

interface NavItem {
  path: string
  label: string
}

const navItems: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/analysis', label: '岗位洞察' },
  { path: '/roadmap', label: '我的路线' },
  { path: '/history', label: '历史计划' },
]

const route = useRoute()
const store = useWorkspace()

const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement>()
const mobileMenu = ref<HTMLElement>()
const main = ref<HTMLElement>()

const settingsButton = ref<HTMLButtonElement>()

onMounted(async () => {
  if (!remotePlanEnabled()) return
  try {
    setServerLlm(await requestLlmStatus())
  } catch {
    // 后端没起来时不打扰用户，页面里会有对应提示
  }
})

const mobileNavItems = computed<NavItem[]>(() => [
  ...navItems,
  { path: '/plan', label: '开始规划' },
])

watch(
  () => route.path,
  () => {
    menuOpen.value = false
  },
)

function openSettings(): void {
  openLlmSettings()
}

async function closeSettings(): Promise<void> {
  closeLlmSettings()
  await nextTick()
  settingsButton.value?.focus()
}

function skipToMain(): void {
  main.value?.focus()
  main.value?.scrollIntoView()
}

async function toggleMenu(): Promise<void> {
  menuOpen.value = !menuOpen.value
  await nextTick()

  if (!menuOpen.value) {
    menuButton.value?.focus()
    return
  }

  mobileMenu.value?.querySelector<HTMLAnchorElement>('a')?.focus()
}

function closeMenuOnEscape(): void {
  if (!menuOpen.value) return
  toggleMenu()
}

function menuKeys(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    toggleMenu()
    return
  }

  if (event.key !== 'Tab') return

  const links = mobileMenu.value?.querySelectorAll<HTMLAnchorElement>('a')
  if (!links || links.length === 0) return

  const firstLink = links[0]
  const lastLink = links[links.length - 1]
  const leavesBackward = event.shiftKey && document.activeElement === firstLink
  const leavesForward = !event.shiftKey && document.activeElement === lastLink
  if (!leavesBackward && !leavesForward) return

  event.preventDefault()
  menuButton.value?.focus()
}
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="skipToMain">跳到主要内容</a>

  <header class="site-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" aria-label="学途 PathPilot 首页">
        <span class="brand-symbol"><Compass :size="24" :stroke-width="1.7" /></span>
        <span>学途<span class="brand-english">PathPilot</span></span>
      </RouterLink>

      <nav class="desktop-nav" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path">{{ item.label }}</RouterLink>
      </nav>

      <div class="header-actions">
        <span class="demo-badge" :class="{ 'is-live': llmReady }">
          <span></span>{{ llmReady ? '已接入模型' : '演示模式' }}
        </span>
        <button
          ref="settingsButton"
          class="icon-button"
          aria-label="模型设置"
          title="模型设置"
          @click="openSettings"
        >
          <KeyRound :size="20" />
        </button>
        <RouterLink to="/plan" class="header-cta">开始规划 <ArrowUpRight :size="16" /></RouterLink>

        <button
          ref="menuButton"
          class="icon-button menu-toggle"
          :aria-expanded="menuOpen"
          aria-controls="mobile-navigation"
          :aria-label="menuOpen ? '关闭导航菜单' : '打开导航菜单'"
          @click="toggleMenu"
          @keydown.esc="closeMenuOnEscape"
        >
          <X v-if="menuOpen" :size="22" />
          <Menu v-else :size="22" />
        </button>
      </div>
    </div>

    <nav
      v-if="menuOpen"
      id="mobile-navigation"
      ref="mobileMenu"
      class="mobile-nav"
      aria-label="手机导航"
      @keydown="menuKeys"
    >
      <RouterLink
        v-for="item in mobileNavItems"
        :key="item.path"
        :to="item.path"
      >{{ item.label }}<ArrowUpRight :size="16" /></RouterLink>
    </nav>
  </header>

  <div v-if="store.storageWarning" class="storage-warning" role="status">
    <span>{{ store.storageWarning }}</span>
    <button class="text-button" @click="store.reset">重置本地记录</button>
  </div>

  <main id="main" ref="main" tabindex="-1">
    <RouterView />
  </main>

  <LlmSettingsDialog :open="llmSettingsOpen" @close="closeSettings" />

  <footer class="site-footer">
    <div>
      <RouterLink to="/" class="footer-brand"><Compass :size="18" /> 学途 PathPilot</RouterLink>
      <span>让学习有方向，让成长有依据。</span>
    </div>
    <span>本地样本与规则演示</span>
  </footer>
</template>
