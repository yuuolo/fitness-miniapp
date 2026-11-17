// 小程序发布页：限制值改成从服务端读（管理页可调）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const P = MP + '/pages/moments/post/post.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 常量改为默认值 + 运行时覆盖 ----------
const oldHead = `// 友圈视频限制：时长 + 压缩后大小，避免把云存储 5GB 额度很快吃满
const MAX_DURATION = 15
const MAX_VIDEO_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024`
const newHead = `// 友圈上传限制：默认值只是兜底，真正生效的是管理页配置（首页接口下发）
const FALLBACK = {
  maxDuration: 15,
  maxVideoBytes: 12 * 1024 * 1024,
  maxCount: 9,
  maxTotalBytes: 40 * 1024 * 1024
}`
if (!t.includes(oldHead)) {
  console.log('⚠ 未匹配常量块')
} else {
  t = t.replace(oldHead, newHead)
  done.push('常量改为兜底默认值')
}

// ---------- 2. onLoad 读取限制 ----------
t = t.replace(
  `    api.call('home', {}, { silent: true }).then(res => {
      const role = res.me && res.me.role
      const canCoach = !!role && role !== 'member'
      this.setData({ canCoach })
      if (canCoach) this.loadMembers()
    }, () => {})`,
  `    api.call('home', {}, { silent: true }).then(res => {
      const role = res.me && res.me.role
      const canCoach = !!role && role !== 'member'
      // 管理页配置的上传/展示限制
      const lim = (res && res.mediaLimits) || {}
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
      })
      if (canCoach) this.loadMembers()
    }, () => {})`
)
done.push('onLoad 读取配置')

// ---------- 3. 取值辅助 ----------
t = t.replace(
  `Page({

  data: {`,
  `Page({

  // 取当前生效的限制（服务端没返回就用兜底值）
  lim() {
    return this.limits || FALLBACK
  },

  data: {`
)

// ---------- 4. 各处使用 ----------
t = t.replace(
  `  pushMedia(item) {
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (total > MAX_TOTAL_BYTES) {
      wx.showModal({
        title: '内容太大了',
        content: '合计已超过 ' + fmtMB(MAX_TOTAL_BYTES) + '，请删掉一些再发。',
        showCancel: false
      })
      return false
    }`,
  `  pushMedia(item) {
    const lim = this.lim()
    if (this.data.media.length >= lim.maxCount) {
      wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })
      return false
    }
    const total = this.data.media.reduce((s, m) => s + (m.size || 0), 0) + (item.size || 0)
    if (total > lim.maxTotalBytes) {
      wx.showModal({
        title: '内容太大了',
        content: '合计已超过 ' + fmtMB(lim.maxTotalBytes) + '，请删掉一些再发。',
        showCancel: false
      })
      return false
    }`
)

t = t.replace(
  `  chooseVideo() {
    if (this.data.media.length >= 9) return wx.showToast({ title: '最多 9 个', icon: 'none' })
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: MAX_DURATION,`,
  `  chooseVideo() {
    const lim = this.lim()
    if (this.data.media.length >= lim.maxCount) return wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: lim.maxDuration,`
)

t = t.replace(
  `    if (duration > MAX_DURATION + 1) {
      return wx.showModal({
        title: '视频太长',
        content: '只能发 ' + MAX_DURATION + ' 秒以内的视频，请重新拍摄。',
        showCancel: false
      })
    }`,
  `    const lim = this.lim()
    if (duration > lim.maxDuration + 1) {
      return wx.showModal({
        title: '视频太长',
        content: '只能发 ' + lim.maxDuration + ' 秒以内的视频，请重新拍摄。',
        showCancel: false
      })
    }`
)

t = t.split('MAX_VIDEO_BYTES').join('lim.maxVideoBytes')

t = t.replace(
  `  chooseImages() {
    const left = 9 - this.data.media.length
    if (left <= 0) return wx.showToast({ title: '最多 9 个', icon: 'none' })`,
  `  chooseImages() {
    const lim = this.lim()
    const left = lim.maxCount - this.data.media.length
    if (left <= 0) return wx.showToast({ title: '最多 ' + lim.maxCount + ' 个', icon: 'none' })`
)

t = t.replace(
  `    if (this.data.media.reduce((s, m) => s + (m.size || 0), 0) > MAX_TOTAL_BYTES) {
      return wx.showToast({ title: '内容超过大小上限', icon: 'none' })
    }`,
  `    if (this.data.media.reduce((s, m) => s + (m.size || 0), 0) > this.lim().maxTotalBytes) {
      return wx.showToast({ title: '内容超过大小上限', icon: 'none' })
    }`
)

// 上传时带上 size，服务端才能校验合计
t = t.replace(
  `        const item = { fileID, type: m.type, duration: m.duration || 0 }`,
  `        const item = { fileID, type: m.type, duration: m.duration || 0, size: m.size || 0 }`
)

// data 里补字段
t = t.replace(
  `    submitting: false,
    maxDuration: MAX_DURATION`,
  `    submitting: false,
    maxDuration: FALLBACK.maxDuration,
    maxCount: FALLBACK.maxCount,
    limitText: ''`
)
t = t.replace(
  `    members: [],
    memberIndex: -1,
    submitting: false,
    maxDuration: FALLBACK.maxDuration,
    maxCount: FALLBACK.maxCount,
    limitText: ''`,
  `    members: [],
    memberIndex: -1,
    submitting: false,
    maxDuration: FALLBACK.maxDuration,
    maxCount: FALLBACK.maxCount,
    limitText: ''`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

const left = fs.readFileSync(P, 'utf8')
for (const bad of ['MAX_DURATION', 'MAX_VIDEO_BYTES', 'MAX_TOTAL_BYTES']) {
  const n = (left.match(new RegExp(bad, 'g')) || []).length
  console.log('  遗留 ' + bad + ': ' + n)
}
