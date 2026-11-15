// 生成「我的」页外观切换器 + 深/浅对比图
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

const LIGHT = { bg: '#f7f4f1', surface: '#fff', ink: '#23201d', sub: '#6b645c', muted: '#9c948c', fill: '#f4efea', brand: '#e9603a', soft: '#fdf0ea', line: '#f5f0ea' }
const DARK = { bg: '#121110', surface: '#1c1a18', ink: '#ece8e4', sub: '#b7afa6', muted: '#948c84', fill: '#262320', brand: '#f0704a', soft: 'rgba(240,112,74,.16)', line: '#262320' }

const seg = (c, active) => `
  <div class="seg" style="background:${c.fill}">
    <div class="seg-item ${active === 'auto' ? 'on' : ''}" style="${active === 'auto' ? 'background:' + c.surface + ';color:' + c.brand : 'color:' + c.sub}">跟随系统</div>
    <div class="seg-item ${active === 'light' ? 'on' : ''}" style="${active === 'light' ? 'background:' + c.surface + ';color:' + c.brand : 'color:' + c.sub}">浅色</div>
    <div class="seg-item ${active === 'dark' ? 'on' : ''}" style="${active === 'dark' ? 'background:' + c.surface + ';color:' + c.brand : 'color:' + c.sub}">深色</div>
  </div>`

const screen = (c, label, active) => `
  <div class="col">
    <div class="lab">${label}</div>
    <div class="screen" style="background:${c.bg}">
      <div class="card" style="background:${c.surface}">
        <div class="between">
          <div>
            <div class="t" style="color:${c.ink}">外观</div>
            <div class="d" style="color:${c.muted}">深色模式可手动切换，也可以跟随系统</div>
          </div>
          ${seg(c, active)}
        </div>
      </div>
      <div class="card" style="background:${c.surface}">
        <div class="mi" style="border-color:${c.line}"><span style="color:${c.ink}">我的身体数据</span><span style="color:${c.muted}">›</span></div>
        <div class="mi" style="border-color:${c.line}"><span style="color:${c.ink}">力量排行榜</span><span style="color:${c.muted}">›</span></div>
      </div>
      <div class="tabbar" style="background:${c.surface};border-color:${c.line}">
        <div class="tb" style="color:${c.muted}">首页</div>
        <div class="tb" style="color:${c.muted}">友圈</div>
        <div class="tb on" style="color:${c.brand}">我的</div>
      </div>
    </div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #55504b; font: 13px/1.6 -apple-system,"Microsoft YaHei",sans-serif; padding: 22px; }
  h1 { font-size: 16px; color: #fff; margin-bottom: 4px; }
  .lead { font-size: 12px; color: rgba(255,255,255,.75); margin-bottom: 16px; }
  .row { display: flex; gap: 20px; }
  .col { width: 300px; }
  .lab { font-size: 12px; color: rgba(255,255,255,.85); text-align: center; margin-bottom: 6px; }
  .screen { border-radius: 18px; padding: 11px; }
  .card { border-radius: 12px; padding: 13px; margin-bottom: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
  .between { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .t { font-size: 14px; font-weight: 600; }
  .d { font-size: 11px; margin-top: 2px; }
  .seg { display: flex; border-radius: 999px; padding: 2px; flex: none; }
  .seg-item { padding: 4px 9px; border-radius: 999px; font-size: 11px; white-space: nowrap; }
  .seg-item.on { font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  .mi { display: flex; justify-content: space-between; padding: 10px 0; font-size: 13px; border-bottom: 1px solid; }
  .mi:last-child { border-bottom: 0; }
  .tabbar { display: flex; border-top: 1px solid; border-radius: 0 0 14px 14px; margin: 0 -11px -11px; }
  .tb { flex: 1; text-align: center; padding: 9px 0; font-size: 12px; position: relative; }
  .tb.on { font-weight: 600; }
  .tb.on::before { content:''; position:absolute; top:0; left:50%; transform:translateX(-50%); width:20px; height:2px; border-radius:0 0 2px 2px; background: currentColor; }
</style></head><body>
  <h1>外观开关（我的 → 外观）</h1>
  <div class="lead">三档：跟随系统 / 浅色 / 深色，选择存在本地，重启小程序仍记得</div>
  <div class="row">
    ${screen(LIGHT, '浅色（手动选浅色）', 'light')}
    ${screen(DARK, '深色（手动选深色）', 'dark')}
  </div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(OUT + '/theme-switch.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 660, height: 330, deviceScaleFactor: 3 })
  await page.goto('file:///' + (OUT + '/theme-switch.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: OUT + '/theme-switch.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + OUT + '/theme-switch.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
