import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, Profile } from './types'
import { remotePlan } from '../tests/fixtures/remote-plan'

const profile: Profile = {
  major: '计算机科学与技术',
  semester: 3,
  role: 'frontend',
  courses: '',
  skills: ['programming'],
  scores: { programming: null, project: null, analysis: null, communication: null },
  hours: 12,
  path: 'job',
  interests: ['技术实现'],
}

const jobs: Job[] = [
  {
    id: 'one',
    role: 'frontend',
    title: '前端开发',
    company: '示例',
    education: '本科',
    text: '掌握 JavaScript。',
    source: 'demo',
    url: '',
    collectedAt: '',
  },
]

async function loadApi(base: string | undefined) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE', base)
  return import('./api')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('requestPlan', () => {
  it('未设置地址时默认连接同源后端代理', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: remotePlan(profile, jobs) })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi(undefined)

    expect(api.remotePlanEnabled()).toBe(true)
    await api.requestPlan(profile, jobs, 1)
    expect(fetchMock.mock.calls[0]![0]).toBe('/backend/api/plan')
  })

  it('未配置地址时使用本地规则', async () => {
    const api = await loadApi('')
    expect(api.remotePlanEnabled()).toBe(false)
  })

  it('配置地址后提交画像、样本与版本号', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: remotePlan(profile, jobs, 2) }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000/')

    const plan = await api.requestPlan(profile, jobs, 2)

    expect(api.remotePlanEnabled()).toBe(true)
    expect(plan.id).toBe('remote-plan-2')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/plan',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.version).toBe(2)
    expect(body.jobs).toHaveLength(1)
  })

  it('后端错误时抛出中文提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'LLM_TIMEOUT', message: '规划服务响应超时，请稍后重试。' }), {
          status: 504,
        }),
      ),
    )
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('规划服务响应超时')
  })

  it('连接失败时提示检查后端', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('无法连接规划服务')
  })

  it('返回结构不正确时报错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('数据格式不正确')
  })

  it.each(['profile', 'jobIds', 'version', 'createdAt'] as const)('拒绝缺少 %s 的规划，避免保存后页面崩溃', async field => {
    const broken = remotePlan(profile, jobs) as unknown as Record<string, unknown>
    delete broken[field]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: broken }))))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('数据格式不正确')
  })

  it('拒绝不能渲染的任务内容', async () => {
    const broken = remotePlan(profile, jobs)
    ;(broken.tasks[0] as unknown as Record<string, unknown>).skillIds = null
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: broken }))))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('数据格式不正确')
  })

  it('拒绝学期分组引用不存在的任务', async () => {
    const broken = remotePlan(profile, jobs)
    broken.semesters![0]!.itemIds = ['unknown-task']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: broken }))))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('数据格式不正确')
  })

  it('拒绝返回另一画像或版本的规划', async () => {
    const broken = remotePlan({ ...profile, hours: 6 }, jobs, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: broken }))))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('当前请求不一致')
  })

  it('后端没有业务路由时提示检查启动入口', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 })))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('接口')
  })

  it('非JSON错误页面也给出可读提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('服务')
  })

  it('三次默认模型超时预算后取消等待，不自动重复生成', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    const result = api.requestPlan(profile, jobs, 1).catch(error => error as Error)
    await vi.advanceTimersByTimeAsync(300_001)
    expect(await result).toHaveProperty('message', expect.stringContaining('超时'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('本地演示模式不向错误地址发送规划请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('')
    await expect(api.requestPlan(profile, jobs, 1)).rejects.toThrow('本地演示')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('模型密钥', () => {
  it('零小时规划成功不冒充已验证模型，因为后端不会调用模型', async () => {
    const paused = { ...profile, hours: 0 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: remotePlan(paused, jobs) }))))
    const api = await loadApi('/backend')
    const llm = await import('./llm')
    await api.requestPlan(paused, jobs, 1)
    expect(llm.llmVerified.value).toBe(false)
  })

  it('验证仅返回结果，由仍然有效的设置面板决定是否应用', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, model: 'server-model' }))))
    const api = await loadApi('/backend')
    const llm = await import('./llm')
    expect(llm.llmVerified.value).toBe(false)
    await api.verifyLlmKey({ key: '', model: '' })
    expect(llm.llmVerified.value).toBe(false)
  })

  it('服务端配置密钥时允许空浏览器密钥验证', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, model: 'server-model' })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    expect(await api.verifyLlmKey({ key: '', model: '' })).toBe('server-model')
    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('X-DeepSeek-Key')
  })

  it('模型服务地址、模型和密钥一并通过请求头发送', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, model: 'custom-model' })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    await api.verifyLlmKey({ key: 'sk-private', model: 'custom-model', baseUrl: 'https://models.example.com/v1' })
    expect(fetchMock.mock.calls[0]![1].headers).toMatchObject({
      'X-DeepSeek-Key': 'sk-private', 'X-DeepSeek-Model': 'custom-model',
      'X-DeepSeek-Base-URL': 'https://models.example.com/v1',
    })
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined()
  })

  it('已保存密钥时随规划请求发送请求头', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ key: 'sk-browser', model: 'deepseek-chat' }),
      setItem: () => {},
      removeItem: () => {},
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: remotePlan(profile, jobs, 1) }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000')

    await api.requestPlan(profile, jobs, 1)

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>
    expect(headers['X-DeepSeek-Key']).toBe('sk-browser')
    expect(headers['X-DeepSeek-Model']).toBe('deepseek-chat')
  })

  it('校验密钥时返回后端使用的模型名', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, model: 'deepseek-chat' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000')

    const model = await api.verifyLlmKey({ key: 'sk-draft', model: '' })

    expect(model).toBe('deepseek-chat')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/llm/verify',
      expect.objectContaining({ method: 'POST' }),
    )
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>
    expect(headers['X-DeepSeek-Key']).toBe('sk-draft')
  })

  it('密钥无效时抛出后端提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'LLM_UNAUTHORIZED', message: '密钥无效或无法访问模型服务。' }), {
          status: 401,
        }),
      ),
    )
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.verifyLlmKey({ key: 'sk-bad', model: '' })).rejects.toThrow('密钥无效')
  })

  it('校验时连接失败提示检查后端', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.verifyLlmKey({ key: 'sk-x', model: '' })).rejects.toThrow('无法连接规划服务')
  })
})

describe('规划服务检查', () => {
  it('仅接受后端明确的健康状态，不把它当作模型连接成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    await api.requestHealth()
    expect(fetchMock.mock.calls[0]![0]).toBe('/backend/health')
    expect(fetchMock.mock.calls[0]![1].method).toBe('GET')
  })

  it('健康接口返回未知内容时明确报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'starting' }))))
    const api = await loadApi('/backend')
    await expect(api.requestHealth()).rejects.toThrow('健康状态')
  })
})
