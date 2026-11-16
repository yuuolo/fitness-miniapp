// 预览：带六角名称的雷达图（真实尺寸 220rpx ≈ 110px）
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js'
const src = fs.readFileSync(P, 'utf8')
const start = src.indexOf('const B64CHARS')
const end = src.indexOf('Page({')
const api = new Function(src.slice(start, end) + '\nreturn { radarValues, radarSvg }')()

const cases = [
  { name: '数据均衡', data: { latestBody: { weight: 80, bodyFat: 22, muscleRate: 45, score: 68 }, bestLift: { bench: 80, squat: 110, deadlift: 130 } } },
  { name: '力量型', data: { latestBody: { weight: 80, bodyFat: 14, muscleRate: 52, score: 88 }, bestLift: { bench: 110, squat: 150, deadlift: 190 } } },
  { name: '没有数据', data: { latestBody: null, bestLift: {} } }
]

const cards = cases.map(c => {
  const values = api.radarValues(c.data)
  const empty = values.every(v => v.value <= 0)
  const uri = empty ? '' : api.radarSvg(values)
  const inner = uri
    ? `<div class="radar" style="background-image:url('${uri}')"></div>`
    : `<div class="radar radar-empty">还没有数据</div>`
  return `<div class="tile"><div class="t">排行榜</div><div class="muted">${empty ? '录一次体测就能看到' : '综合能力 ' + Math.round(values[5].value)}</div>${inner}</div>`
}).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f7f4f1; padding: 16px; font: 13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; display: flex; gap: 14px; }
  .tile { width: 177px; background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 2px 10px rgba(35,32,29,.06);
    display: flex; flex-direction: column; align-items: center; }
  .t { font-size: 15px; font-weight: 600; color: #23201d; }
  .muted { font-size: 12px; color: #9c948c; margin-bottom: 4px; }
  .radar { width: 110px; height: 110px; margin-top: 6px; background-repeat: no-repeat; background-position: center; background-size: contain; }
  .radar-empty { width: 75px; height: 75px; border-radius: 50%; background: #f4efea; color: #9c948c;
    font-size: 11px; display: flex; align-items: center; justify-content: center; }
</style></head><body>${cards}</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/radar-labels.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 620, height: 260, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/radar-labels.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/radar-labels.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/radar-labels.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
