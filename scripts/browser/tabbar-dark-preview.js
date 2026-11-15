// 生成 tabBar 在浅色/深色下的效果图，确认不会「看不见」
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const WXSS = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/custom-tab-bar/index.wxss'

const css = fs.readFileSync(WXSS, 'utf8')
// 把 rpx 换成 px（1rpx = 0.5px @375）
const toPx = s => s.replace(/(\d+(?:\.\d+)?)rpx/g, (_, n) => (Number(n) * 0.5) + 'px')

// 旧版本（依赖 page 变量，取不到就失效）用于对比
const OLD_CSS = toPx(`
.tabbar { position: relative; display: flex; align-items: center; background: var(--surface); border-top: 1rpx solid var(--line); box-shadow: var(--shadow-up); }
.tab { flex: 1; height: 100rpx; display: flex; align-items: center; justify-content: center; }
.tab-text { font-size: 26rpx; color: var(--muted); }
.tab.on .tab-text { color: var(--brand); font-weight: 600; }
`)

const bar = (title, extraCss) => `
  <div class="col">
    <div class="lab">${title}</div>
    <div class="screen">
      <div class="content">页面内容</div>
      <div class="barwrap"><div class="tabbar"><div class="tab on"><span class="tab-text">首页</span></div><div class="tab"><span class="tab-text">友圈</span></div><div class="tab"><span class="tab-text">我的</span></div></div></div>
    </div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif; padding: 22px; background: #8f8880; }
  h1 { font-size: 17px; color: #fff; margin-bottom: 4px; }
  .lead { font-size: 12px; color: rgba(255,255,255,.78); margin-bottom: 16px; }
  .row { display: flex; gap: 18px; }
  .col { width: 260px; }
  .lab { font-size: 12px; color: rgba(255,255,255,.85); text-align: center; margin-bottom: 6px; }
  .screen { border-radius: 16px; overflow: hidden; }
  .content { height: 120px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .barwrap { position: relative; }
  .tab { position: relative; }

  /* 浅色 */
  .light .screen { background: #f7f4f1; }
  .light .content { color: #23201d; }
  .light .barwrap { --surface: #ffffff; --line: #efe8e1; --muted: #9c948c; --brand: #e9603a; --shadow-up: 0 -2rpx 12rpx rgba(35,32,29,.04); }

  /* 深色 */
  .dark .screen { background: #121110; }
  .dark .content { color: #ece8e4; }
  .dark .barwrap { --surface: #1c1a18; --line: #302d29; --muted: #948c84; --brand: #f0704a; --shadow-up: 0 -2rpx 12rpx rgba(0,0,0,.3); }

  /* 旧写法：变量取不到时的样子（模拟组件无法继承变量） */
  .broken .screen { background: #121110; }
  .broken .content { color: #ece8e4; }
  .broken .barwrap { }

  ${OLD_CSS}
  ${toPx(css.replace(/@media \(prefers-color-scheme: dark\)[\s\S]*$/, ''))}
  .fixed .barwrap { }
  .dark .tabbar { background: #1c1a18; border-top-color: #302d29; }
  .dark .tab-text { color: #948c84; }
  .dark .tab.on .tab-text { color: #f0704a; }
</style></head><body>
  <h1>底部 tabBar：修复前后对比</h1>
  <div class="lead">左：旧写法在深色系统下变量取不到 → 背景透明 + 深色文字，看着像消失。右：自包含颜色，深色下依然清晰。</div>
  <div class="row">
    ${bar('旧写法 · 深色系统（view like 不见了）', '').replace('<div class="col">', '<div class="col broken">')}
    ${bar('新写法 · 深色系统', '').replace('<div class="col">', '<div class="col dark fixed">')}
  </div>
</body></html>`

fs.writeFileSync(OUT + '/tabbar-dark.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 580, height: 260, deviceScaleFactor: 3 })
  await page.goto('file:///' + (OUT + '/tabbar-dark.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 300))
  await page.screenshot({ path: OUT + '/tabbar-dark.png', fullPage: true })
  await browser.close()
  console.log('对比图: ' + OUT + '/tabbar-dark.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
