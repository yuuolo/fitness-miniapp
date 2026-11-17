// 服务端：视频上传接口（超时长自动裁切）+ limits 增加原始视频上限
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

// ---------- 1. limits：原始视频上限 ----------
edit('lib/limits.js', t => {
  if (t.includes('maxRawVideoMB')) return t
  t = t.replace(
    `  maxTotalMB: 40,    // 单条动态媒体合计大小上限`,
    `  maxTotalMB: 40,    // 单条动态媒体合计大小上限
  maxRawVideoMB: 60, // 原视频（裁切前）允许的最大体积`
  )
  t = t.replace(
    `  maxTotalMB: [4, 200, '单条合计大小上限', 'MB'],`,
    `  maxTotalMB: [4, 200, '单条合计大小上限', 'MB'],
  maxRawVideoMB: [5, 200, '原视频（裁切前）上限', 'MB'],`
  )
  return t
}, 'limits 增加 maxRawVideoMB')

// ---------- 2. index.js：视频上传接口 ----------
edit('index.js', t => {
  if (t.includes("'/api/video'")) return t
  if (!t.includes("require('./lib/video')")) {
    t = t.replace(
      "const limits = require('./lib/limits')",
      "const limits = require('./lib/limits')\nconst video = require('./lib/video')\nconst { receiveToFile } = require('./lib/receive')"
    )
  }
  const anchor = '// 自建存储的静态图片（比如分享海报用的小程序码）'
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到插入锚点')
    return t
  }
  return t.replace(anchor, `// ---------- 视频上传：超过「视频最长秒数」自动裁切，并把裁切情况返回给上传者 ----------
// 小程序用 wx.uploadFile（multipart）传原视频，这里落盘 → ffprobe 探测 → 超时长用 ffmpeg 裁
app.post('/api/video', async (req, res) => {
  const ext = String(req.query.ext || 'mp4').replace(/^\\./, '').toLowerCase()
  const mime = MIME_BY_EXT[ext]
  let tmp = ''
  let outPath = ''
  try {
    if (!mime || mime.indexOf('video/') !== 0) return res.json({ code: 400, msg: '只支持视频文件' })
    const openid = await resolveOpenid(req, req.query.code)
    const cfg = await limits.get()
    if (!(await video.available())) return res.json({ code: 500, msg: '服务器未安装 ffmpeg，无法处理视频' })

    const maxRaw = cfg.maxRawVideoMB * 1024 * 1024
    tmp = video.tmpFile(ext)
    const got = await receiveToFile(req, { filePath: tmp, maxBytes: maxRaw + 1024 * 1024 })
    if (!got.bytes) return res.json({ code: 400, msg: '没有收到视频内容' })

    // 超时长就裁切（只保留前 maxDuration 秒）
    const prepared = await video.prepare(tmp, {
      maxDuration: cfg.maxDuration,
      ext,
      maxHeight: 720,
      maxBytes: maxRaw
    })
    outPath = prepared.path

    const bytes = await fs.promises.readFile(outPath)
    const saved = await storage.put(bytes, { ext, mime })
    await ensureMember(openid)

    res.json({
      code: 0,
      data: {
        fileID: saved.url,
        bytes: bytes.length,
        mime,
        storage: saved.driver,
        duration: prepared.after.duration,
        originalDuration: prepared.before.duration,
        trimmed: prepared.trimmed,
        keptSeconds: prepared.trimmed ? cfg.maxDuration : null,
        method: prepared.method
      }
    })
  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error('video upload failed', e)
    res.json({ code: 500, msg: '视频处理失败：' + (e.message || '未知错误') })
  } finally {
    for (const f of [tmp, outPath]) {
      if (f) fs.promises.rm(f, { force: true }).catch(() => {})
    }
  }
})

${anchor}`)
}, '新增 /api/video 裁切接口')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/limits.js', 'lib/video.js', 'lib/receive.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
