// 环境配置（零依赖，Node ≥ 18 直接运行）
const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value))

export const config = {
  port: num(process.env.PORT, 8787),
  mock: process.env.LLM_MOCK === '1',
  llm: {
    baseUrl: (process.env.LLM_BASE_URL ?? '').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? '',
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 30_000),
    maxRetries: num(process.env.LLM_MAX_RETRIES, 1),
  },
}

/** 真实调用前校验配置；未配置时给出可操作的中文提示。 */
export function assertLlmConfigured() {
  const { baseUrl, apiKey, model } = config.llm
  if (baseUrl && apiKey && model) return

  const error = new Error('模型服务未配置：请设置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（或设 LLM_MOCK=1 本地演示）')
  error.status = 503
  error.code = 'llm_not_configured'
  throw error
}
