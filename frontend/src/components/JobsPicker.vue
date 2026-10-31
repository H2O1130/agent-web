<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Check, ChevronDown, FileText, Plus, X } from '@lucide/vue'
import { useWorkspace } from '../store'
import { hasPlanTemplate, isPlannableJob, jobRoleNames } from '../data'
import type { Job, JobRole } from '../types'

const store = useWorkspace()

const category = ref<JobRole | 'all'>('all')
const categories = Object.entries(jobRoleNames) as [JobRole, string][]
const catalogJobs = computed(() => store.jobs.filter(job =>
  job.source === 'collected' || job.source === 'imported' || isLegacySelection(job),
))
const available = computed(() => catalogJobs.value.filter(job => category.value === 'all' || job.role === category.value))
const selectable = computed(() => available.value)
const allSelected = computed(() =>
  selectable.value.length > 0 && selectable.value.every(job => store.selectedIds.includes(job.id)),
)

const selectionLabel = computed(() =>
  allSelected.value ? '取消全选' : '选择全部',
)

const expanded = ref('')
const importing = ref(false)
const title = ref('')
const text = ref('')
const url = ref('')
const date = ref('')
const error = ref('')

function addJob(): void {
  if (!text.value.trim()) {
    error.value = '请粘贴招聘要求原文。'
    return
  }

  if (url.value && !/^https?:\/\//i.test(url.value)) {
    error.value = '来源链接需以 https:// 或 http:// 开头。'
    return
  }

  const id = `import-${crypto.randomUUID()}`
  store.jobs.push({
    id,
    role: /python|后端|服务端|backend/i.test(`${title.value} ${text.value}`) ? 'backend' : 'frontend',
    title: title.value.trim() || '导入的岗位',
    company: '用户导入',
    education: '见原文',
    text: text.value.trim(),
    source: 'imported',
    url: url.value.trim(),
    collectedAt: date.value,
  })
  store.selectedIds.push(id)
  category.value = 'all'
  resetForm()
}

function resetForm(): void {
  importing.value = false
  title.value = ''
  text.value = ''
  url.value = ''
  date.value = ''
  error.value = ''
}

function selectAll(): void {
  const ids = selectable.value.map(job => job.id)
  if (!ids.length) return

  if (allSelected.value) {
    store.selectedIds = store.selectedIds.filter(id => !ids.includes(id))
    return
  }

  store.selectedIds = [...new Set([...store.selectedIds, ...ids])]
}

function isSelected(job: Job): boolean {
  return store.selectedIds.includes(job.id)
}

function isLegacySelection(job: Job): boolean {
  return job.source === 'demo' && store.selectedIds.includes(job.id)
}

function toggleSelection(job: Job, event: Event): void {
  const input = event.target as HTMLInputElement
  if (job.source === 'demo') {
    store.selectedIds = store.selectedIds.filter(id => id !== job.id)
    input.checked = false
    return
  }
  store.selectedIds = input.checked
    ? [...new Set([...store.selectedIds, job.id])]
    : store.selectedIds.filter(id => id !== job.id)
}

function templateNote(job: Job): string {
  if (job.source === 'demo') return ''
  if (hasPlanTemplate(job.role)) return ''
  return `可以选作分析样本：${jobRoleNames[job.role]}方向暂时还没有路线模板。`
}

function acceptsMultipleLanguages(job: Job): boolean {
  return job.source === 'collected' && job.role === 'backend' &&
    isPlannableJob(job) && !/python/i.test(job.title)
}

function toggleExpanded(id: string): void {
  expanded.value = expanded.value === id ? '' : id
}
</script>

