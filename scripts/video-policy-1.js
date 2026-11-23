// 所有视频上传统一走后台策略（uploadLimits）：
//   · 压缩阈值/次数/时长都以管理页设定为准，不再硬编码
//   · 挑战视频每方段数也用 maxCount
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(p, fn, label) {
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

// ---------- 1. api.js：按后台策略压缩 + 上传 ----------
edit(MP + '/utils/api.js', t => {
  const start = t.indexOf('// 手机相册里的视频往往几十上百 MB')
  const end = t.indexOf('function readFile(filePath) {')
  if (start < 0 || end < 0) {
    console.log('  [!] 找不到 uploadVideo 区块')
    return t
  }
  const block = `// ---------- 视频上传：完全按后台「上传与展示限制」执行 ----------
// 后台设定（管理页 → 上传与展示限制）：
//   maxRawVideoMB  原视频（裁切前）上限，超过就直接拒绝并提示裁剪
//   maxVideoMB     压缩后（裁切后）目标体积；超过就压
//   maxDuration    视频最长秒数；超过由服务端自动裁切
//   maxCount       单条最多照片/视频数量
//   maxTotalMB     单条合计大小上限
// 0 = 不限
const POLICY_TTL = 5 * 60 * 1000
let policyCache = { at: 0, value: null }

function uploadPolicy() {
  if (policyCache.value && Date.now() - policyCache.at < POLICY_TTL) {
    return Promise.resolve(policyCache.value)
  }
  return call('uploadLimits', {}, { silent: true }).then(v => {
    policyCache = { at: Date.now(), value: v || {} }
    return policyCache.value
  }, () => ({}))
}

function fileSizeMB(filePath) {
  return new Promise(resolve => {
    try {
      wx.getFileInfo({
        filePath,
        success: r => resolve((r.size || 0) / 1024 / 1024),
        fail: () => resolve(0)
      })
    } catch (e) {
      resolve(0)
    }
  })
}

// 压缩视频（不支持时返回原路径）
function compressVideo(filePath, quality) {
  return new Promise(resolve => {
    if (!wx.compressVideo) return resolve({ path: filePath, compressed: false })
    wx.compressVideo({
      src: filePath,
      quality: quality || 'medium',
      success: r => resolve({ path: r.tempFilePath || filePath, compressed: !!r.tempFilePath }),
      fail: () => resolve({ path: filePath, compressed: false })
    })
  })
}

/**
 * 视频上传：先按后台策略检查/压缩，再流式上传
 * opts.duration 可选（chooseMedia 返回的时长，用来提示是否会裁切）
 * 返回 { fileID, trimmed, keptSeconds, originalDuration, compressed }
 */
function uploadVideo(filePath, opts) {
  const options = opts || {}
  return uploadPolicy().then(policy => {
    const maxRaw = Number(policy.maxRawVideoMB) || 0   // 0 = 不限
    const maxVideo = Number(policy.maxVideoMB) || 0    // 0 = 不限
    const maxDuration = Number(policy.maxDuration) || 0

    return fileSizeMB(filePath).then(sizeMB => {
      // 1) 原视频就超过「裁切前上限」→ 直接提示先裁剪（别再白传）
      if (maxRaw > 0 && sizeMB > maxRaw) {
        const err = new Error('这个视频 ' + sizeMB.toFixed(1) + 'MB，超过原视频上限 ' + maxRaw +
          'MB，请先在相册裁剪短一点再上传')
        err.tooLarge = true
        throw err
      }

      // 2) 超过「压缩后目标体积」→ 压缩（大文件用低质量，尽量一次到位）
      const needCompress = maxVideo > 0 && sizeMB > maxVideo
      if (!needCompress) return { path: filePath, compressed: false }

      const quality = sizeMB > maxVideo * 4 ? 'low' : 'medium'
      return compressVideo(filePath, quality).then(r => {
        if (!r.compressed) return r
        return fileSizeMB(r.path).then(after => {
          // 压完还超目标体积也不拦：服务端会再转码到目标体积
          return { path: r.path, compressed: true, sizeMB: after }
        })
      })
    }).then(source => {
      const finalPath = source.path
      const suffix = String((finalPath.match(/\.[a-zA-Z0-9]+$/) || ['.mp4'])[0]).replace(/^\./, '')
      // 超过最长秒数：告诉用户会被裁切（服务端执行）
      const willTrim = maxDuration > 0 && options.duration && options.duration > maxDuration + 1
      return login().then(code => new Promise((resolve, reject) => {
        wx.uploadFile({
          url: BASE + '/api/video?ext=' + encodeURIComponent(suffix) + '&code=' + encodeURIComponent(code),
          filePath: finalPath,
          name: 'file',
          timeout: 300000,
          success: res => {
            let r = {}
            try { r = JSON.parse(res.data || '{}') } catch (e) { r = {} }
            if (r.code === 0) {
              return resolve(Object.assign({}, r.data, {
                compressed: !!source.compressed,
                willTrim: !!willTrim
              }))
            }
            reject(new Error(r.msg || ('视频上传失败（HTTP ' + res.statusCode + '）')))
          },
          fail: err => {
            const raw = (err && err.errMsg) || '未知错误'
            console.error('uploadVideo fail:', raw)
            reject(new Error('视频上传失败（' + raw + '）'))
          }
        })
      }))
    })
  })
}

`
  return t.slice(0, start) + block + t.slice(end)
}, 'api.js：按后台策略压缩上传')

// 导出策略方法
edit(MP + '/utils/api.js', t => t.replace(
  'module.exports = { call, upload, uploadVideo, download, readFile, resetLogin }',
  'module.exports = { call, upload, uploadVideo, uploadPolicy, download, readFile, resetLogin }'
), 'api.js：导出 uploadPolicy')

// ---------- 2. 调用点：把时长传进去 + 提示压缩 ----------
// 2.1 挑战详情
edit(MP + '/pages/challenges/detail/detail.js', t => {
  let out = t.replace(
    "api.uploadVideo(file.tempFilePath).then(v => {",
    "api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {\n      if (v.compressed) wx.showToast({ title: '已按设定压缩后上传', icon: 'none' })"
  )
  // 上传前的本地体积检查交给 api，不再重复
  out = out.replace(
    `    this.precheckVideo(file).then(chk => {
      if (chk && chk.ok === false) {
        wx.hideLoading()
        wx.showModal({ title: '视频太大', content: chk.msg, showCancel: false })
        return
      }
      this.doUploadOne(file, sideOpenid, files, index)
    })
  },`,
    `    this.doUploadOne(file, sideOpenid, files, index)
  },`
  )
  return out
}, '详情页：交给 api 按策略处理')

// 2.2 友圈发动态
edit(MP + '/pages/moments/post/post.js', t => t.replace(
  'api.uploadVideo(file.tempFilePath).then(v => {',
  'api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {'
), '友圈：传时长')

// 2.3 竞赛录入
edit(MP + '/pages/staff/competition-entry/competition-entry.js', t => t.replace(
  'api.uploadVideo(file.tempFilePath).then(v => {',
  'api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {'
), '竞赛录入：传时长')

// 2.4 员工录力量成绩
edit(MP + '/pages/staff/fitness/fitness.js', t => t.replace(
  'api.uploadVideo(file.tempFilePath).then(v => {',
  'api.uploadVideo(file.tempFilePath, { duration: file.duration }).then(v => {'
), '力量成绩：传时长')

// ---------- 3. 服务端：挑战每方段数用 maxCount ----------
edit(SERVER + '/lib/challenge.js', t => {
  // 常量改成从 limits 读
  t = t.replace(
    'const MAX_VIDEOS_PER_SIDE = 9      // 每方最多 9 段视频',
    '// 每方视频段数沿用后台「单条最多照片/视频数量」（maxCount），默认 9\nlet MAX_VIDEOS_PER_SIDE = 9'
  )
  // 交视频时按后台策略取上限
  t = t.replace(
    `  const count = (await query(
    'select count(*)::int as n from challenge_videos where challenge_id = $1 and openid = $2',
    [c._id, owner]
  )).rows[0].n
  if (count >= MAX_VIDEOS_PER_SIDE) {
    fail('每方最多 ' + MAX_VIDEOS_PER_SIDE + ' 段视频，请先删掉一些再传')
  }`,
    `  // 段数上限跟随管理页设定
  const cfg = await limits.get()
  MAX_VIDEOS_PER_SIDE = cfg.maxCount > 0 ? cfg.maxCount : 9
  const count = (await query(
    'select count(*)::int as n from challenge_videos where challenge_id = $1 and openid = $2',
    [c._id, owner]
  )).rows[0].n
  if (count >= MAX_VIDEOS_PER_SIDE) {
    fail('每方最多 ' + MAX_VIDEOS_PER_SIDE + ' 段视频（管理页设定），请先删掉一些再传')
  }`
  )
  // 引入 limits
  t = t.replace(
    "const liftItems = require('./lift-items')",
    "const liftItems = require('./lift-items')\nconst limits = require('./limits')"
  )
  // 详情里的 videoLimit 也按后台设定
  t = t.replace(
    `    videoLimit: MAX_VIDEOS_PER_SIDE,`,
    `    videoLimit: await videoLimitOf(),`
  )
  // 新增读取函数（放在 decorate 之前）
  t = t.replace(
    `async function decorate(c, me, opts) {`,
    `async function videoLimitOf() {
  const cfg = await limits.get()
  return cfg.maxCount > 0 ? cfg.maxCount : 9
}

async function decorate(c, me, opts) {`
  )
  return t
}, 'challenge.js：每方段数跟随后台 maxCount')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/api.js', 'pages/challenges/detail/detail.js', 'pages/moments/post/post.js', 'pages/staff/competition-entry/competition-entry.js', 'pages/staff/fitness/fitness.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/lib/challenge.js'])
console.log('  ✓ 语法通过')
