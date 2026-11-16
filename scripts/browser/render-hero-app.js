// 成品效果图：欢迎栏里的小人（今天的动作）+ 三个动作的对比
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const today = mod.poseOfDay('', '2026-11-16')
const uri = (key, gender, phase) => mod.figureUri(key, gender, phase)

const banner = (pose, gender, phase) => `
  <div class="hero">
    <div class="hello">你好，雷阵雨</div>
    <div class="sub">今天也要动起来</div>
    <div class="fig" style="background-image:url('${uri(pose.key, gender, phase)}')"></div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 400px; background: #f7f4f1; padding: 14px; font: 14px/1.5 -apple-system,"Microsoft YaHei",sans-serif; }
  h1 { font-size: 15px; margin-bottom: 2px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 12px; }
  .hero { position: relative; overflow: hidden; border-radius: 16px; padding: 20px 100px 20px 16px;
    background: linear-gradient(135deg, #f0703f, #e9603a); color: #fff; margin-bottom: 12px;
    box-shadow: 0 8px 28px rgba(233,96,58,.22); }
  .hello { font-size: 20px; font-weight: 600; }
  .sub { font-size: 12px; opacity: .92; margin-top: 5px; }
  .fig { position: absolute; right: 10px; top: 50%; width: 78px; height: 78px; margin-top: -39px;
    background-repeat: no-repeat; background-position: center; background-size: contain; }
  .cap { font-size: 11.5px; color: #9c948c; margin-bottom: 14px; }
</style></head><body>
  <h1>首页欢迎栏 · 会做运动的小人</h1>
  <div class="lead">动作每天固定一个（今天：${today.name}），画面持续播放动作过程</div>
  ${banner(today, 'male', 0)}
  <div class="cap">↑ 今日动作：${today.name}（男性体型，资料没填性别也按男性）</div>
  ${banner(today, 'female', 0.5)}
  <div class="cap">↑ 同一动作的女性体型（加头发马尾）</div>
  ${banner(mod.BY_KEY.squat, 'male', 0.5)}
  <div class="cap">↑ 换成深蹲的日子（蹲到最低点那一帧）</div>
  ${banner(mod.BY_KEY.run, 'male', 0.3)}
  <div class="cap">↑ 换成跑步的日子（迈步中）</div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-anim-app.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 400, height: 700, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/hero-anim-app.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-anim-app.png', fullPage: true })
  await browser.close()
  console.log('今天动作: ' + today.name)
  console.log('效果图: ' + out + '/hero-anim-app.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
