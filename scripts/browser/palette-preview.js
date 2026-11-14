// 用无头 Chrome 渲染「色彩体系 + 组件样张」，截成图片给人看
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

// 直接从 app.wxss 里读变量，保证样张和真实代码完全一致
const appCss = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const vars = {}
for (const m of appCss.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim()

// rpx -> px（按 375 宽屏幕 1rpx = 0.5px）
const px = v => String(v).replace(/(\d+(?:\.\d+)?)rpx/g, (_, n) => (Number(n) * 0.5) + 'px')

const swatch = (name, key) => `
  <div class="sw">
    <div class="chip" style="background:${vars[key] || '#ccc'}"></div>
    <div class="meta">
      <div class="nm">${name}</div>
      <div class="cd">--${key} · ${vars[key] || '-'}</div>
    </div>
  </div>`

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${vars.bg}; color: ${vars.ink};
    font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif;
    padding: 28px 26px; width: 900px;
  }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .lead { color: ${vars.muted}; font-size: 13px; margin-bottom: 22px; }
  h2 { font-size: 14px; margin: 22px 0 10px; color: ${vars.sub}; font-weight: 600; }
  .sws { display: flex; flex-wrap: wrap; gap: 10px; }
  .sw { display: flex; align-items: center; gap: 9px; width: 205px; }
  .chip { width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(0,0,0,.06); flex: none; }
  .nm { font-size: 13px; font-weight: 500; }
  .cd { font-size: 11px; color: ${vars.muted}; font-family: ui-monospace, Consolas, monospace; }

  .phone { display: flex; gap: 22px; margin-top: 6px; }
  .screen {
    width: 320px; background: ${vars.bg}; border-radius: 22px; padding: 12px;
    border: 1px solid ${vars.line};
  }
  .hero {
    background: linear-gradient(135deg, ${vars['brand-grad-a']}, ${vars['brand-grad-b']});
    border-radius: ${px(vars['r-lg'])}; padding: 20px 16px; color: #fff;
    box-shadow: 0 4px 14px rgba(233,96,58,.22); margin-bottom: 12px;
  }
  .hello { font-size: 20px; font-weight: 600; }
  .sub { font-size: 12px; opacity: .92; margin-top: 5px; }
  .card {
    background: ${vars.surface}; border-radius: ${px(vars['r-lg'])};
    padding: 14px; margin-bottom: 12px; box-shadow: ${vars.shadow};
  }
  .title { font-size: 16px; font-weight: 600; }
  .muted { color: ${vars.muted}; font-size: 12px; }
  .li { display: flex; align-items: center; padding: 11px 0; border-bottom: 1px solid ${vars['line-soft']}; }
  .li:last-child { border-bottom: 0; }
  .grow { flex: 1; }
  .price { color: ${vars.brand}; font-weight: 600; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: ${px(vars['r-sm'])}; background: ${vars.fill}; color: ${vars.sub}; }
  .tag.orange { background: ${vars['brand-soft']}; color: ${vars['brand-strong']}; }
  .tag.green { background: ${vars['ok-soft']}; color: ${vars.ok}; }
  .tag.red { background: ${vars['danger-soft']}; color: ${vars.danger}; }
  .row { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; height: 30px;
    padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 500;
    background: ${vars.brand}; color: #fff;
  }
  .btn.ghost { background: ${vars.surface}; color: ${vars.brand}; border: 1px solid ${vars['brand-line']}; }
  .btn.gray { background: ${vars.fill}; color: ${vars.sub}; }
  .q { display: flex; gap: 10px; }
  .qi { flex: 1; background: ${vars.surface}; border-radius: ${px(vars['r-md'])}; padding: 12px; box-shadow: ${vars.shadow}; }
  .tabbar {
    display: flex; background: ${vars.surface}; border-radius: 0 0 14px 14px;
    border-top: 1px solid ${vars.line}; box-shadow: ${vars['shadow-up']};
    margin: 0 -12px -12px; padding: 0 0 4px;
  }
  .tb { flex: 1; text-align: center; padding: 9px 0; position: relative; font-size: 13px; color: ${vars.muted}; }
  .tb.on { color: ${vars.brand}; font-weight: 600; }
  .tb.on::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 20px; height: 2px; border-radius: 0 0 2px 2px; background: ${vars.brand};
  }
  .datebar { display: flex; background: ${vars.surface}; border-radius: ${px(vars['r-md'])}; padding: 6px; box-shadow: ${vars.shadow}; margin-bottom: 12px; }
  .db { flex: 1; text-align: center; padding: 5px 0; border-radius: ${px(vars['r-sm'])}; font-size: 12px; color: ${vars.muted}; }
  .db.on { background: ${vars.brand}; color: #fff; font-weight: 600; }
  .note { font-size: 12px; color: ${vars.muted}; margin-top: 16px; line-height: 1.8; }
</style></head>
<body>
  <h1>健身娱乐 · 新配色体系</h1>
  <div class="lead">从 32 种硬编码颜色 / 0 个变量，收敛成 27 个设计变量；冷灰底改为暖米底，主色去掉荧光感。</div>

  <h2>品牌色</h2>
  <div class="sws">
    ${swatch('品牌主色', 'brand')}
    ${swatch('按下/深色', 'brand-strong')}
    ${swatch('浅底', 'brand-soft')}
    ${swatch('描边', 'brand-line')}
    ${swatch('渐变起', 'brand-grad-a')}
    ${swatch('渐变止', 'brand-grad-b')}
  </div>

  <h2>文字</h2>
  <div class="sws">
    ${swatch('正文', 'ink')}
    ${swatch('次要', 'sub')}
    ${swatch('弱化', 'muted')}
    ${swatch('占位', 'ph')}
  </div>

  <h2>背景与线条</h2>
  <div class="sws">
    ${swatch('页面底色', 'bg')}
    ${swatch('卡片', 'surface')}
    ${swatch('线条', 'line')}
    ${swatch('浅线条', 'line-soft')}
    ${swatch('填充', 'fill')}
  </div>

  <h2>语义色</h2>
  <div class="sws">
    ${swatch('成功', 'ok')}
    ${swatch('成功底', 'ok-soft')}
    ${swatch('警告', 'warn')}
    ${swatch('危险', 'danger')}
    ${swatch('危险底', 'danger-soft')}
  </div>

  <h2>组件样张</h2>
  <div class="phone">
    <div class="screen">
      <div class="hero">
        <div class="hello">你好，店长</div>
        <div class="sub">今天也要动起来 · 积分 0</div>
      </div>
      <div class="datebar">
        <div class="db on">本周</div><div class="db">本月</div><div class="db">总榜</div>
      </div>
      <div class="card">
        <div class="title">卧推排行榜</div>
        <div class="li"><span class="muted" style="width:16px">1</span><span class="grow">参赛会员 <span class="tag orange">我</span></span><span class="price">143 kg</span></div>
        <div class="li"><span class="muted" style="width:16px">2</span><span class="grow">会员小明</span><span class="price">121 kg</span></div>
      </div>
      <div class="q">
        <div class="qi"><div style="font-size:14px;font-weight:600">约团课</div><div class="muted">瑜伽 单车</div></div>
        <div class="qi"><div style="font-size:14px;font-weight:600">健身友圈</div><div class="muted">晒训练</div></div>
      </div>
      <div class="row">
        <span class="tag green">可用</span><span class="tag red">已过期</span><span class="tag">普通</span>
      </div>
      <div class="row">
        <span class="btn">主要按钮</span><span class="btn ghost">次要</span><span class="btn gray">灰色</span>
      </div>
      <div class="tabbar">
        <div class="tb on">首页</div><div class="tb">友圈</div><div class="tb">我的</div>
      </div>
    </div>

    <div style="flex:1">
      <div class="card">
        <div class="title">竞赛</div>
        <div class="muted" style="margin-top:4px">卧推挑战赛 · 进行中 · 2 人参赛</div>
        <div class="li"><span class="grow">冠军 蛋白粉一桶</span><span class="tag orange">奖品</span></div>
        <div class="row"><span class="btn">录入成绩</span><span class="btn ghost">修改</span></div>
      </div>
      <div class="card">
        <div class="title">今日概况</div>
        <div style="display:flex;margin-top:10px;text-align:center">
          <div style="flex:1"><div style="font-size:20px;font-weight:600">12</div><div class="muted">入场人次</div></div>
          <div style="flex:1"><div style="font-size:20px;font-weight:600">3</div><div class="muted">课程预约</div></div>
          <div style="flex:1"><div style="font-size:20px;font-weight:600">2</div><div class="muted">会员总数</div></div>
        </div>
      </div>
      <div class="card">
        <div class="muted">空状态</div>
        <div style="text-align:center;color:${vars.muted};padding:16px 0">还没有人上榜</div>
      </div>
    </div>
  </div>

  <div class="note">
    圆角统一为 12 / 18 / 24rpx 三档与胶囊形；字号收敛为 18–40rpx；按下态统一变深而不是变透明。<br>
    冷灰底（#f5f6f8）换成暖米底（#f7f4f1），和橙色主色同一色温——这是「和谐感」的主要来源。
  </div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
const htmlPath = path.join(OUT, 'palette.html')
fs.writeFileSync(htmlPath, html)
console.log('样张 HTML: ' + htmlPath)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 })
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  const out = path.join(OUT, 'palette.png')
  await page.screenshot({ path: out, fullPage: true })
  await browser.close()
  console.log('截图: ' + out)
})().catch(e => { console.error('截图失败:', e.message); process.exit(1) })
