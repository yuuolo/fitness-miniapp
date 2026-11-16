// 六边形能力图：六个角加参考数值名称
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const start = t.indexOf('function radarSvg(values) {')
const end = t.indexOf('Page({', start)

const neu = `function radarSvg(values) {
  const SIZE = 120
  const C = SIZE / 2
  const R = 33            // 网格半径（比原来小，给六角的字留位置）
  const N = 6
  const LABEL_R = 49      // 文字离中心的距离

  const angleOf = i => -Math.PI / 2 + (Math.PI * 2 * i) / N

  const point = (i, ratio) => {
    // 从正上方开始，顺时针分布
    const angle = angleOf(i)
    return [C + Math.cos(angle) * R * ratio, C + Math.sin(angle) * R * ratio]
  }
  const poly = (ratio) => {
    const pts = []
    for (let i = 0; i < N; i++) {
      const [x, y] = point(i, ratio)
      pts.push(x.toFixed(1) + ',' + y.toFixed(1))
    }
    return pts.join(' ')
  }

  // 网格：外框 + 两圈内环
  let grid = ''
  ;[1, 0.66, 0.33].forEach(r => {
    grid += '<polygon points="' + poly(r) + '" fill="none" stroke="#c9c2ba" stroke-width="1" opacity="0.55"/>'
  })
  // 轴线
  for (let i = 0; i < N; i++) {
    const [x, y] = point(i, 1)
    grid += '<line x1="' + C + '" y1="' + C + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) +
      '" stroke="#c9c2ba" stroke-width="1" opacity="0.45"/>'
  }

  // 六个角上的名称（即六个维度的参考值含义）
  let labels = ''
  values.forEach((v, i) => {
    const angle = angleOf(i)
    const lx = C + Math.cos(angle) * LABEL_R
    const ly = C + Math.sin(angle) * LABEL_R
    labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" ' +
      'text-anchor="middle" dominant-baseline="middle" font-size="10" ' +
      'font-family="-apple-system, PingFang SC, Microsoft YaHei, sans-serif" ' +
      'fill="#9c948c">' + v.label + '</text>'
  })

  // 数据多边形
  const dataPts = values.map((v, i) => {
    const [x, y] = point(i, Math.max(0.04, Math.min(1, v.value / 100)))
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
    grid +
    '<polygon points="' + dataPts + '" fill="#e9603a" fill-opacity="0.35" stroke="#e9603a" stroke-width="2" stroke-linejoin="round"/>' +
    labels +
    '</svg>'

  return 'data:image/svg+xml;base64,' + base64(svg)
}

`

if (start < 0 || end < 0) {
  console.log('⚠ 定位失败')
  process.exit(1)
}

t = t.slice(0, start) + neu + t.slice(end)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('  ✓ 六边形六个角加上名称')

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
