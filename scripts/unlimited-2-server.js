// 服务端各处：按「0 = 不限」处理
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

// ---------- 1. moment.js：数量/时长/体积检查跳过「不限」 ----------
edit('lib/moment.js', t => {
  t = t.replace(
    `    if (m.type === 'video') {
      if (m.duration > c.maxDuration) {
        fail('视频 ' + m.duration + ' 秒，超过 ' + c.maxDuration + ' 秒上限，请拍短一点')
      }
      if (m.size > c.maxVideoMB * limits.MB) {
        fail('视频 ' + mb(m.size) + '，超过 ' + c.maxVideoMB + 'MB 上限')
      }
    }`,
    `    if (m.type === 'video') {
      // 0 表示不限
      if (c.maxDuration > 0 && m.duration > c.maxDuration) {
        fail('视频 ' + m.duration + ' 秒，超过 ' + c.maxDuration + ' 秒上限，请拍短一点')
      }
      if (c.maxVideoMB > 0 && m.size > c.maxVideoMB * limits.MB) {
        fail('视频 ' + mb(m.size) + '，超过 ' + c.maxVideoMB + 'MB 上限')
      }
    }`
  )
  t = t.replace(
    `  if (total > c.maxTotalMB * limits.MB) {
    fail('这条动态合计 ' + mb(total) + '，超过 ' + c.maxTotalMB + 'MB 上限，少选几个或选小一点的')
  }`,
    `  if (c.maxTotalMB > 0 && total > c.maxTotalMB * limits.MB) {
    fail('这条动态合计 ' + mb(total) + '，超过 ' + c.maxTotalMB + 'MB 上限，少选几个或选小一点的')
  }`
  )
  return t
}, 'moment.js 支持不限')

// ---------- 2. video.js：不设时长就不裁切；不设体积就不压 ----------
edit('lib/video.js', t => {
  t = t.replace(
    `  if (before.duration <= maxDuration + 0.5) {
    return { path: inputPath, before, after: before, trimmed: false, keep: null, method: 'none' }
  }`,
    `  // maxDuration 为 0 表示不限时长，不裁切
  if (!maxDuration || maxDuration <= 0 || before.duration <= maxDuration + 0.5) {
    return { path: inputPath, before, after: before, trimmed: false, keep: null, method: 'none' }
  }`
  )
  return t
}, 'video.js 支持不限时长')

// ---------- 3. index.js /api/video：不限时给安全上限 ----------
edit('index.js', t => {
  t = t.replace(
    `    const maxRaw = cfg.maxRawVideoMB * 1024 * 1024`,
    `    // 0 = 不限，但仍留一个物理安全上限（防止把磁盘塞满）
    const SAFETY_MAX = 1024 * 1024 * 1024
    const maxRaw = cfg.maxRawVideoMB > 0 ? cfg.maxRawVideoMB * 1024 * 1024 : SAFETY_MAX`
  )
  t = t.replace(
    `    if (declared > maxRaw + 1024 * 1024) {
      req.resume()
      return res.json({
        code: 400,
        msg: '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxRawVideoMB +
          'MB 上限，无法自动裁切，请到相册里裁剪后再发'
      })
    }`,
    `    if (declared > maxRaw + 1024 * 1024) {
      req.resume()
      return res.json({
        code: 400,
        msg: cfg.maxRawVideoMB > 0
          ? '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxRawVideoMB +
            'MB 上限，无法自动裁切，请到相册里裁剪后再发'
          : '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过单次上传的物理上限（1GB）'
      })
    }`
  )
  t = t.replace(
    `      // 裁切后还要满足「单视频体积上限」，否则发不出去
      maxVideoBytes: Math.min(cfg.maxVideoMB, cfg.maxTotalMB) * 1024 * 1024`,
    `      // 裁切后还要满足「单视频体积上限」，否则发不出去；0 = 不限
      maxVideoBytes: cfg.maxVideoMB > 0
        ? Math.min(cfg.maxVideoMB, cfg.maxTotalMB > 0 ? cfg.maxTotalMB : cfg.maxVideoMB) * 1024 * 1024
        : 0`
  )
  t = t.replace(
    `        keptSeconds: prepared.trimmed ? cfg.maxDuration : null,`,
    `        keptSeconds: prepared.trimmed ? cfg.maxDuration : null,
        unlimited: {
          duration: !(cfg.maxDuration > 0),
          videoMB: !(cfg.maxVideoMB > 0),
          rawMB: !(cfg.maxRawVideoMB > 0)
        },`
  )
  return t
}, 'index.js 支持不限')

// ---------- 4. 管理端保存摘要：不限时显示「不限」 ----------
edit('index.js', t => {
  t = t.replace(
    `    res.json({ code: 0, data: { value, summary: '已保存：视频 ≤ ' + value.maxDuration + ' 秒 / ' + value.maxVideoMB + 'MB（原视频 ≤ ' + value.maxRawVideoMB + 'MB 自动裁切），最多 ' + value.maxCount + ' 个，合计 ≤ ' + value.maxTotalMB + 'MB，列表显示 ' + value.feedThumbs + ' 个' } })`,
    `    const say = (v, unit) => (v > 0 ? v + ' ' + unit : '不限')
    res.json({
      code: 0,
      data: {
        value,
        summary: '已保存：视频时长 ' + say(value.maxDuration, '秒') +
          ' / 成品 ' + say(value.maxVideoMB, 'MB') +
          ' / 原视频 ' + say(value.maxRawVideoMB, 'MB') +
          '，最多 ' + value.maxCount + ' 个，合计 ' + say(value.maxTotalMB, 'MB') +
          '，列表显示 ' + value.feedThumbs + ' 个'
      }
    })`
  )
  return t
}, '保存摘要支持不限')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/moment.js', 'lib/video.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
