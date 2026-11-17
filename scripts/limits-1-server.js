// 1) home 返回 mediaLimits  2) 上传接口按配置校验  3) 管理端读写接口
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// ---------- A. home 带上限 ----------
edit('lib/member.js', t => {
  if (t.includes('mediaLimits')) return t
  if (!t.includes("const { configGet")) {
    // 加在文件顶部 require 区
    t = t.replace(
      /const (features|layout) = require\('\.\/(features|layout)'\)/,
      m => m
    )
  }
  // require limits
  const reqAnchor = "const features = require('./features')"
  if (!t.includes("require('./limits')")) {
    if (t.includes(reqAnchor)) {
      t = t.replace(reqAnchor, reqAnchor + "\nconst limits = require('./limits')")
    } else {
      // 退而求其次：加在第一个 require 之后
      t = t.replace(/^(const .*require\('\.\/[a-z]+'\)\n)/m, '$1const limits = require(\'./limits\')\n')
    }
  }
  // 返回体加字段
  t = t.replace(
    `  const [initialized, featureState, blocks] = await Promise.all([
    isInitialized(),
    features.get(),
    layout.forRole(me && me.role)
  ])`,
    `  const [initialized, featureState, blocks, mediaLimits] = await Promise.all([
    isInitialized(),
    features.get(),
    layout.forRole(me && me.role),
    limits.get()
  ])`
  )
  t = t.replace(
    `      features: featureState,
      layout: blocks
    }`,
    `      features: featureState,
      layout: blocks,
      mediaLimits
    }`
  )
  t = t.replace(
    `    features: featureState,
    // 首页布局：管理员按角色配好的模块顺序
    layout: blocks,
  }`,
    `    features: featureState,
    // 首页布局：管理员按角色配好的模块顺序
    layout: blocks,
    // 上传与展示限制（管理页可调）
    mediaLimits
  }`
  )
  return t
}, 'home 返回 mediaLimits')

// ---------- B. 上传接口：按配置限制体积 ----------
edit('index.js', t => {
  if (t.includes('limits.bytesOf')) return t
  // require
  if (!t.includes("require('./lib/limits')")) {
    t = t.replace(
      "const storage = require('./lib/storage')",
      "const storage = require('./lib/storage')\nconst limits = require('./lib/limits')"
    )
  }
  // 静态上限放宽（真正限制按配置在处理器里判断）
  t = t.replace('const UPLOAD_LIMIT = 12 * 1024 * 1024', 'const UPLOAD_LIMIT = 64 * 1024 * 1024 // express 的硬上限，真正的限制按管理页配置判断')
  // 处理器里按 kind 校验
  t = t.replace(
    `    if (bytes.length > UPLOAD_LIMIT) return res.json({ code: 400, msg: '文件超过 12MB' })`,
    `    if (bytes.length > UPLOAD_LIMIT) return res.json({ code: 400, msg: '文件超过 64MB' })

    // 管理页配置的上传限制：视频按「压缩后上限」，图片按合计上限
    const kind = String(req.query.kind || '').toLowerCase()
    const cfg = limits.bytesOf(await limits.get())
    if (mime.indexOf('video/') === 0 || kind === 'video') {
      if (bytes.length > cfg.maxVideoBytes) {
        return res.json({
          code: 400,
          msg: '视频约 ' + (bytes.length / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxVideoMB + 'MB 上限'
        })
      }
    } else if (bytes.length > cfg.maxTotalBytes) {
      return res.json({
        code: 400,
        msg: '图片约 ' + (bytes.length / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxTotalMB + 'MB 上限'
      })
    }`
  )
  return t
}, '上传接口按配置校验体积')

// ---------- C. 管理端读写接口 ----------
edit('index.js', t => {
  if (t.includes("/api/admin/media-limits")) return t
  const anchor = "// ---------- 排行榜项目（管理页） ----------"
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到插入锚点')
    return t
  }
  return t.replace(anchor, `// ---------- 上传与展示限制 ----------
app.get('/api/admin/media-limits', requireAdmin, async (req, res) => {
  try {
    const value = await limits.get()
    res.json({ code: 0, data: { value, defaults: limits.DEFAULTS, ranges: limits.RANGES } })
  } catch (e) {
    console.error('media limits read failed', e)
    res.json({ code: 500, msg: '读取上传限制失败' })
  }
})

app.put('/api/admin/media-limits', requireAdmin, async (req, res) => {
  try {
    const value = await limits.save((req.body && req.body.value) || {}, 'admin')
    console.log('media limits changed ->', JSON.stringify(value))
    res.json({ code: 0, data: { value, summary: '已保存：视频 ≤ ' + value.maxDuration + ' 秒 / ' + value.maxVideoMB + 'MB，最多 ' + value.maxCount + ' 个，合计 ≤ ' + value.maxTotalMB + 'MB，列表显示 ' + value.feedThumbs + ' 个' } })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

${anchor}`)
}, '新增管理端限制接口')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/member.js', 'lib/limits.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
