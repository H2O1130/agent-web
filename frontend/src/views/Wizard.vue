<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Clock,
  Target,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import ChoiceCard from '../components/ChoiceCard.vue'
import JobsPicker from '../components/JobsPicker.vue'
import { clone } from '../clone'
import { defaultJobIds, defaultProfile, pathNames, scoreLabels, skills } from '../data'
import { useWorkspace } from '../store'
import type { ScoreKey } from '../types'

const store = useWorkspace()
const router = useRouter()

const stepNames = [
  '专业与学期',
  '技能基础',
  '可投入时间',
  '路径与兴趣',
  '岗位与确认',
]

const stepTitles = [
  '先从现在的你开始',
  '给现在的自己一个坐标',
  '每周，留多少时间给成长？',
  '找到适合你的发展节奏',
  '让规划，从岗位依据开始',
]

const stepDescriptions = [
  '课程与年级，帮助我们找到适合的起点。',
  '基于真实经历自评，不确定的地方可以留白。',
  '安排能完成的行动，比排满一张计划表更重要。',
  '方向没有标准答案，之后也可以随时调整。',
  '选择分析样本，最后核对一下你的规划条件。',
]

const interestOptions = ['技术实现', '研究分析', '创意设计', '沟通表达', '组织协作', '动手实践']
const hoursPresets = [6, 12, 18]
const ratings = Object.entries(scoreLabels) as [ScoreKey, string][]

const error = ref('')
const heading = ref<HTMLElement>()
const transition = ref(false)

const stepTitle = computed(() => stepTitles[store.step - 1])
const stepDescription = computed(() => stepDescriptions[store.step - 1])
const nextLabel = computed(() => (store.step === 5 ? '分析岗位并生成路线' : '下一步'))
const pickableSkills = computed(() => skills.filter(skill => skill.id !== 'communication'))
const interestHint = computed(() =>
  store.profile.interests.length === 3 ? ' · 已达上限，取消一项后可替换' : ' · 也可以暂时留空',
)
const pausedHint = computed(() =>
  store.profile.hours === 0 ? '当前会生成暂停课外任务的方案。' : '',
)

watch(
  () => store.profile,
  () => {
    store.hasDraft = true
  },
  { deep: true },
)

function toggleInterest(interest: string): void {
  const current = store.profile.interests

  if (current.includes(interest)) {
    current.splice(current.indexOf(interest), 1)
    return
  }

  if (current.length < 3) current.push(interest)
}

async function focusHeading(): Promise<void> {
  await nextTick()
  heading.value?.focus()
}

function gradeLabel(semester: number): string {
  if (semester <= 2) return '大一'
  if (semester <= 4) return '大二'
  if (semester <= 6) return '大三'
  return '大四'
}

function pathDescription(key: string): string {
  if (key === 'graduate') return '为备考留出稳定时间，再安排拓展'
  if (key === 'undecided') return '先探索兴趣和能力，保留调整空间'
  return '优先积累岗位能力与项目成果'
}

function scoreText(key: ScoreKey): string {
  const score = store.profile.scores[key]
  return score === null ? '待确认' : `${score} / 10`
}

function scoreAriaText(key: ScoreKey): string {
  const score = store.profile.scores[key]
  return score === null ? '尚未自评' : `${score} 分，本人自评`
}

function updateScore(key: ScoreKey, event: Event): void {
  const target = event.target as HTMLInputElement
  store.profile.scores[key] = target.valueAsNumber
}

function clearScore(key: ScoreKey): void {
  store.profile.scores[key] = null
}

function validateStep(): string {
  if (store.step === 1 && !store.profile.major.trim()) return '请填写或选择你的专业。'

  if (store.step === 3) {
    const hours = store.profile.hours
    const valid = Number.isFinite(hours) && hours >= 0 && hours <= 30
    if (!valid) return '每周时间应为 0—30 小时，请检查输入。'
  }

  if (store.step === 5 && store.selectedJobs.length === 0) return '请至少选择一条岗位样本。'

  return ''
}

function selectStep(index: number): void {
  store.step = index + 1
  transition.value = false
  focusHeading()
}

function openJobSamples(): void {
  transition.value = false
  store.step = 5
  focusHeading()
}

function goBack(): void {
  store.step -= 1
  error.value = ''
  focusHeading()
}

async function submitPlan(): Promise<void> {
  try {
    await store.generate(store.profile, store.selectedIds)
    router.push('/roadmap')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查填写内容后重试。'
  }
}

