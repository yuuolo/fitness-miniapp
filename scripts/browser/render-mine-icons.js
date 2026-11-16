// 把 mine.wxss 里的 5 个图标渲染出来看效果
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const css = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/mine/mine.wxss', 'utf8')
const icons = {}
for (const m of css.matchAll(/\.mi-(\w+) \{ background-image: url\("data:image\/svg\+xml;base64,([^"]+)"\)/g)) {
  icons[m[1]] = Buffer.from(m[2], 'base64').toString('utf8')
}

const NAMES = { chart: '我的身体数据', trophy: '力量排行榜', flame: '竞赛', book: '算法说明', tool: '员工工作台' }
const cards = Object.entries(icons).map(([k, svg]) => `
  <div class="row">
    <div class="icn">${svg}</div>
    <span class="lb">${NAMES[k] || k}</span>
    <span class="chev">›</span>
  </div>`).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 380px; background: #f7f4f1; padding: 16px; font: 14px/1.5 -apple-system,"Microsoft YaHei",sans-serif; }
  .card { background: #fff; border-radius: 14px; padding: 8px 20px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .row { display: flex; align-items: center; padding: 13px 0; border-bottom: 1px solid #f5f0ea; }
  .row:last-child { border-bottom: none; }
  .icn { width: 22px; height: 22px; flex: none; margin-right: 9px; }
  .icn svg { width: 20px; height: 20px; display: block; }
  .lb { flex: 1; font-size: 14px; color: #23201d; }
  .chev { color: #c9c2ba; font-size: 16px; }
</style></head><body>
  <div style="font-size:15px;font-weight:600;margin-bottom:10px">我的 · 功能菜单</div>
  <div class="card">${cards}</div>
  <div style="font-size:11.5px;color:#9c948c;margin-top:10px">图标 44rpx（20px），左边距 18rpx；原来是空 view 没有尺寸，所以塌成一个红点</div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/mine-icons.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 380, height: 380, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/mine-icons.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/mine-icons.png', fullPage: true })
  await browser.close()
  console.log('图标数: ' + Object.keys(icons).length)
  console.log('效果图: ' + out + '/mine-icons.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
