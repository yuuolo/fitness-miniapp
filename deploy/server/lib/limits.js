// 上传与展示限制：管理页可调，小程序与服务端都按这里执行
const { configGet, configSet, fail } = require('./common')

const KEY = 'mediaLimits'
const MB = 1024 * 1024

// 默认值与现有硬编码保持一致，管理页不配也是老行为
const DEFAULTS = {
  maxDuration: 15,   // 视频最长秒数
  maxVideoMB: 12,    // 视频压缩后允许的最大体积
  maxCount: 9,       // 单条动态最多照片/视频数量
  maxTotalMB: 40,    // 单条动态媒体合计大小上限
  maxRawVideoMB: 60, // 原视频（裁切前）允许的最大体积
  feedThumbs: 9      // 列表里最多显示几个（超出显示 +N）
}

// [最小, 最大, 名称, 单位]
const RANGES = {
  maxDuration: [3, 60, '视频最长秒数', '秒'],
  maxVideoMB: [1, 50, '视频压缩后上限', 'MB'],
  maxCount: [1, 9, '单条最多照片/视频数量', '个'],
  maxTotalMB: [4, 200, '单条合计大小上限', 'MB'],
  maxRawVideoMB: [5, 200, '原视频（裁切前）上限', 'MB'],
  feedThumbs: [1, 9, '列表最多显示数量', '个']
}

function clampInt(value, range, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(range[0], Math.min(range[1], n))
}

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const k of Object.keys(DEFAULTS)) {
    out[k] = clampInt(src[k], RANGES[k], DEFAULTS[k])
  }
  // 合计上限不能小于单文件上限，否则配了个自相矛盾的值
  if (out.maxTotalMB < out.maxVideoMB) out.maxTotalMB = out.maxVideoMB
  return out
}

async function get() {
  return normalize(await configGet(KEY))
}

async function save(input, operator) {
  const src = input || {}
  const patch = {}
  for (const k of Object.keys(DEFAULTS)) {
    if (src[k] === undefined || src[k] === null || src[k] === '') continue
    const n = Number(src[k])
    const [lo, hi, name, unit] = RANGES[k]
    if (!Number.isFinite(n) || n < lo || n > hi) {
      fail(name + '需要在 ' + lo + '–' + hi + ' ' + unit + ' 之间')
    }
    patch[k] = Math.round(n)
  }
  if (!Object.keys(patch).length) fail('没有要保存的项')
  const next = normalize(Object.assign({}, await get(), patch))
  await configSet(KEY, Object.assign({}, next, { updatedAt: Date.now(), operator: operator || '' }))
  return next
}

// 给小程序/接口用的字节数
function bytesOf(limits) {
  const l = limits || DEFAULTS
  return {
    maxDuration: l.maxDuration,
    maxVideoBytes: l.maxVideoMB * MB,
    maxCount: l.maxCount,
    maxTotalBytes: l.maxTotalMB * MB,
    feedThumbs: l.feedThumbs,
    maxVideoMB: l.maxVideoMB,
    maxTotalMB: l.maxTotalMB
  }
}

module.exports = { KEY, DEFAULTS, RANGES, get, save, normalize, bytesOf, MB }
