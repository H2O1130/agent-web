<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  FileText,
  Link2,
  Target,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import JobsPicker from '../components/JobsPicker.vue'
import SkillChart from '../components/SkillChart.vue'
import { roleNames, skills } from '../data'
import { analyzeJobs } from '../planning'
import { useWorkspace } from '../store'

const store = useWorkspace()
const router = useRouter()
const route = useRoute()

const SENTENCE_SEPARATOR = /[。；;\n]/
const EDUCATION_PATTERN = /本科|大专|学历|硕士/
const EXPERIENCE_PATTERN = /项目|作品/

const tabs = [
  { key: 'skills', label: '技能与通用能力' },
  { key: 'education', label: '学历条件' },
  { key: 'experience', label: '项目经验' },
]

const selectedSkillId = ref(typeof route.query.skill === 'string' ? route.query.skill : '')
const activeTab = ref('skills')
const showJobs = ref(false)
const error = ref('')

const snapshot = computed(() => store.plans.find(plan => plan.id === route.query.plan))
const contextJobs = computed(() => {
  const saved = snapshot.value
  if (!saved) return store.selectedJobs
  return store.jobs.filter(job => saved.jobIds.includes(job.id))
})
const contextRole = computed(() => snapshot.value?.profile.role ?? store.profile.role)
const analysis = computed(() => analyzeJobs(contextJobs.value))
const active = computed(() => {
  const matched = analysis.value.find(skill => skill.id === selectedSkillId.value)
  return matched ?? analysis.value[0]
})
const mapping = computed(() => skills.find(skill => skill.id === active.value?.id))

const statements = computed(() => {
  const pattern = activeTab.value === 'education' ? EDUCATION_PATTERN : EXPERIENCE_PATTERN
  return contextJobs.value.flatMap(job =>
    job.text
      .split(SENTENCE_SEPARATOR)
      .filter(sentence => pattern.test(sentence))
      .map(sentence => ({ job, sentence })),
  )
})

const emptyTitle = computed(() =>
  contextJobs.value.length ? '暂未识别到支持的技能' : '先选择一些岗位样本',
)

const samplesLabel = computed(() => (showJobs.value ? '收起样本选择' : '管理岗位样本'))

function selectSkill(id: string): void {
  selectedSkillId.value = id
}

function meterWidth(count: number): string {
  if (!contextJobs.value.length) return '0%'
  return `${(count / contextJobs.value.length) * 100}%`
}

function companyOf(jobId: string): string | undefined {
  const job = store.jobs.find(item => item.id === jobId)
  return job?.company
}

function openSnapshot(): void {
  const current = snapshot.value
  if (!current) return
  store.activeId = current.id
  router.push('/roadmap')
}

async function generate(): Promise<void> {
  error.value = ''
  try {
    await store.generate(store.profile, store.selectedIds)
    router.push('/roadmap')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请先选择岗位样本再生成路线。'
  }
}
</script>

