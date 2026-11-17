// 上传限制：范围放开（可大于 60 秒），并支持 0 = 不限
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/limits.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 范围：允许 0（不限），上限放大 ----------
t = t.replace(
  `// [最小, 最大, 名称, 单位]
const RANGES = {
  maxDuration: [3, 60, '视频最长秒数', '秒'],
  maxVideoMB: [1, 50, '视频压缩后上限', 'MB'],
  maxCount: [1, 9, '单条最多照片/视频数量', '个'],
  maxTotalMB: [4, 200, '单条合计大小上限', 'MB'],
  maxRawVideoMB: [5, 200, '原视频（裁切前）上限', 'MB'],
  feedThumbs: [1, 9, '列表最多显示数量', '个']
}`,
  `// [最小, 最大, 名称, 单位, 是否允许 0 = 不限]
// 60 秒 / 12MB 这些只是推荐起步值，管理员想定多大都行，0 表示不限
const RANGES = {
  maxDuration: [0, 3600, '视频最长秒数', '秒', true],
  maxVideoMB: [0, 2000, '视频压缩后上限', 'MB', true],
  maxCount: [1, 9, '单条最多照片/视频数量', '个', false],
  maxTotalMB: [0, 2000, '单条合计大小上限', 'MB', true],
  maxRawVideoMB: [0, 2000, '原视频（裁切前）上限', 'MB', true],
  feedThumbs: [1, 9, '列表最多显示数量', '个', false]
}
// 0 = 不限
const isUnlimited = v => !v || Number(v) <= 0`
)

// ---------- 2. normalize：不再强制「合计 ≥ 视频」（不限时没法比） ----------
t = t.replace(
  `  // 合计上限不能小于单文件上限，否则配了个自相矛盾的值
  if (out.maxTotalMB < out.maxVideoMB) out.maxTotalMB = out.maxVideoMB
  return out`,
  `  // 都设了具体值时，合计不该小于单视频上限；有一边不限就不管
  if (out.maxTotalMB > 0 && out.maxVideoMB > 0 && out.maxTotalMB < out.maxVideoMB) {
    out.maxTotalMB = out.maxVideoMB
  }
  return out`
)

// ---------- 3. 校验：按范围判断，0 允许 ----------
t = t.replace(
  `    const [lo, hi, name, unit] = RANGES[k]
    if (!Number.isFinite(n) || n < lo || n > hi) {
      fail(name + '需要在 ' + lo + '–' + hi + ' ' + unit + ' 之间')
    }
    patch[k] = Math.round(n)`,
  `    const [lo, hi, name, unit, allowZero] = RANGES[k]
    if (!Number.isFinite(n) || n < lo || n > hi) {
      fail(name + '需要在 ' + (allowZero ? '0（不限）或 ' + Math.max(lo, 1) : lo) + '–' + hi + ' ' + unit + ' 之间')
    }
    patch[k] = Math.round(n)`
)

// ---------- 4. bytesOf：0 保持 0（表示不限），并带上原始开关 ----------
t = t.replace(
  `function bytesOf(limits) {
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
}`,
  `// 注意：0 表示不限，调用方要按「0 = 不限」处理
function bytesOf(limits) {
  const l = limits || DEFAULTS
  return {
    maxDuration: l.maxDuration,
    maxVideoBytes: l.maxVideoMB > 0 ? l.maxVideoMB * MB : 0,
    maxCount: l.maxCount,
    maxTotalBytes: l.maxTotalMB > 0 ? l.maxTotalMB * MB : 0,
    feedThumbs: l.feedThumbs,
    maxVideoMB: l.maxVideoMB,
    maxTotalMB: l.maxTotalMB,
    maxRawVideoMB: l.maxRawVideoMB
  }
}`
)

t = t.replace(
  'module.exports = { KEY, DEFAULTS, RANGES, get, save, normalize, bytesOf, MB }',
  'module.exports = { KEY, DEFAULTS, RANGES, get, save, normalize, bytesOf, isUnlimited, MB }'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ limits：范围放开 + 支持 0 = 不限')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
