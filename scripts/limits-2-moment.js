// 友圈：提交时按管理页配置校验媒体；列表按「最多显示数量」截断
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/moment.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. require limits ----------
if (!t.includes("require('./limits')")) {
  t = t.replace(
    "const storage = require('./storage')",
    "const storage = require('./storage')\nconst limits = require('./limits')"
  )
  done.push('moment.js 引入 limits')
}

// ---------- 2. cleanMedia 按配置校验 ----------
const oldClean = `// 图片/视频先由小程序上传，这里只收地址（云存储 fileID 或自建 https 地址）
function cleanMedia(list) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length > MAX_MEDIA) fail('最多 ' + MAX_MEDIA + ' 个视频或照片')
  return arr.map(x => ({
    fileID: String(x.fileID || ''),
    type: x.type === 'video' ? 'video' : 'image',
    duration: Number(x.duration) || 0,
    thumb: String(x.thumb || '')
  })).filter(x => /^(cloud:\\/\\/|https:\\/\\/)/.test(x.fileID))
}`

const newClean = `// 图片/视频先由小程序上传，这里只收地址（云存储 fileID 或自建 https 地址）
// 数量 / 时长 / 体积都按管理页配置校验（limits 不传就用默认值）
function cleanMedia(list, cfg) {
  const c = cfg || limits.DEFAULTS
  const arr = Array.isArray(list) ? list : []
  const maxCount = Math.min(c.maxCount || MAX_MEDIA, MAX_MEDIA)
  if (arr.length > maxCount) fail('最多 ' + maxCount + ' 个视频或照片')

  const out = arr.map(x => ({
    fileID: String(x.fileID || ''),
    type: x.type === 'video' ? 'video' : 'image',
    duration: Number(x.duration) || 0,
    size: Number(x.size) || 0,
    thumb: String(x.thumb || '')
  })).filter(x => /^(cloud:\\/\\/|https:\\/\\/)/.test(x.fileID))

  const mb = n => (n / 1024 / 1024).toFixed(1) + 'MB'
  let total = 0
  for (const m of out) {
    if (m.type === 'video') {
      if (m.duration > c.maxDuration) {
        fail('视频 ' + m.duration + ' 秒，超过 ' + c.maxDuration + ' 秒上限，请拍短一点')
      }
      if (m.size > c.maxVideoMB * limits.MB) {
        fail('视频 ' + mb(m.size) + '，超过 ' + c.maxVideoMB + 'MB 上限')
      }
    }
    total += m.size
  }
  if (total > c.maxTotalMB * limits.MB) {
    fail('这条动态合计 ' + mb(total) + '，超过 ' + c.maxTotalMB + 'MB 上限，少选几个或选小一点的')
  }
  return out
}`

if (!t.includes(oldClean)) {
  console.log('⚠ 未匹配 cleanMedia')
} else {
  t = t.replace(oldClean, newClean)
  done.push('cleanMedia 按配置校验')
}

// ---------- 3. postMoment 取配置 ----------
t = t.replace(
  `  const media = cleanMedia(data.media)`,
  `  const cfg = await limits.get()
  const media = cleanMedia(data.media, cfg)`
)
done.push('postMoment 读取配置')

// ---------- 4. 列表按「最多显示数量」截断 ----------
const oldList = `    [before, PAGE_SIZE]
  )).rows.map(momentRow)
  return {
    list: list.map(m => momentView(m, me)),
    hasMore: list.length === PAGE_SIZE
  }`
const newList = `    [before, PAGE_SIZE]
  )).rows.map(momentRow)
  const cfg = await limits.get()
  return {
    // 列表里每条最多显示 feedThumbs 个，剩下的在详情页看
    list: list.map(m => {
      const view = momentView(m, me)
      const all = view.media || []
      if (all.length > cfg.feedThumbs) {
        view.media = all.slice(0, cfg.feedThumbs)
        view.mediaCount = all.length
        view.hiddenMedia = all.length - cfg.feedThumbs
      }
      return view
    }),
    hasMore: list.length === PAGE_SIZE,
    feedThumbs: cfg.feedThumbs
  }`

if (!t.includes(oldList)) {
  console.log('⚠ 未匹配 momentList')
} else {
  t = t.replace(oldList, newList)
  done.push('列表截断缩略图')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
