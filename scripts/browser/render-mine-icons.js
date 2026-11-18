// 预览我的页面五个图标（确认「记录运动」和「竞赛」能区分）
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const W = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/mine/mine.wxss'
const css = fs.readFileSync(W, 'utf8')

const items = [
  ['mi-chart', '我的身体数据'],
  ['mi-trophy', '力量排行榜'],
  ['mi-flame', '竞赛'],
  ['mi-run', '记录运动'],
  ['mi-book', '算法说明'],
  ['mi-tool', '员工工作台']
]

const cards = items.map(([cls, label]) => {
  const m = css.match(new RegExp('\\.' + cls + ' \\{ background-image: url\\("(data:image\\/svg\\+xml;base64,[^"]+)"\\)'))
  const uri = m ? m[1] : ''
  return `<div class="row"><div class="mi" style="background-image:url('${uri}')"></div><span>${label}</span><em>${cls}</em></div>`
}).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f7f4f1; padding: 20px; font: 14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  .card { width: 320px; background: #fff; border-radius: 14px; padding: 8px 16px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1ece6; }
  .row:last-child { border-bottom: none; }
  .mi { width: 22px; height: 22px; background-repeat: no-repeat; background-position: center; background-size: contain; flex: none; }
  span { flex: 1; }
  em { font-style: normal; color: #9c948c; font-size: 11px; }
</style></head><body><div class="card">${cards}</div></body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/mine-icons.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 380, height: 560, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/mine-icons.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/mine-icons.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/mine-icons.png')
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
