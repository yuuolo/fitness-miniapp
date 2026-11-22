// 生成曲线图预览（2 点 / 5 点），验证平滑效果
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/fitness-metric/fitness-metric.js'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

const src = fs.readFileSync(MP, 'utf8')
const body = src.slice(src.indexOf('function round1'), src.indexOf('Page({'))
// eslint-disable-next-line no-eval
const sandbox = {}
eval(body)

const svg2 = decodeURIComponent(lineSvg([87.1, 88.4]).replace('data:image/svg+xml;charset=utf-8,', ''))
const svg5 = decodeURIComponent(lineSvg([87.1, 86.5, 87.0, 87.8, 88.4]).replace('data:image/svg+xml;charset=utf-8,', ''))

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { background:#f7f4f1; margin:0; padding:16px; font-family:-apple-system,"Microsoft YaHei",sans-serif; }
.card { background:#fff; border-radius:12px; padding:14px 18px; margin-bottom:16px; box-shadow:0 2px 8px rgba(35,32,29,.06); }
h3 { font-size:14px; color:#23201d; margin:0 0 8px; }
svg { width:100%; height:auto; display:block; }
</style></head><body>
<div class="card"><h3>2 个数据点（87.1 → 88.4）</h3>${svg2.replace('<svg', '<svg')}</div>
<div class="card"><h3>5 个数据点（平滑曲线）</h3>${svg5}</div>
</body></html>`

fs.writeFileSync(OUT + '/chart-preview.html', html)
console.log('✓ 已生成 ' + OUT + '/chart-preview.html')
