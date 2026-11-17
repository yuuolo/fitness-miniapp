// 测试：限制可放开到任意值，0 = 不限
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('视频超时长自动裁切（90 秒 → 60 秒 / 10 秒）')"

const extra = `  ok('视频超时长自动裁切（90 秒 → 60 秒 / 10 秒）')

  // 限制的上限由管理员决定：可以超过 60 秒，也可以设成 0（不限）
  const big = await limits.save({ maxDuration: 300, maxVideoMB: 500, maxTotalMB: 1000, maxRawVideoMB: 800 }, 'test')
  assert.strictEqual(big.maxDuration, 300, '应允许把时长限制设到 300 秒')
  assert.strictEqual(big.maxVideoMB, 500, '应允许把成品体积设到 500MB')

  const unlimited = await limits.save({ maxDuration: 0, maxVideoMB: 0, maxTotalMB: 0, maxRawVideoMB: 0 }, 'test')
  assert.strictEqual(unlimited.maxDuration, 0, '0 表示不限时长')
  assert.strictEqual(unlimited.maxVideoMB, 0, '0 表示不限成品体积')
  assert.strictEqual(unlimited.maxTotalMB, 0, '0 表示不限合计体积')

  // 不限时：100 秒、180MB 的视频也能发
  const longOne = await act('postMoment', MEMBER, {
    content: '不限时长的视频',
    media: [{ fileID: 'https://gym.example.com/api/media/longvid', type: 'video', duration: 100, size: 180 * 1024 * 1024 }]
  })
  assert.ok(longOne && longOne._id, '不限时应当允许发 100 秒的视频')
  ok('限制可放开：支持 > 60 秒，0 表示不限')

  // 视频处理侧：不限时长时不裁切
  const video2 = require('../lib/video')
  const os2 = require('os')
  const path2 = require('path')
  const { execFileSync: exec2 } = require('child_process')
  const src2 = path2.join(os2.tmpdir(), 'nocut-' + Date.now() + '.mp4')
  exec2('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=8:size=160x120:rate=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '34', src2])
  const noTrim = await video2.prepare(src2, { maxDuration: 0, ext: 'mp4', maxHeight: 720, maxBytes: 0, maxVideoBytes: 0 })
  assert.strictEqual(noTrim.trimmed, false, '不限时长时不应裁切')
  assert.ok(noTrim.after.duration >= 7.5, '不限时长时视频应保持完整')
  require('fs').rmSync(src2, { force: true })
  ok('不限时长时服务端不裁切')

  // 恢复默认，避免影响后面的测试
  await limits.save({ maxDuration: 15, maxVideoMB: 12, maxRawVideoMB: 60, maxCount: 9, maxTotalMB: 40, feedThumbs: 9 }, 'test')`

if (t.includes('限制可放开：支持 > 60 秒')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入不限限制测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
