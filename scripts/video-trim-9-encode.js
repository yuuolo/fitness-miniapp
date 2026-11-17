// 裁切后如果体积仍超上限，按目标体积重编码压下来
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/video.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('function ensureSize')) {
  console.log('· 已有 ensureSize')
  process.exit(0)
}

// 1. 新增 ensureSize：按目标体积压
const anchor = `// 把上传的临时文件整理好：超时长就裁切，返回最终文件和说明`
const helper = `// 体积仍然超标时，按目标大小重编码（先算目标码率，再不行就降一档重试）
async function encodeToSize(input, { keep, maxBytes, ext, maxHeight }) {
  const seconds = Math.max(1, Number(keep) || 10)
  const audioBps = 64 * 1024
  let out = input
  let info = await probe(input)
  let attempt = 0
  // 最多试两次：第一次按目标码率，第二次再降 25%
  while (info.bytes > maxBytes && attempt < 2) {
    attempt++
    const overhead = 0.88 / Math.pow(0.75, attempt - 1)
    const totalBps = Math.floor((maxBytes * 8 * overhead) / seconds)
    const videoBps = Math.max(200 * 1024, totalBps - audioBps)
    const next = tmpFile(ext)
    const args = ['-y', '-loglevel', 'error', '-i', out, '-t', String(seconds),
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(videoBps),
      '-maxrate', String(Math.floor(videoBps * 1.3)), '-bufsize', String(videoBps * 2)]
    if (maxHeight) args.push('-vf', 'scale=-2:min(' + maxHeight + '\\\\,ih)')
    args.push('-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', next)
    await run(FFMPEG, args, 600000)
    if (out !== input) await fsp.rm(out, { force: true }).catch(() => {})
    out = next
    info = await probe(out)
    if (!info.bytes) throw new Error('压缩失败')
  }
  return { path: out, info, method: 'encode-to-size', attempts: attempt }
}

${anchor}`

if (!t.includes(anchor)) {
  console.log('⚠ 找不到插入点')
  process.exit(1)
}
t = t.replace(anchor, helper)

// 2. prepare 里裁切后再保证体积
const fromPrepare = `  const t = await trim(inputPath, { keepSeconds: maxDuration, ext, maxHeight })
  return {
    path: t.path,
    before,
    after: t.info,
    trimmed: true,
    keep: maxDuration,
    method: t.method
  }`

const toPrepare = `  let t = await trim(inputPath, { keepSeconds: maxDuration, ext, maxHeight })
  let method = t.method
  // 裁切只是截短时长；如果成品还超过单视频体积上限，再按目标体积压一次
  if (maxVideoBytes && t.info.bytes > maxVideoBytes) {
    const smaller = await encodeToSize(t.path, {
      keep: maxDuration,
      maxBytes: maxVideoBytes,
      ext,
      maxHeight
    })
    if (smaller.path !== t.path) await fsp.rm(t.path, { force: true }).catch(() => {})
    t = { path: smaller.path, info: smaller.info }
    method = 'trim+encode'
  }
  return {
    path: t.path,
    before,
    after: t.info,
    trimmed: true,
    keep: maxDuration,
    method
  }`

if (!t.includes(fromPrepare)) {
  console.log('⚠ 未匹配 prepare 返回段')
  process.exit(1)
}
t = t.replace(fromPrepare, toPrepare)

// 3. prepare 参数解构加 maxVideoBytes
t = t.replace(
  `async function prepare(inputPath, { maxDuration, ext, maxHeight, maxBytes }) {`,
  `async function prepare(inputPath, { maxDuration, ext, maxHeight, maxBytes, maxVideoBytes }) {`
)

// 4. 导出
t = t.replace(
  'module.exports = { available, probe, trim, prepare, tmpFile }',
  'module.exports = { available, probe, trim, prepare, ensureSize: encodeToSize, tmpFile }'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加入「裁切后按体积压缩」')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
