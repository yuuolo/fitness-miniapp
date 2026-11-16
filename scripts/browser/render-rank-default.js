// 排行榜页默认项目效果图（用线上真实数据形状）
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 400px; background: #f7f4f1; padding: 16px; font: 14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  .tabs { display: flex; gap: 8px; overflow: hidden; }
  .tab { padding: 6px 14px; border-radius: 999px; background: #fff; color: #6b645c; font-size: 13px; white-space: nowrap; }
  .tab.on { background: #e9603a; color: #fff; font-weight: 600; }
  .note { display: inline-block; margin: 10px 0 12px; padding: 5px 14px; border-radius: 999px; background: #fdf0ea; color: #cf4f2b; font-size: 11.5px; }
  .bar { display: flex; gap: 8px; margin-bottom: 12px; }
  .d { flex: 1; text-align: center; padding: 8px 0; border-radius: 10px; background: #fff; color: #6b645c; font-size: 12.5px; }
  .d.on { background: #fff; color: #e9603a; font-weight: 600; box-shadow: inset 0 -2px 0 #e9603a; }
  .card { background: #fff; border-radius: 14px; padding: 14px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px dashed #f0eae4; }
  .row:last-child { border-bottom: none; }
  .no { width: 26px; text-align: center; font-weight: 600; color: #9c948c; }
  .no.top { color: #e9603a; }
  .name { flex: 1; font-size: 13.5px; }
  .tag { font-size: 10px; color: #cf4f2b; background: #fdf0ea; border-radius: 999px; padding: 1px 6px; margin-left: 4px; }
  .val { font-size: 13.5px; font-weight: 600; color: #e9603a; }
  .track { flex: 1; height: 6px; border-radius: 999px; background: #f4efea; overflow: hidden; }
  .fill { height: 100%; border-radius: 999px; background: #e9603a; }
</style></head><body>
  <div style="font-size:16px;font-weight:600;margin-bottom:12px">力量排行榜</div>
  <div class="tabs">
    <div class="tab">卧推</div><div class="tab">深蹲</div><div class="tab">硬拉</div><div class="tab">站姿肩推</div>
    <div class="tab on">引体向上</div>
  </div>
  <div class="note">默认显示最近有更新的「引体向上」</div>
  <div class="bar">
    <div class="d on">本周</div><div class="d">本月</div><div class="d">总榜</div>
  </div>
  <div class="card">
    <div class="row">
      <div class="no top">1</div>
      <div class="name">Yu<span class="tag">我</span><div class="track"><div class="fill" style="width:100%"></div></div></div>
      <div class="val">8 次</div>
    </div>
    <div class="row">
      <div class="no">2</div>
      <div class="name">店长<div class="track"><div class="fill" style="width:62%"></div></div></div>
      <div class="val">5 次</div>
    </div>
    <div class="row">
      <div class="no">3</div>
      <div class="name">小菜菜<div class="track"><div class="fill" style="width:38%"></div></div></div>
      <div class="val">3 次</div>
    </div>
  </div>
  <div style="font-size:11.5px;color:#9c948c;margin-top:12px">你最近练了哪一项，打开排行榜就先看哪一项；点别的项目后提示消失</div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/rank-default.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/rank-default.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/rank-default.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/rank-default.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
