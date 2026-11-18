// 「会员挑战」用独立图标（小旗），不和竞赛的火焰重复
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9c948c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 21V4"/>' +
  '<path d="M6 4.5h10.5l-2.4 3.6 2.4 3.6H6"/>' +
  '</svg>'
const b64 = Buffer.from(svg, 'utf8').toString('base64')

const W = MP + '/pages/mine/mine.wxss'
let raw = fs.readFileSync(W, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
if (!t.includes('.mi-duel')) {
  t = t.replace(
    /(\.mi-run \{ background-image: url\("data:image\/svg\+xml;base64,[^"]+"\); \}\n)/,
    '$1.mi-duel { background-image: url("data:image/svg+xml;base64,' + b64 + '"); }\n'
  )
  fs.writeFileSync(W, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加 .mi-duel（小旗）样式')
}

const X = MP + '/pages/mine/mine.wxml'
let xr = fs.readFileSync(X, 'utf8')
const xCRLF = xr.includes('\r\n')
let xt = xr.replace(/\r\n/g, '\n')
xt = xt.replace(
  `<view class="mi mi-flame"></view><text class="grow">会员挑战</text>`,
  `<view class="mi mi-duel"></view><text class="grow">会员挑战</text>`
)
fs.writeFileSync(X, xCRLF ? xt.replace(/\n/g, '\r\n') : xt)
console.log('✓ 会员挑战图标换成小旗')
for (const line of fs.readFileSync(X, 'utf8').split('\n')) {
  if (line.indexOf('mi mi-') >= 0) console.log('  ' + line.trim().slice(0, 90))
}
