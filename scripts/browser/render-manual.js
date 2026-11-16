// 用说明书页面的真实数据生成效果图
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const src = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/manual/manual.js', 'utf8')
let cfg = null
new Function('Page', src)(c => { cfg = c })
const sections = cfg.data.sections

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 420px; background: #f7f4f1; padding: 14px; font: 14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  .card { background: #fff; border-radius: 14px; padding: 18px; margin-bottom: 12px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .title { font-size: 17px; font-weight: 600; }
  .muted { font-size: 12px; color: #9c948c; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .mini-btn { padding: 0 12px; height: 28px; line-height: 28px; font-size: 12px; border-radius: 999px; background: #fdf0ea; color: #cf4f2b; }
  .mini-btn.gray { background: #f4efea; color: #6b645c; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .para { font-size: 13px; color: #6b645c; margin-top: 10px; }
  .tbl { margin-top: 12px; }
  .tr { display: flex; padding: 10px 0; border-bottom: 1px dashed #f0eae4; }
  .tr:last-child { border-bottom: none; }
  .td-k { width: 100px; flex: none; font-size: 13px; font-weight: 500; }
  .td-v { flex: 1; font-size: 12.5px; color: #6b645c; }
  .formulas { margin-top: 12px; padding: 12px; border-radius: 10px; background: #f7f4f1; }
  .formula { font-size: 12px; padding: 3px 0; color: #23201d; }
  .notes { margin-top: 10px; }
  .note { font-size: 11.5px; color: #9c948c; padding-left: 12px; position: relative; }
  .note::before { content: '·'; position: absolute; left: 2px; }
</style></head><body>
  <div class="card">
    <div class="title">系统算法说明</div>
    <div class="muted" style="margin-top:6px">评分、力量成绩、排行榜和能力图分别是怎么算出来的。所有数字都来自系统的实际实现。</div>
    <div class="row"><span class="mini-btn">全部展开</span><span class="mini-btn gray">全部收起</span></div>
  </div>
  ${sections.map((s, i) => `
  <div class="card">
    <div class="head"><span class="title">${i + 1}. ${esc(s.title)}</span><span class="muted">收起</span></div>
    ${(s.paras || []).map(p => `<div class="para">${esc(p)}</div>`).join('')}
    ${(s.items && s.items.length) ? `<div class="tbl">${s.items.map(it => `<div class="tr"><span class="td-k">${esc(it.k)}</span><span class="td-v">${esc(it.v)}</span></div>`).join('')}</div>` : ''}
    ${(s.formulas && s.formulas.length) ? `<div class="formulas">${s.formulas.map(f => `<div class="formula">${esc(f)}</div>`).join('')}</div>` : ''}
    ${(s.notes && s.notes.length) ? `<div class="notes">${s.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}</div>` : ''}
  </div>`).join('')}
  <div class="muted" style="text-align:center;padding:10px 0 4px">内容随算法调整同步更新</div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(out + '/manual-page.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/manual-page.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/manual-page.png', fullPage: true })
  await browser.close()
  const st = fs.statSync(out + '/manual-page.png')
  console.log('效果图: ' + out + '/manual-page.png (' + Math.round(st.size / 1024) + ' KB)')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
