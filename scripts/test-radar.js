// 验证雷达图 SVG 生成：从 index.js 里抽出函数，用样例数据跑一遍
const fs = require('fs')

const src = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js', 'utf8')

// 抽出 base64 / radarValues / round1 / radarSvg 这几个函数
const start = src.indexOf("const B64CHARS")
const end = src.indexOf('Page({')
if (start < 0 || end < 0) throw new Error('找不到雷达图函数块')

const code = src.slice(start, end)
const sandbox = {}
const fn = new Function(code + '\nreturn { base64, radarValues, radarSvg, round1 }')
const api = fn()
console.log('函数已抽出')

// ---------- 样例 1：正常数据 ----------
const sample = {
  latestBody: { weight: 80, bodyFat: 22, muscleRate: 45, score: 68 },
  bestLift: { bench: 80, squat: 110, deadlift: 130 }
}
const values = api.radarValues(sample)
console.log('\n=== 维度值 ===')
values.forEach(v => console.log('  ' + v.label + ' ' + v.value))

const svg = api.radarSvg(values)
console.log('\n=== SVG ===')
console.log('  data URI 前缀: ' + svg.slice(0, 40))
const b64 = svg.replace('data:image/svg+xml;base64,', '')
const decoded = Buffer.from(b64, 'base64').toString('utf8')
console.log('  base64 长度: ' + b64.length)
console.log('  解码后长度: ' + decoded.length)
console.log('  开头: ' + decoded.slice(0, 60))
console.log('  是合法 SVG: ' + (decoded.startsWith('<svg') && decoded.endsWith('</svg>')))
console.log('  polygon 数量: ' + (decoded.match(/<polygon/g) || []).length + '（3 圈网格 + 1 数据）')
console.log('  line 数量: ' + (decoded.match(/<line/g) || []).length + '（6 条轴线）')
const pts = (decoded.match(/points="([^"]+)"/g) || [])
console.log('  数据多边形点数: ' + pts[pts.length - 1].split(' ').length)

// ---------- 样例 2：没有数据 ----------
const empty = api.radarValues({ latestBody: null, bestLift: {} })
console.log('\n=== 空数据 ===')
console.log('  维度值: ' + empty.map(v => v.label + '=' + v.value).join(' '))
console.log('  全为 0（会显示「还没有数据」占位）: ' + empty.every(v => v.value <= 0))

// ---------- 样例 3：只有力量没有体测 ----------
const liftOnly = api.radarValues({ latestBody: { weight: 70 }, bestLift: { bench: 100, squat: 140, deadlift: 170 } })
console.log('\n=== 只有力量成绩 ===')
console.log('  ' + liftOnly.map(v => v.label + '=' + v.value).join(' '))
console.log('  力量维度有值: ' + liftOnly.slice(0, 3).every(v => v.value > 0))

// ---------- 样例 4：女性 ----------
const female = api.radarValues({ latestBody: { weight: 55, bodyFat: 26, muscleRate: 40, score: 72 }, bestLift: { bench: 30, squat: 50, deadlift: 60 } })
console.log('\n=== 女性数据（55kg）===')
console.log('  ' + female.map(v => v.label + '=' + v.value).join(' '))
