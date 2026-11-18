// 「记录运动」换成独立的跑步小人图标（竞赛是火焰，两者不再一样）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9c948c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="16.4" cy="5" r="2.2"/>' +
  '<path d="M14.9 7.7 11.6 12.3"/>' +
  '<path d="M14.3 8.6 17.5 10.7"/>' +
  '<path d="M13.4 9.6 10.4 7.7"/>' +
  '<path d="M11.6 12.3 14.9 15.2 15.8 18.9"/>' +
  '<path d="M11.6 12.3 8.5 15.9 9.1 19.5"/>' +
  '</svg>'
const b64 = Buffer.from(svg, 'utf8').toString('base64')
console.log('SVG 长度: ' + svg.length + '，base64 长度: ' + b64.length)

// 1. wxss 增加 .mi-run
const W = MP + '/pages/mine/mine.wxss'
let raw = fs.readFileSync(W, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
if (t.includes('.mi-run')) {
  console.log('· 已有 mi-run')
} else {
  t = t.replace(
    /(\.mi-flame \{ background-image: url\("data:image\/svg\+xml;base64,[^"]+"\); \}\n)/,
    '$1.mi-run { background-image: url("data:image/svg+xml;base64,' + b64 + '"); }\n'
  )
  fs.writeFileSync(W, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加 .mi-run 样式')
}

// 2. wxml：记录运动 改用 mi-run
const X = MP + '/pages/mine/mine.wxml'
let xr = fs.readFileSync(X, 'utf8')
const xCRLF = xr.includes('\r\n')
let xt = xr.replace(/\r\n/g, '\n')
xt = xt.replace(
  `<view class="mi mi-flame"></view><text class="grow">记录运动</text>`,
  `<view class="mi mi-run"></view><text class="grow">记录运动</text>`
)
fs.writeFileSync(X, xCRLF ? xt.replace(/\n/g, '\r\n') : xt)
console.log('✓ 记录运动 图标已换成跑步小人')

// 3. 校验
const after = fs.readFileSync(X, 'utf8')
for (const line of after.split('\n')) {
  if (line.indexOf('mi mi-') >= 0) console.log('  ' + line.trim().slice(0, 90))
}
