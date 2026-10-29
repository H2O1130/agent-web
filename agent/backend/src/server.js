// HTTP 服务：挂载 8.4 四个端点，无框架、零依赖
import { createServer } from 'node:http'
import { config } from './config.js'
import { handleAnalyze, handleImport, handlePlan, handleReplan } from './routes.js'

const MAX_BODY_BYTES = 1_000_000

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > MAX_BODY_BYTES) {
        const error = new Error('请求体过大')
        error.status = 413
        error.code = 'payload_too_large'
        reject(error)
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        const error = new Error('请求体不是合法 JSON')
        error.status = 400
        error.code = 'bad_json'
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  })
  res.end(body)
}

const handlers = {
  'POST /api/analyze': handleAnalyze,
  'POST /api/plan': handlePlan,
  'POST /api/plan/replan': handleReplan,
  'POST /api/jobs/import': handleImport,
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }

  const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname

  if (req.method === 'GET' && path === '/api/health') {
    send(res, 200, { ok: true, mock: config.mock })
    return
  }

  const handler = handlers[`${req.method} ${path}`]
  if (!handler) {
    send(res, 404, { code: 'not_found', message: '接口不存在' })
    return
  }

  try {
    const body = await readBody(req)
    const result = await handler(body)
    send(res, 200, result)
  } catch (error) {
    const status = error?.status ?? 500
    send(res, status, {
      code: error?.code ?? 'internal_error',
      message: error?.message ?? '服务异常，请稍后重试',
    })
  }
})

server.listen(config.port, '127.0.0.1', () => {
  console.log(`PathPilot 模型调用入口已启动：http://127.0.0.1:${config.port}`)
  console.log(config.mock ? 'LLM_MOCK=1：返回结构化模拟数据' : '模式：调用真实大模型（OpenAI 兼容协议）')
})
