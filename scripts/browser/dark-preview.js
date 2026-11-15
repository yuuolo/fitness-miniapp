// 从 app.wxss 读取浅色/深色两套变量，渲染「浅色 vs 深色」对比图
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const APP_WXSS = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/app.wxss'

const css = fs.readFileSync(APP_WXSS, 'utf8')

// 浅色：页面里第一个 page { ... } 变量块
function varsFrom(text) {
  const out = {}
  for (const m of text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
const lightPart = darkStart > 0 ? css.slice(0, darkStart) : css
const darkPart = darkStart > 0 ? css.slice(darkStart) : ''

const light = varsFrom(lightPart)
const dark = Object.assign({}, light, varsFrom(darkPart))

// rpx -> px（按 375 宽）
const px = v => String(v || '').replace(/(\d+(?:\.\d+)?)rpx/g, (_, n) => (Number(n) * 0.5) + 'px')

const ROWS = [
  { rank: 1, name: '阿强', value: 163.3, pct: 100 },
  { rank: 2, name: '小林', value: 132.0, pct: 81 },
  { rank: 3, name: '老王', value: 116.7, pct: 71 },
  { rank: 4, name: '小陈', value: 93.5, pct: 57 }
]

const screen = (c, label) => `
  <div class="col">
    <div class="lab">${label}</div>
    <div class="screen" style="background:${c.bg}">
      <div class="hero" style="background:linear-gradient(135deg,${c['brand-grad-a']},${c['brand-grad-b']})">
        <div class="hello">你好，店长</div>
        <div class="hsub">今天也要动起来 · 积分 120</div>
      </div>

      <div class="card" style="background:${c.surface};border-radius:${px(c['r-lg'])};box-shadow:${c.shadow}">
        <div class="between">
          <span style="color:${c.ink};font-size:15px;font-weight:600">卧推排行榜</span>
          <span style="color:${c.muted};font-size:11px">查看全部 ›</span>
        </div>
        ${ROWS.map(r => `
          <div class="row">
            <div class="no" style="color:${r.rank <= 3 ? c.brand : c.muted}">${r.rank}</div>
            <div class="grow">
              <div class="between">
                <span style="color:${c.ink};font-size:13px">${r.name}</span>
                <span style="color:${c.brand};font-weight:600;font-size:13px">${r.value} kg</span>
              </div>
              <div class="track" style="background:${c.fill}">
                <div class="fill" style="width:${r.pct}%;background:${r.rank === 1
                  ? 'linear-gradient(90deg,' + c['brand-grad-a'] + ',' + c['brand-grad-b'] + ')'
                  : c['brand-line']}"></div>
              </div>
            </div>
          </div>`).join('')}
        <div class="mutedline" style="color:${c.muted}">我的排名第 2 名 · 共 4 人</div>
      </div>

      <div style="display:flex;gap:8px">
        <div class="q" style="background:${c.surface};border-radius:${px(c['r-md'])};box-shadow:${c.shadow}">
          <div style="color:${c.ink};font-size:13px;font-weight:600">约团课</div>
          <div style="color:${c.muted};font-size:11px">瑜伽 单车</div>
        </div>
        <div class="q" style="background:${c.surface};border-radius:${px(c['r-md'])};box-shadow:${c.shadow}">
          <div style="color:${c.ink};font-size:13px;font-weight:600">健身友圈</div>
          <div style="color:${c.muted};font-size:11px">晒训练</div>
        </div>
      </div>

      <div class="menu" style="background:${c.surface};border-radius:${px(c['r-lg'])};box-shadow:${c.shadow}">
        <div class="mi"><span style="color:${c.ink}">身体数据</span><span style="color:${c.ph}">›</span></div>
        <div class="mi"><span style="color:${c.ink}">力量排行榜</span><span style="color:${c.ph}">›</span></div>
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
  body { background: #8f8880; font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif; padding: 24px; }
  h1 { font-size: 18px; color: #fff; margin-bottom: 4px; }
  .lead { font-size: 12px; color: rgba(255,255,255,.75); margin-bottom: 18px; }
  .wrap { display: flex; gap: 24px; align-items: flex-start; }
  .col { width: 300px; }
  .lab { font-size: 12px; color: rgba(255,255,255,.85); text-align: center; margin-bottom: 7px; }
  .screen { border-radius: 18px; padding: 11px; border: 1px solid rgba(0,0,0,.08); }
  .hero { border-radius: 12px; padding: 17px 13px; color: #fff; margin-bottom: 10px; }
  .hello { font-size: 18px; font-weight: 600; }
  .hsub { font-size: 10px; opacity: .9; margin-top: 4px; }
  .card { padding: 12px; margin-bottom: 10px; }
  .between { display: flex; align-items: center; justify-content: space-between; }
  .row { display: flex; gap: 8px; padding: 9px 0; border-bottom: 1px solid rgba(128,128,128,.12); }
  .row:last-of-type { border-bottom: 0; }
  .no { width: 14px; flex: none; font-weight: 600; font-size: 12px; text-align: center; }
  .grow { flex: 1; }
  .track { height: 5px; border-radius: 99px; margin: 6px 0 0; overflow: hidden; }
  .fill { height: 100%; border-radius: 99px; }
  .mutedline { font-size: 11px; margin-top: 8px; }
  .q { flex: 1; padding: 11px; }
  .menu { padding: 4px 13px; margin-top: 10px; }
  .mi { display: flex; justify-content: space-between; padding: 9px 0; font-size: 13px; border-bottom: 1px solid rgba(128,128,128,.12); }
  .mi:last-child { border-bottom: 0; }
  .tabbar { display: flex; border-top: 1px solid; border-radius: 0 0 12px 12px; margin: 10px -11px -11px; }
  .tb { flex: 1; text-align: center; padding: 8px 0; font-size: 12px; }
  .tb.on { font-weight: 600; position: relative; }
  .tb.on::before { content:''; position:absolute; top:0; left:50%; transform:translateX(-50%); width:20px; height:2px; border-radius:0 0 2px 2px; background: currentColor; }
</style></head><body>
  <h1>深色模式</h1>
  <div class="lead">同一套变量，只覆盖颜色。深色下主色提亮到 #f0704a，文字用暖白，阴影加重。</div>
  <div class="wrap">
    ${screen(light, '浅色（当前默认）')}
    ${screen(dark, '深色（跟随系统）')}
  </div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
const htmlPath = OUT + '/dark.html'
fs.writeFileSync(htmlPath, html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 700, height: 640, deviceScaleFactor: 3 })
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 400))
  await page.screenshot({ path: OUT + '/dark.png', fullPage: true })
  await browser.close()
  console.log('深色对比图: ' + OUT + '/dark.png')
  console.log('浅色变量数: ' + Object.keys(light).length + ' | 深色覆盖: ' + (Object.keys(dark).length - Object.keys(light).length + Object.keys(varsFrom(darkPart)).length))
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
