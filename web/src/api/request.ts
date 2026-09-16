import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '@/types/api'

const CSRF_HEADER = 'X-CSRF-Token'

// 仅用于获取 CSRF 令牌的「裸」实例（不带拦截器，避免请求拦截器在取令牌时递归）
const rawClient: AxiosInstance = axios.create({
  baseURL: '/',
  withCredentials: true,
})

// 缓存 in-flight 的 csrf 获取，避免并发写请求重复拉取
let csrfPromise: Promise<string> | null = null

function readMetaToken(): string {
  const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null
  return meta?.content ?? ''
}

function writeMetaToken(token: string): void {
  let meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'csrf-token'
    document.head.appendChild(meta)
  }
  meta.content = token
}

async function ensureCsrfToken(): Promise<string> {
  const existing = readMetaToken()
  if (existing) return existing
  if (!csrfPromise) {
    csrfPromise = rawClient
      .get<{ status: string; token: string }>('/api/csrf-token')
      .then((r) => {
        const t = r.data.token
        writeMetaToken(t)
        return t
      })
      .finally(() => {
        csrfPromise = null
      })
  }
  return csrfPromise
}

export const api: AxiosInstance = axios.create({
  baseURL: '/',
  withCredentials: true, // 关键：携带 Flask-Login 的 session-cookie
  headers: {
    // 不预设 Content-Type：
    //  - JSON 提交由 axios 默认 transformRequest 自动补 application/json；
    //  - FormData 提交不设头时，浏览器 XHR.send(FormData) 会自动补
    //    `multipart/form-data; boundary=----...`（application/json 用 axios 预设反而会让
    //    FormData 走 JSON 序列化 / 丢失 boundary，因此绝不能在此预设 JSON）。
    // 让后端 _wants_json() 判定为 SPA 请求，写接口返回 JSON 而非 302 重定向；
    // Jinja 端原生表单不带此头，行为不受影响。
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 15000,
})

// 请求拦截：写请求（非 GET/HEAD）自动携带 CSRF 令牌
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toLowerCase()
  if (method !== 'get' && method !== 'head') {
    const token = await ensureCsrfToken()
    if (token) {
      if (typeof config.headers.set === 'function') {
        config.headers.set(CSRF_HEADER, token)
      } else {
        ;(config.headers as Record<string, string>)[CSRF_HEADER] = token
      }
    }
  }
  return config
})

function makeApiError(message: string, code: string, payload?: unknown): ApiError {
  const err = new Error(message) as ApiError
  err.code = code
  err.payload = payload
  return err
}

// 响应拦截：拆信封 —— { status:'ok', ...payload } 直接返回 payload；
// { status:'error', msg } 或 HTTP 非 2xx 抛统一 ApiError。
api.interceptors.response.use(
  (response: AxiosResponse): any => {
    const data = response.data
    if (data && data.status === 'ok') {
      const { status, ...payload } = data
      return payload
    }
    if (data && data.status === 'error') {
      throw makeApiError(data.msg || '请求失败', 'API_ERROR', data)
    }
    return data
  },
  (error: AxiosError) => {
    const data = error.response?.data as any
    const msg = (data && data.msg) || error.message || '网络错误'
    const err = makeApiError(msg, 'HTTP_' + (error.response?.status ?? 0), data)
    // 表单校验失败（400 + errors）时把逐字段错误挂到 error 上，供弹窗内联回显
    if (data && data.errors && typeof data.errors === 'object') {
      err.errors = data.errors as Record<string, string[]>
    }
    throw err
  }
)

// 类型化封装：调用方直接拿到解包后的 payload，无需感知信封
export function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.get(url, config) as unknown as Promise<T>
}
export function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.post(url, body, config) as unknown as Promise<T>
}
export function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.put(url, body, config) as unknown as Promise<T>
}
export function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.delete(url, config) as unknown as Promise<T>
}

/**
 * 以 multipart/form-data 提交（写接口复用 Flask-WTF 表单校验，且支持图标文件上传）。
 *
 * 关键：【不要】手动设置 Content-Type。
 * axios 1.x 的 xhr 适配器不会为 FormData 自动补 boundary（仅当 data 为 undefined 时才删 Content-Type，
 * 见 node_modules/axios/lib/adapters/xhr.js）。若手动声明 'multipart/form-data'（无 boundary），
 * 浏览器 XHR 会原样发送、不补 boundary，Werkzeug 将无法解析 multipart → 文件/表单全部丢失。
 * 正确做法是把 Content-Type 置为 null，axios 解析后会移除该头，交由浏览器 XHR 自动补上
 * `multipart/form-data; boundary=----...`（FormData 发送时浏览器行为）。
 *
 * 注：JSON 提交走 apiPost，其 transformRequest 对普通对象会自动 setContentTypeIfUnset('application/json')，
 * 与这里互不影响。
 */
export function apiPostForm<T>(url: string, form: FormData, config?: AxiosRequestConfig): Promise<T> {
  // 不设置 Content-Type：浏览器 XHR 发送 FormData 时会自动补
  // `multipart/form-data; boundary=----...`，Werkzeug 据此正确解析。
  // （axios 1.x 的 xhr 适配器不会为 FormData 自动补 boundary，手动设 multipart/form-data
  //  反而会变成「无 boundary」的非法头，导致后端解析失败。）
  return api.post(url, form, config) as unknown as Promise<T>
}

/** 把普通对象转成 FormData：跳过 null/undefined，布尔转 '1'（未勾选则不提交，与复选框语义一致）。 */
export function toFormData(data: Record<string, unknown>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'boolean') {
      if (v) fd.append(k, '1') // 后端以 form.get(k) == '1' 判定，未勾选不提交
      continue
    }
    if (v instanceof File) {
      fd.append(k, v)
      continue
    }
    fd.append(k, String(v))
  }
  return fd
}

export { ensureCsrfToken }