<template>
  <div class="jobs-picker">
    <label class="field catalog-filter">
      岗位分类
      <select v-model="category" aria-label="岗位分类">
        <option value="all">全部分类</option>
        <option v-for="[key, name] in categories" :key="key" :value="key">{{ name }}</option>
      </select>
    </label>

    <div class="picker-toolbar">
      <span class="catalog-counts" aria-live="polite">
        <span>岗位总数 <strong>{{ catalogJobs.length }}</strong> 条</span>
        <span>当前显示 <strong>{{ available.length }}</strong> 条</span>
        <span>当前规划选中 <strong>{{ store.selectedJobs.length }}</strong> 条</span>
      </span>

      <div>
        <button type="button" class="text-button" :disabled="!selectable.length" @click="selectAll">{{ selectionLabel }}</button>
        <button type="button" class="button small secondary" @click="importing = !importing">
          <Plus :size="15" />导入岗位
        </button>
      </div>
    </div>

    <div v-if="importing" class="import-form" role="group" aria-label="导入岗位表单">
      <div class="section-heading">
        <h3>导入岗位原文</h3>
        <button type="button" class="icon-button" aria-label="收起导入表单" @click="importing = false">
          <X :size="19" />
        </button>
      </div>

      <label class="field">岗位名称<input v-model="title" placeholder="例如：前端开发实习生" /></label>

      <label class="field">
        招聘要求原文 <span class="required">必填</span>
        <textarea v-model="text" rows="4" placeholder="粘贴岗位要求，保留原始表述，以便核对证据。" />
      </label>

      <div class="form-grid">
        <label class="field">来源链接（选填）<input v-model="url" type="url" placeholder="https://" /></label>
        <label class="field">采集日期（选填）<input v-model="date" type="date" /></label>
      </div>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button type="button" class="button primary small" @click="addJob">添加并选中</button>
    </div>

    <div class="job-list">
      <article
        v-for="job in available"
        :key="job.id"
        class="job-card"
        :class="{ 'is-selected': isSelected(job) }"
      >
        <div class="job-card-top">
          <label class="job-select">
            <input
              type="checkbox"
              :value="job.id"
              :checked="isSelected(job)"
              :aria-label="`选择 ${job.title} ${job.company}`"
              :aria-describedby="templateNote(job) ? `job-availability-${job.id}` : undefined"
              @change="toggleSelection(job, $event)"
            />
            <span class="job-check">
              <Check v-if="isSelected(job)" :size="14" />
            </span>
            <span>
              <strong>{{ job.title }}</strong>
              <span class="job-meta">{{ jobRoleNames[job.role] }} <span>·</span> {{ job.company }} <span>·</span> {{ job.education }}</span>
            </span>
          </label>

          <span
            class="tag"
            :class="{ 'gold-tag': job.source === 'imported' }"
          >{{ job.source === 'collected' ? `真实采集 · ${job.platform || '牛客'}` : job.source === 'demo' ? '历史演示样本' : '用户导入，待核验' }}</span>
        </div>

        <p v-if="job.source === 'demo'" class="job-planning-note">
          保留旧计划的演示样本，取消选择后不再显示。
        </p>
        <p v-if="acceptsMultipleLanguages(job)" class="job-planning-note">
          接受 Python，多语言岗位；原文允许从多种语言中选择。
        </p>
        <p v-if="templateNote(job)" :id="`job-availability-${job.id}`" class="job-planning-note">
          {{ templateNote(job) }}
        </p>

        <button
          type="button"
          class="job-expand"
          :aria-expanded="expanded === job.id"
          @click="toggleExpanded(job.id)"
        >
          <FileText :size="14" />{{ expanded === job.id ? '收起原文' : '查看招聘原文' }}
          <ChevronDown :size="15" :class="{ rotated: expanded === job.id }" />
        </button>

        <div v-if="expanded === job.id" class="job-original">
          <p class="job-requirements">{{ job.text }}</p>
          <dl class="job-facts">
            <div v-if="job.city"><dt>城市</dt><dd>{{ job.city }}</dd></div>
            <div v-if="job.salary"><dt>薪资</dt><dd>{{ job.salary }}</dd></div>
            <div v-if="job.experience"><dt>经验</dt><dd>{{ job.experience }}</dd></div>
            <div v-if="job.recruitmentType"><dt>招聘类型</dt><dd>{{ job.recruitmentType }}</dd></div>
            <div v-if="job.deadline"><dt>原页截止日期</dt><dd>{{ job.deadline }}</dd></div>
            <div v-if="job.recruitmentStatus"><dt>采集时状态</dt><dd>{{ job.recruitmentStatus }}</dd></div>
          </dl>
          <div v-if="job.responsibilities" class="job-summary">
            <strong>职责摘要 · 采集者概述，非原文证据</strong>
            <p>{{ job.responsibilities }}</p>
          </div>
          <a v-if="job.url" :href="job.url" target="_blank" rel="noopener noreferrer">
            {{ job.source === 'collected' ? `查看${job.platform || '牛客'}招聘原页` : job.source === 'demo' ? '查看历史样本来源' : '查看用户提供的来源' }} <ArrowUpRight :size="14" />
          </a>
          <p v-if="job.collectedAt" class="small-label">采集日期：{{ job.collectedAt }}</p>
          <p v-if="job.source === 'demo'" class="small-label">教学演示数据，用于核对旧方案，不代表真实企业招聘。</p>
          <div v-if="job.dataNotes?.length" class="job-data-notes">
            <strong>采集备注</strong>
            <ul><li v-for="(note, index) in job.dataNotes" :key="index">{{ note }}</li></ul>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.catalog-filter {
  max-width: 320px;
  margin-bottom: 16px;
}

.catalog-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  line-height: 1.8;
}

.picker-toolbar,
.picker-toolbar > div {
  flex-wrap: wrap;
}

.job-select > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.job-select:has(input:disabled) {
  cursor: default;
}

.job-select input:disabled + .job-check {
  background: var(--surface-alt, #f5f3ed);
  border-color: var(--border);
}

.job-planning-note {
  margin: 10px 0 0 26px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.job-requirements {
  white-space: pre-wrap;
}

.job-facts {
  display: grid;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--muted);
}

.job-facts > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.job-facts dt {
  min-width: 84px;
}

.job-facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.job-summary,
.job-data-notes {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.job-data-notes ul {
  padding-left: 18px;
  margin: 6px 0 0;
}
</style>
