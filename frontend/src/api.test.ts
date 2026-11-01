import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, Profile } from './types'
import { remotePlan } from '../tests/fixtures/remote-plan'
import { realJobs } from './data'

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
  it('采集岗位按后端契约提交，并带上方向与约束', async () => {
    const selected = [realJobs.find(job => job.id === 'nc-467328')!]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: remotePlan(profile, selected) })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    const constraints = {
      addSkills: ['docker'],
      removeSkills: ['vue'],
      keepTaskTitles: ['建立一个仓库'],
    }

    await api.requestPlan(profile, selected, 1, 'devops', constraints)

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.directionHint).toBe('devops')
    expect(body.constraints).toEqual(constraints)
    expect(body.jobs[0]).toEqual({
      id: selected[0]!.id, role: 'frontend', title: selected[0]!.title,
      company: selected[0]!.company, education: selected[0]!.education, text: selected[0]!.text,
      source: 'imported', url: selected[0]!.url, collectedAt: selected[0]!.collectedAt,
    })
    expect(selected[0]!.source).toBe('collected')
  })

  it('Java/C# 岗位也能提交，方向过滤交给后端', async () => {
    const java = realJobs.find(job => job.id === 'nc-469522')!
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ plan: remotePlan({ ...profile, role: 'backend' }, [java]) })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')

    await api.requestPlan({ ...profile, role: 'backend' }, [java], 1, 'backend')

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).jobs).toHaveLength(1)
  })

  it('未设置地址时默认连接同源后端代理', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: remotePlan(profile, jobs) })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi(undefined)

    expect(api.remotePlanEnabled()).toBe(true)
    await api.requestPlan(profile, jobs, 1, 'frontend')
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

    const plan = await api.requestPlan(profile, jobs, 2, 'frontend')

    expect(plan.id).toBe('remote-plan-2')
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.version).toBe(2)
    expect(body.directionHint).toBe('frontend')
    expect(body.constraints).toEqual({ addSkills: [], removeSkills: [], keepTaskTitles: [] })
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

    await expect(api.requestPlan(profile, jobs, 1, 'frontend')).rejects.toThrow('规划服务响应超时')
  })

  it('连接失败时提示检查后端', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestPlan(profile, jobs, 1, 'frontend')).rejects.toThrow('无法连接规划服务')
  })

  it('返回结构不正确时报错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    const api = await loadApi('http://127.0.0.1:8000')

    await expect(api.requestPlan(profile, jobs, 1, 'frontend')).rejects.toThrow('数据格式不正确')
  })

  it('非JSON错误页面也给出可读提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })))
    const api = await loadApi('/backend')
    await expect(api.requestPlan(profile, jobs, 1, 'frontend')).rejects.toThrow('服务')
  })

  it('本地演示模式不向错误地址发送规划请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('')
    await expect(api.requestPlan(profile, jobs, 1, 'frontend')).rejects.toThrow('本地演示')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('模型密钥', () => {
  it('服务端配置密钥时允许空浏览器密钥验证', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, model: 'server-model' })))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')
    expect(await api.verifyLlmKey({ key: '', model: '' })).toBe('server-model')
    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('X-DeepSeek-Key')
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

    await api.requestPlan(profile, jobs, 1, 'frontend')

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

describe('岗位分析', () => {
  const analyzeReply = {
    skills: [
      { id: 'javascript', name: 'JavaScript', count: 1, evidence: [{ jobId: 'one', sentence: '掌握 JavaScript', kind: '明确要求' }] },
    ],
    mappings: [
      {
        skillId: 'javascript', skillName: 'JavaScript', skillCount: 1, jobIds: ['one'],
        courseId: 'web-programming', course: 'Web 程序设计', courseSemester: 3,
        projectId: 'campus-signup-app', project: '校园活动报名应用',
        outcome: '完成表单与交互', acceptance: '处理空输入', reason: '岗位要求交互与表单校验。',
        alreadyTaken: false, courseSource: '示例培养方案', projectSource: '示例课程项目库', sourceKind: '示例',
      },
    ],
  }

  it('提交岗位原文与画像，返回技能与课程映射', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(analyzeReply), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('/backend')

    const result = await api.requestAnalyze(jobs, profile)

    expect(fetchMock.mock.calls[0]![0]).toBe('/backend/api/analyze')
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.jobs).toEqual([{ id: 'one', text: '掌握 JavaScript。' }])
    expect(body.profile).toMatchObject({ major: '计算机科学与技术', role: 'frontend' })
    expect(result.skills[0]!.id).toBe('javascript')
    expect(result.mappings[0]!.courseId).toBe('web-programming')
    expect(result.mappings[0]!.alreadyTaken).toBe(false)
  })

  it('后端返回错误时透出中文提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'LLM_TIMEOUT', message: '岗位分析响应超时。' }), { status: 504 })),
    )
    const api = await loadApi('/backend')

    await expect(api.requestAnalyze(jobs, profile)).rejects.toThrow('岗位分析响应超时')
  })

  it('返回结构不正确时报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ skills: [] }), { status: 200 })))
    const api = await loadApi('/backend')

    await expect(api.requestAnalyze(jobs, profile)).rejects.toThrow('数据格式不正确')
  })

  it('本地演示模式不发送分析请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadApi('')

    await expect(api.requestAnalyze(jobs, profile)).rejects.toThrow('本地演示')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