<template>
  <div class="page-container workspace-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">让方向有据可循</span>
        <h1>读懂岗位，再决定学什么<span class="heading-dot">.</span></h1>
        <p>把招聘原文中的能力要求，连接到课程与实践成果。</p>
      </div>

      <button v-if="!snapshot" class="button primary" :disabled="store.generating" @click="generate">
        {{ store.generating ? '正在生成…' : '生成成长路线' }}<ArrowRight :size="17" />
      </button>
      <button v-else class="button secondary" @click="openSnapshot">返回这份路线<ArrowRight :size="17" /></button>
    </div>

    <div class="workspace-toolbar">
      <span v-if="snapshot" class="tag gold-tag">{{ roleNames[contextRole] }} · 方案 V{{ snapshot.version }} 的样本</span>
      <span v-else class="tag">按选中的岗位样本分析</span>

      <button
        v-if="!snapshot"
        class="button secondary small"
        :aria-expanded="showJobs"
        @click="showJobs = !showJobs"
      >
        <FileText :size="15" />{{ samplesLabel }}<span class="count-bubble">{{ contextJobs.length }}</span>
      </button>
    </div>

    <div v-if="snapshot" class="notice-bar">
      <span>正在查看 V{{ snapshot.version }} 的岗位依据，采用这份方案保存的样本；当前画像草稿保持不变。</span>
      <RouterLink to="/analysis">分析当前样本 <ArrowRight :size="15" /></RouterLink>
    </div>

    <section v-if="showJobs && !snapshot" class="panel mb-24">
      <div class="panel-heading">
        <h2>选择与导入岗位样本</h2>
        <span class="tag">{{ contextJobs.length }} 条岗位样本</span>
      </div>
      <JobsPicker />
    </section>

    <div class="analysis-summary">
      <div>
        <span class="summary-icon"><BriefcaseBusiness :size="21" /></span>
        <span><strong>{{ contextJobs.length }} <small>条</small></strong><span>当前选中的岗位样本</span></span>
      </div>

      <div>
        <span class="summary-icon"><Target :size="21" /></span>
        <span><strong>{{ analysis.length }} <small>项</small></strong><span>识别到的能力要求</span></span>
      </div>

      <div class="summary-explanation">
        <span class="gold-text"><Check :size="16" />结论可追溯</span>
        <p>统计仅代表当前样本，每项技能保留招聘原文。</p>
      </div>
    </div>

    <div v-if="!analysis.length" class="empty-state panel">
      <FileText :size="36" />
      <h2>{{ emptyTitle }}</h2>
      <p>本地规则覆盖常见开发技能。可选择演示样本，或补充更具体的招聘要求。</p>
      <button class="button secondary" @click="showJobs = true">选择或导入样本</button>
    </div>

    <template v-else>
      <div class="analysis-layout">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">从原文提取</span>
              <h2>岗位能力清单</h2>
            </div>
            <span class="tag">当前样本统计</span>
          </div>

          <div class="tab-bar" role="tablist" aria-label="要求分类">
            <button
              v-for="item in tabs"
              :key="item.key"
              role="tab"
              :aria-selected="activeTab === item.key"
              :class="{ active: activeTab === item.key }"
              @click="activeTab = item.key"
            >{{ item.label }}</button>
          </div>

          <div v-if="activeTab === 'skills'" class="skill-stat-list">
            <button
              v-for="skill in analysis"
              :key="skill.id"
              class="skill-stat"
              :class="{ active: active?.id === skill.id }"
              @click="selectSkill(skill.id)"
            >
              <span class="skill-stat-name">
                <span class="skill-initial">{{ skill.name.slice(0, 1) }}</span>
                <strong>{{ skill.name }}</strong>
              </span>
              <span class="skill-stat-meter"><span :style="{ width: meterWidth(skill.count) }"></span></span>
              <span class="skill-stat-count">{{ skill.count }} / {{ contextJobs.length }} 条</span>
              <ArrowUpRight :size="15" />
            </button>
          </div>

          <div v-else class="evidence-list">
            <div v-for="(item, index) in statements" :key="index" class="evidence-item">
              <span class="small-label">{{ item.job.id }} · {{ item.job.company }}</span>
              <p>{{ item.sentence }}</p>
            </div>
            <p v-if="!statements.length" class="muted">当前样本未明确提及，请人工核对。</p>
          </div>

          <p class="panel-footnote">同一岗位的同一技能只计一次；出现频次与“是否必备”分别判断。</p>
        </section>

        <aside class="panel chart-panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">出现频次</span>
              <h2>样本里，反复提到什么？</h2>
            </div>
          </div>

          <SkillChart :skills="analysis" :total="contextJobs.length" />
          <p class="small-label">前 6 项能力 · {{ contextJobs.length }} 条选中样本</p>

          <div class="inline-note compact">
            <FileText :size="16" />
            <p>演示样本不代表实时市场需求。导入真实资料后，请保留来源并人工核验。</p>
          </div>
        </aside>
      </div>

      <section v-if="active && mapping" class="mapping-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">把要求变成行动</span>
            <h2>{{ active.name }}，可以怎样开始？</h2>
          </div>
          <span class="tag">点击上方技能联动查看</span>
        </div>

        <div class="mapping-flow">
          <article class="mapping-card">
            <span class="mapping-label"><BriefcaseBusiness :size="16" /> 岗位要求</span>
            <h3>{{ active.name }}</h3>
            <p>{{ active.count }} / {{ contextJobs.length }} 条样本提及</p>
            <span class="soft-tag">有招聘原文支持</span>
          </article>

          <span class="mapping-arrow"><ArrowRight :size="22" /></span>

          <article class="mapping-card">
            <span class="mapping-label"><BookOpen :size="16" /> 对应课程</span>
            <h3>{{ mapping.course }}</h3>
            <p>先理解概念，再通过练习核对掌握情况。</p>
            <span class="small-label">示例课程 · 按本校培养方案核对</span>
          </article>

          <span class="mapping-arrow"><ArrowRight :size="22" /></span>

          <article class="mapping-card highlight">
            <span class="mapping-label"><Link2 :size="16" /> 实践成果</span>
            <h3>{{ mapping.project }}</h3>
            <p>{{ mapping.outcome }}</p>
            <span class="soft-tag">可检查的学习成果</span>
          </article>
        </div>

        <div class="panel evidence-panel">
          <div class="panel-heading">
            <h3><FileText :size="18" /> 为什么建议学习它？</h3>
            <span class="small-label">{{ active.evidence.length }} 处原文依据</span>
          </div>

          <div class="evidence-grid">
            <article v-for="(evidence, index) in active.evidence" :key="index" class="evidence-item">
              <div>
                <span class="small-label">{{ evidence.jobId }} · {{ companyOf(evidence.jobId) }}</span>
                <span class="tag" :class="{ 'gold-tag': evidence.kind === '明确要求' }">{{ evidence.kind }}</span>
              </div>
              <p>“{{ evidence.sentence }}”</p>
            </article>
          </div>
        </div>
      </section>
    </template>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
