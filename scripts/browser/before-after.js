// 生成「改造前后」对比样张：左侧旧配色，右侧新配色，同一套组件
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

// 旧配色（改造前线上真实值）
const OLD = {
  brand: '#ff6a3d', gradA: '#ff6a3d', gradB: '#ff9a5c',
  ink: '#1f2329', sub: '#5c6370', muted: '#8a8f99', ph: '#b8bcc4',
  bg: '#f5f6f8', surface: '#fff', line: '#f0f1f4',
  ok: '#1a9a4b', okSoft: '#e8f7ee', danger: '#d93a3a', dangerSoft: '#fdecec',
  brandSoft: '#fff1eb', radius: '10px', cardShadow: 'none'
}

// 新配色（当前设计变量）
const NEW = {
  brand: '#e9603a', gradA: '#e9603a', gradB: '#f18a5f',
  ink: '#23201d', sub: '#6b645c', muted: '#9c948c', ph: '#c3bab1',
  bg: '#f7f4f1', surface: '#fff', line: '#efe8e1',
  ok: '#2e9668', okSoft: '#e9f6ef', danger: '#c9433d', dangerSoft: '#fceceb',
  brandSoft: '#fdf0ea', radius: '12px', cardShadow: '0 2px 10px rgba(35,32,29,.05)'
}

const screen = (c, label) => `
  <div class="col">
    <div class="lab">${label}</div>
    <div class="phone" style="background:${c.bg}">
      <div class="hero" style="background:linear-gradient(135deg,${c.gradA},${c.gradB})">
        <div class="hello">你好，店长</div>
        <div class="hsub">今天也要动起来 · 积分 120</div>
      </div>
      <div class="card" style="background:${c.surface};border-radius:${c.radius};box-shadow:${c.cardShadow}">
        <div class="t" style="color:${c.ink}">卧推排行榜</div>
        <div class="li" style="border-color:${c.line}">
          <span style="color:${c.muted}">1</span><span class="grow" style="color:${c.ink}">参赛会员</span>
          <span style="color:${c.brand};font-weight:600">143 kg</span>
        </div>
        <div class="li" style="border-color:${c.line}">
          <span style="color:${c.muted}">2</span><span class="grow" style="color:${c.ink}">会员小明</span>
          <span style="color:${c.brand};font-weight:600">121 kg</span>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="q" style="background:${c.surface};border-radius:${c.radius};box-shadow:${c.cardShadow}">
          <div style="color:${c.ink};font-size:13px;font-weight:600">约团课</div>
          <div style="color:${c.muted};font-size:11px">瑜伽 单车</div>
        </div>
        <div class="q" style="background:${c.surface};border-radius:${c.radius};box-shadow:${c.cardShadow}">
          <div style="color:${c.ink};font-size:13px;font-weight:600">健身友圈</div>
          <div style="color:${c.muted};font-size:11px">晒训练</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:9px">
        <span class="tag" style="background:${c.okSoft};color:${c.ok}">可用</span>
        <span class="tag" style="background:${c.dangerSoft};color:${c.danger}">已过期</span>
        <span class="tag" style="background:${c.line};color:${c.sub}">普通</span>
      </div>
      <div style="display:flex;gap:7px;margin-top:9px">
        <span class="btn" style="background:${c.brand}">主要按钮</span>
        <span class="btn ghost" style="color:${c.brand};border-color:${c.brandSoft};background:${c.surface}">次要</span>
      </div>
      <div class="tabbar" style="background:${c.surface};border-color:${c.line}">
        <div class="tb on" style="color:${c.brand}">首页</div>
        <div class="tb" style="color:${c.muted}">友圈</div>
        <div class="tb" style="color:${c.muted}">我的</div>
      </div>
    </div>
  </div>`

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ece7e2; font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif; padding: 26px; }
  h1 { font-size: 19px; color: #23201d; margin-bottom: 4px; }
  .lead { font-size: 13px; color: #6b645c; margin-bottom: 20px; }
  .wrap { display: flex; gap: 26px; align-items: flex-start; }
  .col { width: 320px; }
  .lab { font-size: 12px; color: #6b645c; margin-bottom: 8px; text-align: center; }
  .phone { border-radius: 20px; padding: 12px; border: 1px solid rgba(0,0,0,.06); }
  .hero { border-radius: 12px; padding: 18px 14px; color: #fff; margin-bottom: 11px; }
  .hello { font-size: 19px; font-weight: 600; }
  .hsub { font-size: 11px; opacity: .9; margin-top: 4px; }
  .card { padding: 12px; margin-bottom: 11px; }
  .t { font-size: 14px; font-weight: 600; }
  .li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid; font-size: 12px; }
  .li:last-child { border-bottom: 0; }
  .grow { flex: 1; }
  .q { flex: 1; padding: 11px; }
  .tag { font-size: 10px; padding: 1px 6px; border-radius: 6px; }
  .btn { display: inline-flex; align-items: center; height: 26px; padding: 0 13px; border-radius: 999px; color: #fff; font-size: 12px; }
  .btn.ghost { border: 1px solid; }
  .tabbar { display: flex; border-top: 1px solid; border-radius: 0 0 14px 14px; margin: 0 -12px -12px; }
  .tb { flex: 1; text-align: center; padding: 8px 0; font-size: 12px; }
  .tb.on { font-weight: 600; }
  .arrow { text-align: center; font-size: 26px; color: #9c948c; padding-top: 150px; }
</style></head><body>
  <h1>配色改造前后对比</h1>
  <div class="lead">同一套组件，只换颜色与圆角。右边把冷灰底改成暖米底，主色压低饱和，圆角统一。</div>
  <div class="wrap">
    ${screen(OLD, '改造前：冷灰底 + 荧光橙')}
    <div class="arrow">→</div>
    ${screen(NEW, '改造后：暖米底 + 沉稳橙')}
  </div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
const htmlPath = OUT + '/compare.html'
fs.writeFileSync(htmlPath, html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 760, height: 700, deviceScaleFactor: 3 })
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: OUT + '/compare.png', fullPage: true })
  await browser.close()
  console.log('对比图: ' + OUT + '/compare.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
