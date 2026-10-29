// 四个端点的 Prompt 构造：要求模型只输出 JSON，并给出严格 schema。
const SYSTEM =
  '你是「学途 PathPilot」的生涯规划助手，服务对象是中国大学生。' +
  '你只输出 JSON，不输出任何解释性文字或 Markdown 代码块。' +
  '所有中文文案要具体、可执行，避免空话。'

const SKILL_SCHEMA = `{
  "skills": [
    {
      "id": "英文短标识，如 javascript",
      "name": "技能中文名",
      "count": 提到该技能的岗位数（整数）,
      "evidence": [
        { "jobId": "岗位 id", "sentence": "招聘原文原句", "kind": "明确要求 | 加分项 | 表述不明" }
      ]
    }
  ]
}`

const TASK_HINT = `任务字段：id(短标识)、title、skillIds(技能 id 数组)、course、outcome(可检查的交付成果)、
acceptance(验收标准)、prerequisites(前置任务 id 数组)、hours(每周小时,整数)、weeks(持续周数,整数)、
semester(1-8 或 null 表示待安排)、startWeek(1-16 或 null)、kind(基础|专项|项目|可选|备考)、
jobIds(对应岗位 id 数组)、reason(为什么这样安排)。`

const PLAN_SCHEMA = `{
  "plan": {
    "id": "uuid",
    "version": 版本号（原样回传请求里的 version，不要自增）,
    "createdAt": "ISO8601 时间",
    "profile": 原样回传请求里的 profile,
    "jobIds": ["所选岗位 id"],
    "tasks": [ 任务对象 ]
  }
}
${TASK_HINT}
约束：同一学期同一周的任务工时之和不超过 profile.hours；任务按 prerequisites 先后安排；
semester 不早于 profile.semester；无法在剩余学期安排的任务用 semester=null 并说明原因。`

const REPLAN_SCHEMA = `{
  "plan": { 与 /api/plan 的 plan 结构相同 },
  "changes": [
    { "id": "任务 id", "title": "任务名", "status": "保留 | 推迟 | 新增 | 移除", "reason": "变化原因" }
  ]
}`

const JOB_SCHEMA = `{
  "job": {
    "id": "import-uuid",
    "role": "frontend | backend",
    "title": "岗位名称",
    "company": "公司或来源",
    "education": "学历要求摘录",
    "text": "清洗后的招聘要求原文（保留原意）",
    "source": "imported",
    "url": "来源链接或空字符串",
    "collectedAt": "YYYY-MM-DD"
  }
}`

export function analyzePrompt(jobs) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        '分析下列岗位样本，提取能力要求并给出原文证据。技能口径覆盖常见开发技能与通用能力。' +
        '同一岗位同一技能只计一次。严格按此 JSON 输出：\n' +
        SKILL_SCHEMA +
        '\n岗位样本：\n' +
        JSON.stringify(jobs),
    },
  ]
}

export function planPrompt(profile, jobs, version) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        '根据学生画像与岗位样本，生成一份可执行的成长计划。' +
        '画像中的 scores（四项自评）与 courses（已修课程）作为软参考，不要据此硬性过滤。' +
        'version 必须原样使用请求值。严格按此 JSON 输出：\n' +
        PLAN_SCHEMA +
        `\nversion: ${version}\n` +
        '\n学生画像：\n' +
        JSON.stringify(profile) +
        '\n岗位样本：\n' +
        JSON.stringify(jobs),
    },
  ]
}

export function replanPrompt(before, profile, jobs) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        '学生条件发生变化，请在原计划基础上生成新计划，并逐项说明变更。' +
        'version 使用原计划 version + 1。严格按此 JSON 输出：\n' +
        REPLAN_SCHEMA +
        '\n原计划：\n' +
        JSON.stringify(before) +
        '\n新画像：\n' +
        JSON.stringify(profile) +
        '\n岗位样本：\n' +
        JSON.stringify(jobs),
    },
  ]
}

export function importPrompt(url, text, role) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        '把下面的招聘原文解析成结构化岗位。role 固定为 ' +
        role +
        '，source 固定为 imported。严格按此 JSON 输出：\n' +
        JOB_SCHEMA +
        `\n来源链接：${url || '（无）'}\n` +
        '\n招聘原文：\n' +
        text,
    },
  ]
}
