// 视频接口：超限返回 400 + 友好提示；能提前用 Content-Length 拦就不白传
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// 1. 提前按 Content-Length 拦掉明显超限的上传
const from1 = `    const maxRaw = cfg.maxRawVideoMB * 1024 * 1024
    tmp = video.tmpFile(ext)`
const to1 = `    const maxRaw = cfg.maxRawVideoMB * 1024 * 1024
    // 客户端有 Content-Length 时先拦一道，别让用户白传几十兆
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > maxRaw + 1024 * 1024) {
      req.resume()
      return res.json({
        code: 400,
        msg: '原视频约 ' + (declared / 1024 / 1024).toFixed(1) + 'MB，超过 ' + cfg.maxRawVideoMB +
          'MB 上限，无法自动裁切，请到相册里裁剪后再发'
      })
    }
    tmp = video.tmpFile(ext)`

if (t.includes(from1)) {
  t = t.replace(from1, to1)
  done.push('按 Content-Length 提前拦截')
} else {
  console.log('⚠ 未匹配 maxRaw 段')
}

// 2. 落盘超限 → 400（不是 500）
const from2 = `  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    console.error('video upload failed', e)
    res.json({ code: 500, msg: '视频处理失败：' + (e.message || '未知错误') })
  } finally {
    for (const f of [tmp, outPath]) {`
const to2 = `  } catch (e) {
    if (e instanceof BizError) return res.json({ code: 400, msg: e.message })
    // 体积/时长不合格属于用户侧问题，给 400 和可直接照做的提示
    if (/超过上限|超过.*上限|没有收到/.test(String(e.message || ''))) {
      return res.json({ code: 400, msg: String(e.message).replace('文件超过上限', '原视频超过 ' + (await limits.get()).maxRawVideoMB + 'MB 上限，请裁剪后再发') })
    }
    console.error('video upload failed', e)
    res.json({ code: 500, msg: '视频处理失败：' + (e.message || '未知错误') })
  } finally {
    for (const f of [tmp, outPath]) {`

if (t.includes(from2)) {
  t = t.replace(from2, to2)
  done.push('超限返回 400')
} else {
  console.log('⚠ 未匹配 catch 段')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
