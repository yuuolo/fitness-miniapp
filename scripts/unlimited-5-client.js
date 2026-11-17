// 小程序：限制值支持「0 = 不限」，提示文案跟着变
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
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

edit('pages/moments/post/post.js', t => {
  // 1. 读取配置：0 视为不限（用 0 / Infinity 表示）
  const fromLimits = `      const lim = (res && res.mediaLimits) || {}
      const mb = n => (Number(n) || 0) * 1024 * 1024
      this.limits = {
        maxDuration: Math.round(Number(lim.maxDuration) || FALLBACK.maxDuration),
        maxVideoBytes: lim.maxVideoMB ? mb(lim.maxVideoMB) : FALLBACK.maxVideoBytes,
        maxCount: Math.round(Number(lim.maxCount) || FALLBACK.maxCount),
        maxTotalBytes: lim.maxTotalMB ? mb(lim.maxTotalMB) : FALLBACK.maxTotalBytes
      }
      this.setData({
        canCoach,
        maxDuration: this.limits.maxDuration,
        maxCount: this.limits.maxCount,
        limitText: '视频 ≤ ' + this.limits.maxDuration + ' 秒，最多 ' + this.limits.maxCount +
          ' 个，合计 ≤ ' + fmtMB(this.limits.maxTotalBytes)
      })`

  const toLimits = `      const lim = (res && res.mediaLimits) || {}
      const mb = n => (Number(n) || 0) * 1024 * 1024
      // 管理页填 0 表示不限：时长和体积用 0 表示不限，数量固定 1–9
      const num = (v, fallback) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0 ? Math.round(n) : (n === 0 ? 0 : fallback)
      }
      const dur = num(lim.maxDuration, FALLBACK.maxDuration)
      const videoMB = num(lim.maxVideoMB, FALLBACK.maxVideoBytes / 1024 / 1024)
      const totalMB = num(lim.maxTotalMB, FALLBACK.maxTotalBytes / 1024 / 1024)
      this.limits = {
        maxDuration: dur,                                  // 0 = 不限
        maxVideoBytes: videoMB > 0 ? mb(videoMB) : 0,      // 0 = 不限
        maxCount: num(lim.maxCount, FALLBACK.maxCount),
        maxTotalBytes: totalMB > 0 ? mb(totalMB) : 0       // 0 = 不限
      }
      const sayDur = dur > 0 ? '视频 ≤ ' + dur + ' 秒' : '视频不限时长'
      const sayTotal = totalMB > 0 ? '合计 ≤ ' + fmtMB(mb(totalMB)) : '合计不限大小'
      this.setData({
        canCoach,
        maxDuration: dur > 0 ? dur : 60,
        maxDurationText: dur > 0 ? dur + ' 秒' : '不限',
        maxCount: this.limits.maxCount,
        limitText: sayDur + '，最多 ' + this.limits.maxCount + ' 个，' + sayTotal
      })`

  t = t.replace(fromLimits, toLimits)

  // 2. 拍摄时长：微信 chooseMedia 的 maxDuration 只接受 3–60，超过就按 60 录
  t = t.replace(
    `      maxDuration: lim.maxDuration,`,
    `      // 微信这个参数只接受 3–60 秒；配置更大时按 60 录（相册选的不受此限）
      maxDuration: Math.min(60, Math.max(3, Number(lim.maxDuration) || 60)),`
  )

  // 3. 超时长判断：0 = 不限 → 永不触发
  t = t.replace(
    `    const lim = this.lim()
    if (duration > lim.maxDuration + 1) {
      return wx.showModal({
        title: '视频太长',
        content: '只能发 ' + lim.maxDuration + ' 秒以内的视频，请重新拍摄。',
        showCancel: false
      })
    }`,
    `    const lim = this.lim()
    // maxDuration 为 0 表示不限时长
    if (lim.maxDuration > 0 && duration > lim.maxDuration + 1) {
      return this.askTrim(file, duration)
    }`
  )

  // 4. 弹窗文案：裁切
  t = t.replace(
    `  askTrim(file, duration) {
    const lim = this.lim()
    const rawMB = (file.size || 0) / 1024 / 1024`,
    `  askTrim(file, duration) {
    const lim = this.lim()
    if (!(lim.maxDuration > 0)) return this.compressVideo(file)
    const rawMB = (file.size || 0) / 1024 / 1024`
  )

  // 5. 合计体积判断：0 = 不限
  t = t.replace(
    `    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (total > lim.maxTotalBytes) {`,
    `    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (lim.maxTotalBytes > 0 && total > lim.maxTotalBytes) {`
  )
  t = t.replace(
    `    if (this.data.media.reduce((s, m) => s + (m.size || 0), 0) > this.lim().maxTotalBytes) {`,
    `    const limSubmit = this.lim()
    if (limSubmit.maxTotalBytes > 0 && this.data.media.reduce((s, m) => s + (m.size || 0), 0) > limSubmit.maxTotalBytes) {`
  )

  // 6. data 补 maxDurationText
  t = t.replace(
    `    maxDuration: FALLBACK.maxDuration,
    maxCount: FALLBACK.maxCount,`,
    `    maxDuration: FALLBACK.maxDuration,
    maxDurationText: '',
    maxCount: FALLBACK.maxCount,`
  )

  return t
}, 'post.js 支持不限')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/moments/post/post.js'])
console.log('  ✓ 语法通过')
