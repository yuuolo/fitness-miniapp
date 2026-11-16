// 效果图：报告图完整显示 + 转发卡片 + 教练端转发入口
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const REPORT = 'https://gym.novrein.com/api/media/9c23dfbde22451c786ee875098f904f4'

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { display: flex; gap: 14px; background: #f7f4f1; padding: 16px; font: 13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  .col { flex: 1; }
  .cap { font-size: 11.5px; color: #9c948c; margin: 6px 0 8px; }
  .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 10px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .title { font-size: 15px; font-weight: 600; }
  .muted { font-size: 12px; color: #9c948c; }
  .report { width: 100%; display: block; border-radius: 10px; background: #f4efea; }
  .btn { display: block; width: 100%; text-align: center; padding: 10px; border-radius: 10px; font-size: 13px; margin-top: 10px; border: 1px solid #e9603a; color: #cf4f2b; background: #fff; }
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #f5f0ea; }
  .row:last-child { border-bottom: none; }
  .row .grow { flex: 1; }
  .mini { padding: 5px 14px; border-radius: 999px; border: 1px solid #e9603a; color: #cf4f2b; font-size: 12px; background: #fff; }
  .scaled { position: relative; }
  .scaled .mask { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); border-radius: 10px; color: #fff; font-size: 12px; }
</style></head><body>
  <div class="col">
    <div class="title">我的身体数据</div>
    <div class="cap">报告图按原始比例完整显示（不再被裁成固定高度）</div>
    <div class="card">
      <div class="muted">体测报告</div>
      <img class="report" src="${REPORT}">
      <div class="muted" style="margin-top:6px">点图片可以放大查看</div>
    </div>
    <div class="card">
      <div class="cap" style="margin-top:0">点图片 → 全屏看图（wx.previewImage）</div>
      <div class="scaled">
        <img class="report" src="${REPORT}">
        <div class="mask">双指缩放 · 左右滑动</div>
      </div>
    </div>
  </div>
  <div class="col">
    <div class="title">转发给朋友</div>
    <div class="cap">会员自己转发 / 教练指定某个会员转发</div>
    <div class="card">
      <div class="muted">把这份身体数据发给朋友：点右上角「···」→ 转发，或点下面的按钮。</div>
      <div class="btn">转发给朋友</div>
      <div class="muted" style="margin-top:8px">对方打开后能看到身体评分、指标和历史记录（不含手机号）。</div>
    </div>
    <div class="card">
      <div class="muted" style="margin-bottom:6px">教练端 · 会员详情</div>
      <div class="row">
        <div class="grow">
          <div>转发这份资料给朋友</div>
          <div class="muted">发到微信里，对方打开能看到 TA 的身体数据</div>
        </div>
        <div class="mini">转发</div>
      </div>
      <div class="row">
        <div class="grow">
          <div>查看公开资料</div>
          <div class="muted">只读页面，会员都能看到，还会和我的数据做对比</div>
        </div>
        <div class="muted">›</div>
      </div>
    </div>
    <div class="card">
      <div class="muted" style="margin-bottom:6px">分享出去的样子（微信卡片）</div>
      <div style="border:1px solid #eee;border-radius:10px;padding:10px;display:flex;gap:8px">
        <div style="width:44px;height:44px;border-radius:8px;background:#f4efea;flex:none;overflow:hidden">
          <img src="${REPORT}" style="width:100%;height:100%;object-fit:cover">
        </div>
        <div>
          <div style="font-size:12.5px">我的身体数据 · 76 分（2026-11-16）</div>
          <div class="muted">小程序</div>
        </div>
      </div>
    </div>
  </div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/report-share.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 760, height: 900, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/report-share.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 40000 })
  await new Promise(r => setTimeout(r, 1500))
  await page.screenshot({ path: out + '/report-share.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/report-share.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
