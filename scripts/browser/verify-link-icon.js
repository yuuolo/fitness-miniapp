// 校验 index.wxss 里快捷入口图标的 SVG 是否有效（用 Chrome 渲染同一份 base64）
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const WXSS = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.wxss'

const css = fs.readFileSync(WXSS, 'utf8')
const m = css.match(/\.link-icon\s*\{[\s\S]*?base64,([^"')]+)/)
if (!m) { console.error('没找到 .link-icon 的 base64'); process.exit(1) }
const b64 = m[1]
console.log('提取到 base64，长度 ' + b64.length)

// 顺便把 SVG 解出来看看路径数量
const svg = Buffer.from(b64, 'base64').toString('utf8')
console.log('SVG 头: ' + svg.slice(0, 100))
console.log('path 数量: ' + (svg.match(/<path/g) || []).length)

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { margin:0; background:#f7f4f1; padding:24px; font:14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; width:520px; }
  .row { display:flex; gap:14px; align-items:center; margin-bottom:16px; }
  .card { background:#fff; border-radius:12px; padding:14px; display:flex; align-items:center; box-shadow:0 2px 10px rgba(35,32,29,.05); flex:1; }
  .link-icon {
    width:36px; height:36px; flex:none; border-radius:9px;
    background:#fdf0ea url("data:image/svg+xml;base64,${b64}") no-repeat center;
    background-size:20px 20px; margin-right:10px;
  }
  .t { font-weight:600; }
  .d { color:#9c948c; font-size:12px; }
  .chev { color:#c3bab1; }
  h3 { font-size:14px; margin:0 0 10px; }
</style></head><body>
  <h3>快捷入口卡片（新图标）</h3>
  <div class="row">
    <div class="card">
      <div class="link-icon"></div>
      <div style="flex:1"><div class="t">快速约课</div><div class="d">点这里直接排课表</div></div>
      <div class="chev">›</div>
    </div>
  </div>
  <div class="row">
    <div class="card">
      <div class="link-icon"></div>
      <div style="flex:1"><div class="t">会员资料与体测</div><div class="d">查会员、录体测</div></div>
      <div class="chev">›</div>
    </div>
  </div>
</body></html>`

fs.writeFileSync(OUT + '/link-icon.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 520, height: 260, deviceScaleFactor: 3 })
  await page.goto('file:///' + (OUT + '/link-icon.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })

  const loaded = await page.evaluate(() => {
    const ics = Array.from(document.querySelectorAll('.link-icon'))
    return ics.map(el => {
      const bg = getComputedStyle(el).backgroundImage
      return { hasSvg: bg.indexOf('data:image/svg+xml') >= 0, w: el.offsetWidth, h: el.offsetHeight }
    })
  })
  console.log('图标渲染: ' + JSON.stringify(loaded))

  await page.screenshot({ path: OUT + '/link-icon.png', fullPage: true })
  await browser.close()
  const okCount = loaded.filter(l => l.hasSvg && l.w > 0).length
  console.log('有效图标: ' + okCount + '/' + loaded.length)
  console.log('截图: ' + OUT + '/link-icon.png')
  process.exit(okCount === loaded.length ? 0 : 1)
})().catch(e => { console.error('失败:', e.message); process.exit(2) })
