// 从 mine.wxss 里取出 SVG 的 base64，用 Chrome 渲染，确认图标本身有效
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const WXSS = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/mine/mine.wxss'

const wxss = fs.readFileSync(WXSS, 'utf8')
const icons = {}
for (const m of wxss.matchAll(/\.(mi-[\w-]+)\s*\{\s*background-image:\s*url\("data:image\/svg\+xml;base64,([^"]+)"\)/g)) {
  icons[m[1]] = m[2]
}
console.log('提取到 ' + Object.keys(icons).length + ' 个图标: ' + Object.keys(icons).join(', '))

const NAMES = {
  'mi-card': '会员卡',
  'mi-list': '我的预约',
  'mi-chart': '身体数据',
  'mi-trophy': '排行榜',
  'mi-flame': '竞赛',
  'mi-tool': '员工工作台'
}

const cell = (cls, b64) => `
  <div class="cell">
    <div class="box"><div class="ic" style="background-image:url('data:image/svg+xml;base64,${b64}')"></div></div>
    <div class="nm">${NAMES[cls] || cls}</div>
    <div class="cd">.${cls}</div>
  </div>`

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #f7f4f1; font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif;
    color: #23201d; padding: 24px; width: 700px;
  }
  h1 { font-size: 17px; margin-bottom: 4px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 18px; }
  .row { display: flex; gap: 10px; }
  .cell { flex: 1; text-align: center; }
  .box {
    background: #fff; border-radius: 12px; padding: 14px 0;
    box-shadow: 0 2px 10px rgba(35,32,29,.05);
  }
  .ic {
    width: 22px; height: 22px; margin: 0 auto;
    background-repeat: no-repeat; background-position: center; background-size: 22px 22px;
  }
  .nm { font-size: 12px; margin-top: 8px; }
  .cd { font-size: 10px; color: #9c948c; font-family: ui-monospace, Consolas, monospace; }
  /* 真实列表排版，验证图标与文字的垂直对齐 */
  .list { background: #fff; border-radius: 12px; margin-top: 18px; padding: 8px 16px; box-shadow: 0 2px 10px rgba(35,32,29,.05); }
  .li { display: flex; align-items: center; padding: 13px 0; border-bottom: 1px solid #f5f0ea; font-size: 15px; }
  .li:last-child { border-bottom: 0; }
  .li .ic { margin: 0 14px 0 0; }
  .chev { color: #c3bab1; font-size: 16px; }
  .grow { flex: 1; }
</style></head><body>
  <h1>菜单图标（内联 SVG）</h1>
  <div class="lead">替换掉 emoji 后的 6 个图标，统一 1.8 线宽、圆头端点、暖灰描边 #6b645c</div>
  <div class="row">
    ${Object.keys(NAMES).map(k => icons[k] ? cell(k, icons[k]) : '').join('')}
  </div>
  <div class="list">
    ${Object.keys(NAMES).map(k => icons[k] ? `
      <div class="li">
        <div class="ic" style="background-image:url('data:image/svg+xml;base64,${icons[k]}')"></div>
        <span class="grow">${NAMES[k]}</span>
        <span class="chev">›</span>
      </div>` : '').join('')}
  </div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
const htmlPath = OUT + '/icons.html'
fs.writeFileSync(htmlPath, html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 700, height: 460, deviceScaleFactor: 3 })
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 500))
  // 检查每个图标的背景图是否真的加载成功
  const loaded = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ic')).map(el => {
      const bg = getComputedStyle(el).backgroundImage
      return { ok: bg && bg.indexOf('data:image/svg+xml') >= 0, len: bg.length }
    })
  })
  const okCount = loaded.filter(l => l.ok).length
  console.log('背景图加载成功: ' + okCount + '/' + loaded.length)
  await page.screenshot({ path: OUT + '/icons.png', fullPage: true })
  await browser.close()
  console.log('图标预览: ' + OUT + '/icons.png')
  process.exit(okCount === loaded.length ? 0 : 1)
})().catch(e => { console.error('失败:', e.message); process.exit(2) })
