// 把生成的雷达图 SVG 渲染成图片，肉眼确认形状
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const src = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js', 'utf8')
const start = src.indexOf('const B64CHARS')
const end = src.indexOf('Page({')
const api = new Function(src.slice(start, end) + '\nreturn { radarValues, radarSvg }')()

const CASES = [
  { name: '力量型（卧推强、体脂低）', data: { latestBody: { weight: 80, bodyFat: 14, muscleRate: 52, score: 88 }, bestLift: { bench: 110, squat: 150, deadlift: 190 } } },
  { name: '普通身材（数据均衡）', data: { latestBody: { weight: 80, bodyFat: 22, muscleRate: 45, score: 68 }, bestLift: { bench: 80, squat: 110, deadlift: 130 } } },
  { name: '体脂偏高（力量一般）', data: { latestBody: { weight: 95, bodyFat: 32, muscleRate: 38, score: 45 }, bestLift: { bench: 60, squat: 80, deadlift: 100 } } }
]

const cards = CASES.map(c => {
  const values = api.radarValues(c.data)
  const uri = api.radarSvg(values)
  const rows = values.map(v => `<div class="row"><span>${v.label}</span><b>${Math.round(v.value)}</b></div>`).join('')
  return `<div class="card">
    <div class="radar" style="background-image:url('${uri}')"></div>
    <div class="name">${c.name}</div>
    <div class="vals">${rows}</div>
  </div>`
}).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { margin:0; padding:22px; background:#f7f4f1; font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; width:640px }
  .row { display:flex; gap:16px }
  .card { background:#fff; border-radius:12px; padding:14px; text-align:center; width:190px; box-shadow:0 2px 10px rgba(35,32,29,.06) }
  .radar { width:120px; height:120px; margin:0 auto 8px; background-repeat:no-repeat; background-position:center; background-size:contain }
  .name { font-weight:600; margin-bottom:8px; color:#23201d }
  .vals { text-align:left; font-size:12px; color:#6b645c }
  .vals .row { justify-content:space-between; padding:1px 0 }
  .vals b { color:#e9603a }
</style></head><body><div class="row">${cards}</div></body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(out + '/radar.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 660, height: 260, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/radar.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/radar.png', fullPage: true })
  await browser.close()
  console.log('雷达图效果: ' + out + '/radar.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
