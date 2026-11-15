// 把「我的」页的 emoji 图标换成内联 SVG（base64 data-URI 作为背景图）
// 为什么不用 emoji：不同手机/系统的 emoji 字形差异大，颜色也不受控，
// 安卓和 iOS 上看起来是两套设计。SVG 是同一套线条、同一个颜色。
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

// 统一线宽 1.8、圆头圆角、warm gray（--sub = #6b645c）
const STROKE = '#6b645c'
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ICONS = {
  // 会员卡：卡片 + 磁条
  'mi-card': svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>'),
  // 我的预约：清单 + 折叠夹
  'mi-list': svg('<rect x="4" y="4.5" width="16" height="16.5" rx="2.5"/><path d="M9 3h6v3.2H9z"/><path d="M8.2 11.2h7.6M8.2 15.2h5"/>'),
  // 身体数据：柱状图
  'mi-chart': svg('<path d="M5 20v-7M12 20V5M19 20v-4.5"/>'),
  // 排行榜：奖杯
  'mi-trophy': svg('<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z"/><path d="M7.5 5.5H4.8v1.6a3.2 3.2 0 0 0 3 3.2M16.5 5.5h2.7v1.6a3.2 3.2 0 0 1-3 3.2"/><path d="M12 13v4.5M9 19.8h6"/>'),
  // 竞赛：火焰
  'mi-flame': svg('<path d="M12 3.2c3 3.9 5.2 5.6 5.2 9a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.6 2.6-5.2.5 1.6 1.3 2.5 2.6 2.9-.4-2.4-.4-4.6 0-6.7z"/>'),
  // 员工工作台：工具箱
  'mi-tool': svg('<rect x="3" y="8.5" width="18" height="11" rx="2.5"/><path d="M8.6 8.5V6.8A2.3 2.3 0 0 1 10.9 4.5h2.2a2.3 2.3 0 0 1 2.3 2.3v1.7"/><path d="M3 13.6h18"/>')
}

// ---------- 1. 写进 mine.wxss ----------
const wxssPath = path.join(MP, 'pages/mine/mine.wxss')
let wxss = fs.readFileSync(wxssPath, 'utf8')

// 去掉旧的 emoji 图标规则
wxss = wxss.replace(/\.mi-icon \{[^}]*\}\n?/, '')

if (!wxss.includes('/* 图标：内联 SVG')) {
  const css = ['', '/* 图标：内联 SVG（不用 emoji，避免各系统字形/颜色不一致） */',
    '.mi {',
    '  width: 44rpx;',
    '  height: 44rpx;',
    '  flex: none;',
    '  background-repeat: no-repeat;',
    '  background-position: center;',
    '  background-size: 40rpx 40rpx;',
    '}']
  for (const [cls, src] of Object.entries(ICONS)) {
    const b64 = Buffer.from(src, 'utf8').toString('base64')
    css.push('.' + cls + ' { background-image: url("data:image/svg+xml;base64,' + b64 + '"); }')
  }
  wxss += css.join('\n') + '\n'
  fs.writeFileSync(wxssPath, wxss)
  console.log('mine.wxss 已写入 ' + Object.keys(ICONS).length + ' 个 SVG 图标')
}

// ---------- 2. 替换 wxml 里的 emoji ----------
const wxmlPath = path.join(MP, 'pages/mine/mine.wxml')
let wxml = fs.readFileSync(wxmlPath, 'utf8')

const MAP = [
  ['💳', 'mi-card'],
  ['📋', 'mi-list'],
  ['📊', 'mi-chart'],
  ['🏆', 'mi-trophy'],
  ['🔥', 'mi-flame'],
  ['🧰', 'mi-tool']
]
let replaced = 0
for (const [emoji, cls] of MAP) {
  const from = '<text class="mi-icon">' + emoji + '</text>'
  const to = '<view class="mi ' + cls + '"></view>'
  if (wxml.includes(from)) {
    wxml = wxml.split(from).join(to)
    replaced++
    console.log('  ' + emoji + ' -> .' + cls)
  } else {
    console.log('  [!] 没找到 ' + emoji)
  }
}
fs.writeFileSync(wxmlPath, wxml)
console.log('替换 ' + replaced + ' 个图标')

// ---------- 3. 复查还有哪些 emoji 在 UI 里 ----------
console.log('\n=== 其余 emoji 检查（只保留用户自定义内容里的）===')
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else out.push(p)
  }
  return out
}
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
for (const f of walk(MP, []).filter(x => x.endsWith('.wxml'))) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (emojiRe.test(line)) {
      console.log('  ' + path.relative(MP, f) + ': ' + line.trim().slice(0, 90))
    }
  }
}