async function next(): Promise<void> {
  error.value = validateStep()
  if (error.value) return

  store.hasDraft = true

  if (store.step === 4) {
    transition.value = true
    await focusHeading()
    return
  }

  if (store.step < 5) {
    store.step += 1
    await focusHeading()
    return
  }

  await submitPlan()
}

function restart(): void {
  const confirmed = window.confirm('重新填写画像？已保存的历史方案会保留。')
  if (!confirmed) return

  store.profile = clone(defaultProfile)
  store.selectedIds = defaultJobIds('frontend', store.jobs)
  store.step = 1
  transition.value = false
  error.value = ''
}
</script>

<template>
  <div class="wizard-page page-container narrow">
    <div class="wizard-topline">
      <RouterLink to="/" class="back-link"><ArrowLeft :size="15" /> 返回首页</RouterLink>
      <button class="text-button muted" @click="restart">重新填写</button>
    </div>

    <div class="stepper-desktop" aria-label="规划步骤">
      <button
        v-for="(name, index) in stepNames"
        :key="name"
        :disabled="index + 1 > store.step"
        :class="{ current: index + 1 === store.step, complete: index + 1 < store.step }"
        :aria-current="index + 1 === store.step ? 'step' : undefined"
        @click="selectStep(index)"
      >
        <span>
          <Check v-if="index + 1 < store.step" :size="15" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <small>{{ name }}</small>
      </button>
    </div>

    <div class="stepper-mobile">
      <span>第 {{ store.step }} / 5 步 <strong>{{ stepNames[store.step - 1] }}</strong></span>
      <progress :value="store.step" max="5" aria-label="填写进度" />
    </div>

    <section v-if="transition" class="phase-complete">
      <div class="phase-icon">
        <CircleCheck :size="48" :stroke-width="1.25" />
      </div>
      <span class="eyebrow">已经找到你的起点</span>
      <h1 ref="heading" tabindex="-1">基础画像已完成</h1>
      <p>接下来，选择几条招聘样本，<br />让每一项成长建议都有岗位依据。</p>
      <div class="phase-summary">
        <span><Clock :size="16" />每周 {{ store.profile.hours }} 小时</span>
      </div>
      <button class="button primary large" @click="openJobSamples">继续选择岗位样本 <ArrowRight :size="18" /></button>
    </section>

    <section v-else>
      <div class="wizard-heading">
        <span class="eyebrow">认识自己，也认识目标</span>
        <h1 ref="heading" tabindex="-1">{{ stepTitle }}</h1>
        <p>{{ stepDescription }}</p>
      </div>

      <form @submit.prevent="next">
        <div v-if="store.step === 1" class="wizard-fields">
          <label class="field">
            你的专业
            <input v-model="store.profile.major" list="majors" autocomplete="off" placeholder="填写你的专业" required />
            <datalist id="majors">
              <option>计算机科学与技术</option>
              <option>软件工程</option>
              <option>数据科学与大数据技术</option>
              <option>人工智能</option>
              <option>网络工程</option>
            </datalist>
          </label>

          <fieldset class="field">
            <legend>当前学期</legend>
            <div class="semester-options">
              <ChoiceCard
                v-for="n in 8"
                :key="n"
                :label="`第 ${n} 学期`"
                :description="gradeLabel(n)"
                name="semester"
                :selected="store.profile.semester === n"
                @choose="store.profile.semester = n"
              />
            </div>
          </fieldset>

          <label class="field">
            <span>已修课程 <span class="optional">选填</span></span>
            <textarea v-model="store.profile.courses" rows="3" placeholder="例如：程序设计、数据结构、高等数学……" />
          </label>

          <div class="inline-note">
            <BookOpen :size="17" />
            <p>课程关联使用示例培养方案，生成后请结合本校实际课程核对。</p>
          </div>
        </div>

        <div v-if="store.step === 2" class="wizard-fields">
          <fieldset class="field">
            <legend>已经接触过哪些技能？<span class="optional">可多选</span></legend>
            <div class="skill-chips">
              <label
                v-for="skill in pickableSkills"
                :key="skill.id"
                class="skill-chip"
                :class="{ selected: store.profile.skills.includes(skill.id) }"
              >
                <input
                  v-model="store.profile.skills"
                  type="checkbox"
                  :value="skill.id"
                />{{ skill.name }}<Check v-if="store.profile.skills.includes(skill.id)" :size="13" />
              </label>
            </div>
          </fieldset>

          <div class="rating-label">
            <span>结合你的经历，给自己一个参考</span>
            <span class="tag">本人自评</span>
          </div>

          <div v-for="[key, label] in ratings" :key="key" class="rating-field">
            <div>
              <label :for="`score-${key}`">{{ label }}</label>
              <span class="rating-value">{{ scoreText(key) }}</span>
            </div>

            <input
              :id="`score-${key}`"
              type="range"
              min="0"
              max="10"
              step="1"
              :value="store.profile.scores[key] ?? 5"
              :aria-valuetext="scoreAriaText(key)"
              @input="updateScore(key, $event)"
            />

            <div class="rating-anchors">
              <span>0 未接触</span>
              <span>5 完成课程作业</span>
              <span>10 独立完成项目</span>
            </div>

            <button type="button" class="text-button muted small-text" @click="clearScore(key)">暂不确定，保留待评估</button>
          </div>
        </div>

        <div v-if="store.step === 3" class="time-step">
          <div class="time-display">
            <span>{{ store.profile.hours }}</span>
            <span>小时 / 周</span>
          </div>

          <label class="sr-only" for="hours-slider">每周课外时间滑块</label>
          <input id="hours-slider" v-model.number="store.profile.hours" type="range" min="0" max="30" step="1" />

          <div class="range-labels">
            <span>0 小时</span>
            <span>15 小时</span>
            <span>30 小时</span>
          </div>

          <label class="field compact-field">
            也可以直接填写
            <input
              v-model.number="store.profile.hours"
              type="number"
              min="0"
              max="30"
              step="1"
              inputmode="numeric"
              aria-label="每周可投入小时"
            />
          </label>

          <div class="inline-note">
            <Clock :size="19" />
            <p>这里是正常课程之外的时间。先按真实情况填写，后续可以随时调整。{{ pausedHint }}</p>
          </div>

          <div class="time-presets">
            <button
              v-for="n in hoursPresets"
              :key="n"
              type="button"
              class="button secondary small"
              :class="{ 'active-button': store.profile.hours === n }"
              @click="store.profile.hours = n"
            >每周 {{ n }} 小时</button>
          </div>
        </div>

        <div v-if="store.step === 4" class="wizard-fields">
          <fieldset class="field">
            <legend>你目前更倾向哪条路径？</legend>
            <div class="choice-grid three">
              <ChoiceCard
                v-for="(name, key) in pathNames"
                :key="key"
                :label="name"
                :description="pathDescription(key)"
                name="career-path"
                :selected="store.profile.path === key"
                @choose="store.profile.path = key"
              />
            </div>
          </fieldset>

          <fieldset class="field">
            <legend>哪些事情让你有成就感？<span class="optional">最多 3 项</span></legend>
            <div class="choice-grid two">
              <ChoiceCard
                v-for="interest in interestOptions"
                :key="interest"
                :label="interest"
                type="checkbox"
                :selected="store.profile.interests.includes(interest)"
                :disabled="store.profile.interests.length >= 3 && !store.profile.interests.includes(interest)"
                @choose="toggleInterest(interest)"
              />
            </div>
            <p
              class="selection-count"
              role="status"
            >已选择 {{ store.profile.interests.length }} / 3{{ interestHint }}</p>
          </fieldset>
        </div>

        <div v-if="store.step === 5" class="wizard-fields">
          <div class="profile-review">
            <span><BookOpen :size="16" />{{ store.profile.major }} · 第 {{ store.profile.semester }} 学期</span>
            <span><Clock :size="16" />每周 {{ store.profile.hours }} 小时</span>
            <span><Target :size="16" />{{ pathNames[store.profile.path] }}</span>
          </div>

          <div class="inline-note">
            <BookOpen :size="18" />
            <p>浏览50条真实采集岗位，也可导入招聘原文。任意方向都可以选作样本；规划方向由你选中的样本反推，目前前端开发与 Python 后端能直接生成路线。</p>
          </div>

          <JobsPicker />
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="wizard-navigation">
          <button v-if="store.step > 1" type="button" class="button secondary" @click="goBack">
            <ArrowLeft :size="17" />上一步
          </button>
          <RouterLink v-else to="/" class="button secondary"><ArrowLeft :size="17" />稍后再来</RouterLink>
          <span class="autosave"><CircleCheck :size="14" />进度自动保存到本机</span>
          <button class="button primary" type="submit" :disabled="store.generating">
            {{ store.generating ? '正在生成…' : nextLabel }}<ArrowRight :size="17" />
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
