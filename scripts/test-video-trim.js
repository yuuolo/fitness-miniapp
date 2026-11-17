// 在服务器容器里验证裁切逻辑：生成 90 秒测试视频 → 裁到 60 秒
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const video = require('/app/lib/video')

;(async () => {
  const src = path.join(os.tmpdir(), 'test90.mp4')
  console.log('1. 生成 90 秒测试视频…')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=90:size=320x240:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=90',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', src])
  const stat = fs.statSync(src)
  console.log('   源文件: ' + (stat.size / 1024 / 1024).toFixed(1) + 'MB')

  console.log('2. 探测时长')
  const info = await video.probe(src)
  console.log('   ' + JSON.stringify(info))

  console.log('3. 裁到 60 秒')
  const out = await video.prepare(src, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  console.log('   trimmed=' + out.trimmed + ' method=' + out.method)
  console.log('   原时长 ' + out.before.duration + 's → 现时长 ' + out.after.duration + 's')
  console.log('   体积 ' + (out.before.bytes / 1024 / 1024).toFixed(1) + 'MB → ' + (out.after.bytes / 1024 / 1024).toFixed(1) + 'MB')
  if (out.after.duration > 62) throw new Error('裁切后仍然超长')
  console.log('   ✓ 裁切成功')

  console.log('4. 再试 10 秒上限（更严格）')
  const out2 = await video.prepare(src, { maxDuration: 10, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  console.log('   原 ' + out2.before.duration + 's → 现 ' + out2.after.duration + 's（' + out2.method + '）')
  console.log('   体积 ' + (out2.after.bytes / 1024).toFixed(0) + 'KB')
  if (out2.after.duration > 12) throw new Error('10 秒裁切失败')

  console.log('5. 不超长的视频应原样通过')
  const out3 = await video.prepare(out2.path, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  console.log('   trimmed=' + out3.trimmed + '（应为 false）')

  for (const f of [src, out.path, out2.path]) fs.rmSync(f, { force: true })
  console.log('\n全部通过')
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
