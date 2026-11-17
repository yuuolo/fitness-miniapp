// 服务端视频处理：探测时长 + 自动裁切（依赖镜像里的 ffmpeg/ffprobe）
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const crypto = require('crypto')

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

function run(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs || 120000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).slice(0, 300)))
      resolve(String(stdout || ''))
    })
  })
}

async function available() {
  try {
    await run(FFMPEG, ['-version'], 10000)
    await run(FFPROBE, ['-version'], 10000)
    return true
  } catch (e) {
    return false
  }
}

// 读视频信息：时长（秒）、宽高、体积
async function probe(file) {
  const out = await run(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file
  ], 30000)
  let info = {}
  try { info = JSON.parse(out) } catch (e) { info = {} }
  const fmt = info.format || {}
  const streams = info.streams || []
  const video = streams.find(s => s.codec_type === 'video') || {}
  const audio = streams.find(s => s.codec_type === 'audio') || {}
  const duration = Number(fmt.duration) || Number(video.duration) || 0
  const stat = await fsp.stat(file).catch(() => ({ size: 0 }))
  return {
    duration: Math.round(duration * 10) / 10,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    hasAudio: !!audio.codec_name,
    bytes: stat.size || 0
  }
}

function tmpFile(ext) {
  const name = 'v' + crypto.randomBytes(8).toString('hex') + '.' + (ext || 'mp4')
  return path.join(os.tmpdir(), name)
}

// 只保留前 N 秒。先尝试无损切割（快），失败再重编码（准）
async function trim(input, { keepSeconds, ext, maxHeight }) {
  const out = tmpFile(ext)
  const keep = Math.max(1, Number(keepSeconds) || 10)

  // 1) 直接 -t 剪切，不重编码：几乎瞬间完成
  try {
    await run(FFMPEG, [
      '-y', '-loglevel', 'error', '-i', input,
      '-t', String(keep), '-c', 'copy', '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart', out
    ], 120000)
    const p1 = await probe(out)
    if (p1.bytes > 0 && p1.duration > 0 && p1.duration <= keep + 2.5) {
      return { path: out, info: p1, method: 'copy' }
    }
  } catch (e) {
    // 落到重编码
  }
  await fsp.rm(out, { force: true }).catch(() => {})

  // 2) 重编码（体积小、时间点准确）
  const args = ['-y', '-loglevel', 'error', '-i', input, '-t', String(keep),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28']
  if (maxHeight) args.push('-vf', 'scale=-2:min(' + maxHeight + '\\,ih)')
  args.push('-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out)
  await run(FFMPEG, args, 300000)
  const p2 = await probe(out)
  if (!p2.bytes) throw new Error('裁切失败')
  return { path: out, info: p2, method: 'encode' }
}

// 体积仍然超标时，按目标大小重编码（先算目标码率，再不行就降一档重试）
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
    if (maxHeight) args.push('-vf', 'scale=-2:min(' + maxHeight + '\\,ih)')
    args.push('-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', next)
    await run(FFMPEG, args, 600000)
    if (out !== input) await fsp.rm(out, { force: true }).catch(() => {})
    out = next
    info = await probe(out)
    if (!info.bytes) throw new Error('压缩失败')
  }
  return { path: out, info, method: 'encode-to-size', attempts: attempt }
}

// 把上传的临时文件整理好：超时长就裁切，返回最终文件和说明
async function prepare(inputPath, { maxDuration, ext, maxHeight, maxBytes, maxVideoBytes }) {
  const before = await probe(inputPath)
  if (before.bytes > maxBytes) {
    throw new Error('原视频 ' + (before.bytes / 1024 / 1024).toFixed(1) + 'MB，超过上限')
  }
  if (before.duration <= maxDuration + 0.5) {
    return { path: inputPath, before, after: before, trimmed: false, keep: null, method: 'none' }
  }
  let t = await trim(inputPath, { keepSeconds: maxDuration, ext, maxHeight })
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
  }
}

module.exports = { available, probe, trim, prepare, ensureSize: encodeToSize, tmpFile }
