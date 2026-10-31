<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Check, ChevronDown, FileText, Plus, X } from '@lucide/vue'
import { useWorkspace } from '../store'

const store = useWorkspace()

const available = computed(() => store.jobs)
const selectionLabel = computed(() =>
  store.selectedJobs.length === available.value.length ? '取消全选' : '选择全部',
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
  const ids = available.value.map(job => job.id)
  const allSelected = store.selectedJobs.length === ids.length

  if (allSelected) {
    store.selectedIds = store.selectedIds.filter(id => !ids.includes(id))
    return
  }

  store.selectedIds = [...new Set([...store.selectedIds, ...ids])]
}

function toggleExpanded(id: string): void {
  expanded.value = expanded.value === id ? '' : id
}
</script>

<template>
  <div class="jobs-picker">
    <div class="picker-toolbar">
      <span><strong>{{ store.selectedJobs.length }}</strong> / {{ available.length }} 条样本已选择</span>

      <div>
        <button type="button" class="text-button" @click="selectAll">{{ selectionLabel }}</button>
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
        :class="{ 'is-selected': store.selectedIds.includes(job.id) }"
      >
        <div class="job-card-top">
          <label class="job-select">
            <input
              v-model="store.selectedIds"
              type="checkbox"
              :value="job.id"
              :aria-label="`选择 ${job.title} ${job.company}`"
            />
            <span class="job-check">
              <Check v-if="store.selectedIds.includes(job.id)" :size="14" />
            </span>
            <span>
              <strong>{{ job.title }}</strong>
              <span class="job-meta">{{ job.company }} <span>·</span> {{ job.education }}</span>
            </span>
          </label>

          <span
            class="tag"
            :class="{ 'gold-tag': job.source === 'imported' }"
          >{{ job.source === 'demo' ? '演示样本' : '用户导入，待核验' }}</span>
        </div>

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
          <p>{{ job.text }}</p>
          <a v-if="job.url" :href="job.url" target="_blank" rel="noopener noreferrer">
            查看用户提供的来源 <ArrowUpRight :size="14" />
          </a>
          <p v-if="job.collectedAt" class="small-label">采集日期：{{ job.collectedAt }}</p>
          <p v-if="job.source === 'demo'" class="small-label">教学演示样本，无真实企业来源与采集日期。</p>
        </div>
      </article>
    </div>
  </div>
</template>
