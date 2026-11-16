// 生成「运动数据按类型区分字段」的对比图
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const TYPES = [
  { name: '步行', desc: '上下班走路、散步', fields: [['步数', '步', '必填'], ['距离', '公里', ''], ['时长', '分钟', '']] },
  { name: '骑行', desc: '单车、动感单车', fields: [['距离', '公里', '至少一项'], ['时长', '分钟', '至少一项'], ['消耗', '千卡', ''], ['平均心率', '次/分', '']] },
  { name: '力量训练', desc: '器械、自由重量训练', fields: [['时长', '分钟', '必填'], ['消耗', '千卡', ''], ['平均心率', '次/分', '']] }
]

const card = t => `
  <div class="q">
    <div class="t">${t.name}</div>
    <div class="d">${t.desc}</div>
    ${t.fields.map(f => `
      <div class="row">
        <span class="lb">${f[0]}<i>（${f[1]}）</i></span>
        <span class="in ${f[2] === '必填' ? 'req' : ''}">${f[2] || ''}</span>
      </div>`).join('')}
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 760px; background: #f7f4f1; padding: 20px; font: 14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 14px; }
  .wrap { display: flex; gap: 12px; }
  .q { flex: 1; background: #fff; border-radius: 14px; padding: 14px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .t { font-size: 15px; font-weight: 600; }
  .d { font-size: 11.5px; color: #9c948c; margin-bottom: 8px; }
  .row { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed #f0eae4; padding: 7px 0; }
  .row:last-child { border-bottom: none; }
  .lb { font-size: 12.5px; color: #23201d; }
  .lb i { font-size: 11px; color: #9c948c; font-style: normal; }
  .in { font-size: 11px; color: #cf4f2b; background: #fdf0ea; border-radius: 999px; padding: 1px 8px; min-width: 46px; text-align: center; }
  .in.req { background: #e9603a; color: #fff; }
  .in:empty { visibility: hidden; }
</style></head><body>
  <h1>记录运动 · 每种类型字段不一样</h1>
  <div class="lead">右边的输入项只显示该运动需要的指标；步数只出现在步行/跑步里</div>
  <div class="wrap">${TYPES.map(card).join('')}</div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/activity-types.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 760, height: 260, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/activity-types.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/activity-types.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/activity-types.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
