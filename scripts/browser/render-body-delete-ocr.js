// 效果图：历史体测删除按钮 + OCR 自动保存报告图
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const REPORT = 'https://gym.novrein.com/api/media/9c23dfbde22451c786ee875098f904f4'

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { display: flex; gap: 14px; background: #f7f4f1; padding: 16px; font: 13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d; }
  .col { flex: 1; }
  .cap { font-size: 11.5px; color: #9c948c; margin: 4px 0 8px; }
  .title { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .card { background: #fff; border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #f5f0ea; }
  .row:last-child { border-bottom: none; }
  .grow { flex: 1; }
  .muted { font-size: 12px; color: #9c948c; }
  .tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: #f4efea; color: #6b645c; margin-left: 4px; }
  .del { padding: 5px 16px; border-radius: 999px; background: #f4efea; color: #6b645c; font-size: 12px; border: none; }
  .report { width: 46px; height: 46px; border-radius: 8px; object-fit: cover; object-position: top; flex: none; }
  .tip { background: #fdf0ea; color: #cf4f2b; border-radius: 10px; padding: 9px 12px; font-size: 12px; }
</style></head><body>
  <div class="col">
    <div class="title">身体数据历史</div>
    <div class="cap">每条记录右侧有「删除」，误传的资料可以删掉</div>
    <div class="card">
      <div class="row">
        <div class="grow">
          <div>2026-04-01 <span class="tag">22.3 BMI</span></div>
          <div class="muted">评分 75</div>
        </div>
        <div class="muted">68.2 kg · 18%</div>
        <button class="del">删除</button>
      </div>
      <div class="row">
        <div class="grow">
          <div>2026-03-01 <span class="tag">23.0 BMI</span></div>
          <div class="muted">评分 72 · 设备 71 分</div>
        </div>
        <div class="muted">70.5 kg · 20%</div>
        <button class="del">删除</button>
      </div>
    </div>
    <div class="cap">删除后：会员档案的「最新身体数据」自动换成剩下最新一条，评分同步重算</div>
    <div class="card">
      <div class="muted" style="margin-bottom:6px">确认弹窗</div>
      <div style="border:1px solid #eee;border-radius:10px;padding:14px;text-align:center">
        <div style="font-weight:600;margin-bottom:6px">删除这条体测记录？</div>
        <div class="muted" style="line-height:1.6">2026-04-01 的记录删除后不能恢复；会员档案里的「最新身体数据」会自动换成剩下最新的一条。</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <div style="flex:1;padding:8px;border-radius:8px;background:#f7f4f1;color:#6b645c">取消</div>
          <div style="flex:1;padding:8px;border-radius:8px;background:#e9603a;color:#fff">删除</div>
        </div>
      </div>
    </div>
  </div>
  <div class="col">
    <div class="title">识别报告 → 自动保存报告图</div>
    <div class="cap">选一张报告照片识别，这张图会直接存成「体测报告照片」</div>
    <div class="card">
      <div class="tip">已识别，报告照片已保存</div>
      <div class="row" style="margin-top:10px">
        <img class="report" src="${REPORT}">
        <div class="grow">
          <div>体测报告照片</div>
          <div class="muted">识别用的原图，不用再单独上传一次</div>
        </div>
        <button class="del">移除</button>
      </div>
      <div class="row">
        <div class="grow">
          <div>识别到 29 项指标</div>
          <div class="muted">体重 88.35 / 体脂 29% / 骨骼肌 33.8kg …</div>
        </div>
      </div>
    </div>
    <div class="cap">保存体测后，报告图会跟着这条记录一起存档，点开可放大查看</div>
    <div class="card">
      <img src="${REPORT}" style="width:100%;border-radius:10px;display:block">
    </div>
  </div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/body-delete-ocr.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 800, height: 900, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/body-delete-ocr.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 40000 })
  await new Promise(r => setTimeout(r, 1200))
  await page.screenshot({ path: out + '/body-delete-ocr.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/body-delete-ocr.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
