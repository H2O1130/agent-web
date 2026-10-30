import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, Profile } from './types'

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

async function loadApi(base: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE', base)
  return import('./api')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('requestPlan', () => {
  it('未配置地址时使用本地规则', async () => {
    const api = await loadApi('')
    expect(api.remotePlanEnabled()).toBe(false)
  })

  it('配置地址后提交画像、样本与版本号', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: { id: 'p1', tasks: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000/')

    const plan = await api.requestPlan(profile, jobs, 2)

    expect(api.remotePlanEnabled()).toBe(true)
    expect(plan.id).toBe('p1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/plan',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.version).toBe(2)
    expect(body.jobs).toHaveLength(1)
  })

  it('带上 AI 补充的任务与被替换的模块', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: { id: 'p1', tasks: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000')

    await api.requestPlan(profile, jobs, 3, {
      customTasks: [{ id: 'custom-java', title: 'Java 基础', action: '写练习', done: '能写小程序' }],
      dropModules: ['python'],
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.customTasks).toHaveLength(1)
    expect(body.customTasks[0].title).toBe('Java 基础')
    expect(body.dropModules).toEqual(['python'])
  })

  it('没有补充任务时也发空数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: { id: 'p1', tasks: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000')

    await api.requestPlan(profile, jobs, 1)

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.customTasks).toEqual([])
    expect(body.dropModules).toEqual([])
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
})

describe('模型密钥', () => {
  it('已保存密钥时随规划请求发送请求头', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ key: 'sk-browser', model: 'deepseek-chat' }),
      setItem: () => {},
      removeItem: () => {},
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: { id: 'p1', tasks: [] } }), { status: 200 }),
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

  it('可以用弹窗里临时填写的地址校验', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, model: 'deepseek-chat' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('')

    await api.verifyLlmKey({ key: 'sk-draft', model: '' }, 'http://127.0.0.1:9000/')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/api/llm/verify',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('后端连通性探测', () => {
  it('健康检查通过就算连接成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('')

    await expect(api.probeBackend('http://127.0.0.1:8000/')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/health', { method: 'GET' })
  })

  it('地址不是本项目后端时给出提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    const api = await loadApi('')

    await expect(api.probeBackend('http://127.0.0.1:8000')).rejects.toThrow('不是本项目的后端')
  })

  it('健康检查返回异常时也提示地址不对', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'degraded' }), { status: 200 })),
    )
    const api = await loadApi('')

    await expect(api.probeBackend('http://127.0.0.1:8000')).rejects.toThrow('/health 返回异常')
  })

  it('地址为空时直接报错', async () => {
    const api = await loadApi('')

    await expect(api.probeBackend('  ')).rejects.toThrow('请先填写后端地址')
  })

  it('网络失败时提示检查后端', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const api = await loadApi('')

    await expect(api.probeBackend('http://127.0.0.1:8000')).rejects.toThrow('连不上这个地址')
  })
})

describe('服务端模型状态', () => {
  it('没配后端地址时直接认为没有模型', async () => {
    const api = await loadApi('')

    await expect(api.requestLlmStatus()).resolves.toEqual({ configured: false, model: '' })
  })

  it('读取服务端是否已配好密钥', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configured: true, model: 'deepseek-chat' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestLlmStatus()).resolves.toEqual({
      configured: true,
      model: 'deepseek-chat',
    })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/api/llm/status')
  })

  it('返回结构不对时报错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestLlmStatus()).rejects.toThrow('数据格式不正确')
  })
})
