// 测试：视频超时长自动裁切（用 ffmpeg 生成测试视频）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('上传与展示限制可配置、可校验、可恢复')"

const extra = `  ok('上传与展示限制可配置、可校验、可恢复')

  // 视频超时长自动裁切：生成 90 秒测试视频，按 60 秒裁切
  const video = require('../lib/video')
  const os = require('os')
  const path = require('path')
  const { execFileSync } = require('child_process')
  const src = path.join(os.tmpdir(), 'trim-test-' + Date.now() + '.mp4')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=90:size=320x240:rate=15',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', src])

  const info = await video.probe(src)
  assert.ok(info.duration >= 88 && info.duration <= 92, '测试视频应约 90 秒，实际 ' + info.duration)

  const cut = await video.prepare(src, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.strictEqual(cut.trimmed, true, '超时长应触发裁切')
  assert.ok(cut.after.duration <= 62, '裁切后应不超过 60 秒，实际 ' + cut.after.duration)
  assert.ok(cut.after.bytes > 0, '裁切后文件不能为空')
  assert.ok(cut.after.bytes < cut.before.bytes, '裁切后体积应更小')

  const cut10 = await video.prepare(src, { maxDuration: 10, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.ok(cut10.after.duration <= 12, '按 10 秒裁切后应不超过 12 秒，实际 ' + cut10.after.duration)

  const asIs = await video.prepare(cut10.path, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.strictEqual(asIs.trimmed, false, '没超时长的视频不该被裁')
  ok('视频超时长自动裁切（90 秒 → 60 秒 / 10 秒）')

  for (const f of [src, cut.path, cut10.path]) fs.rmSync(f, { force: true })`

if (t.includes('视频超时长自动裁切')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入视频裁切测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
