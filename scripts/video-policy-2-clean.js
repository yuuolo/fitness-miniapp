// 清理详情页里重复的体积检查（已统一到 api.uploadVideo 按后台策略处理）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/challenges/detail/detail.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const start = t.indexOf('  // 读取上传限制（只拉一次）')
const end = t.indexOf('  // 按顺序逐个上传（微信 uploadFile 同时只能一个，避免抢带宽）')
if (start < 0 || end < 0) {
  console.log('⚠ 未匹配检查区块')
  process.exit(1)
}
t = t.slice(0, start) + t.slice(end)

// uploadQueue 里 precheckVideo 已被移除；确认没有残留调用
if (t.includes('precheckVideo(')) {
  console.log('⚠ 仍有 precheckVideo 调用，请人工检查')
}

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已移除重复的体积检查（统一由 api.uploadVideo 按后台策略执行）')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
