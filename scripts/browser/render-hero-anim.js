// 预览动画：把每种运动的若干相位渲染成一条胶片，检查动作是否连贯
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const PHASES = [0, 0.25, 0.5, 0.75]
const row = (pose, gender) => {
  const cells = PHASES.map(p => {
    const uri = mod.figureUri(pose.key, gender, p)
    return `<div class="cell"><div class="fig" style="background-image:url('${uri}')"></div></div>`
  }).join('')
  return `<div class="row"><div class="lb">${pose.name} · ${gender === 'female' ? '女' : '男'}</div>${cells}</div>`
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 720px; background: #f7f4f1; padding: 14px; font: 12px/1.4 -apple-system,"Microsoft YaHei",sans-serif; }
  .row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .lb { width: 92px; font-size: 12px; color: #6b645c; flex: none; }
  .cell { flex: 1; border-radius: 12px; padding: 4px; background: linear-gradient(135deg, #f0703f, #e9603a); }
  .fig { width: 100%; height: 104px; background-repeat: no-repeat; background-position: center; background-size: contain; }
</style></head><body>
  ${mod.POSES.map(p => row(p, 'male')).join('')}
  ${mod.POSES.map(p => row(p, 'female')).join('')}
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-anim.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 720, height: 1400, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/hero-anim.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-anim.png', fullPage: true })
  await browser.close()
  console.log('姿势: ' + mod.POSES.map(p => p.name).join(' / '))
  console.log('今天(会员 A)会看到: ' + mod.poseOfDay('o5bjc4jdaajzZZs582B7ao6qUagM', '2026-11-16').name)
  console.log('今天(会员 B)会看到: ' + mod.poseOfDay('o5bjc4qI1ME8eNUtWE09sLqOE4aE', '2026-11-16').name)
  console.log('明天(会员 A)会看到: ' + mod.poseOfDay('o5bjc4jdaajzZZs582B7ao6qUagM', '2026-11-17').name)
  console.log('效果图: ' + out + '/hero-anim.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
