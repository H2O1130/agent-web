// 模型调用入口核心：OpenAI 兼容协议的统一客户端
// 超时（AbortController）→ 5xx/超时重试 1 次 → 统一错误映射（code + 中文 message）
export class LlmError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.status = status
  }
}

export class LlmClient {
  constructor(options) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.model = options.model
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxRetries = options.maxRetries ?? 1
  }

  /** 调用一次对话，要求模型返回 JSON 对象。 */
  async chatJson(messages) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        })

        if (response.status === 429) throw new LlmError('llm_rate_limit', '模型调用频繁，请稍后重试', 429)
        if (response.status >= 500) throw new LlmError('llm_server', '模型服务异常，请稍后重试', 502)
        if (!response.ok) throw new LlmError('llm_bad_request', '请求模型参数有误', 502)

        const data = await response.json()
        const content = data?.choices?.[0]?.message?.content
        if (typeof content !== 'string' || !content.trim()) {
          throw new LlmError('llm_bad_response', '模型返回内容为空', 502)
        }

        try {
          return JSON.parse(content)
        } catch {
          throw new LlmError('llm_bad_response', '模型返回的不是合法 JSON', 502)
        }
      } catch (error) {
        if (error instanceof LlmError) throw error
        if (attempt < this.maxRetries) continue
        throw new LlmError('llm_timeout', '模型响应超时，请稍后重试', 504)
      } finally {
        clearTimeout(timer)
      }
    }

    throw new LlmError('llm_unknown', '模型调用失败，请稍后重试')
  }
}
