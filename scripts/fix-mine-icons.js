// 修复「我的」页面菜单图标：恢复 .mi 基类 + 补全 5 个图标（内联 SVG）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/mine/mine.wxss'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// ---------- 1. 删掉塌缩成红点的伪元素图标 ----------
const oldBook = `/* 算法说明图标：一本书 */
.mi-book {
  background: var(--brand-soft);
  border-radius: 10rpx;
  position: relative;
}
.mi-book::before {
  content: '';
  position: absolute;
  left: 25%;
  top: 22%;
  width: 50%;
  height: 56%;
  border: 3rpx solid var(--brand-strong);
  border-radius: 3rpx;
  border-left-width: 7rpx;
}
.mi-book::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 26%;
  width: 2rpx;
  height: 46%;
  background: var(--brand-strong);
  opacity: .6;
}
`
if (t.includes(oldBook)) {
  t = t.replace(oldBook, '')
  console.log('  ✓ 删掉塌缩成红点的书本伪元素')
}

// ---------- 2. 恢复 .mi 基类与图标 ----------
if (t.includes('.mi {')) {
  console.log('  · .mi 已存在')
} else {
  const ICONS = {
    chart: '<path d="M5 20v-7M12 20V5M19 20v-4.5"/>',
    trophy: '<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z"/><path d="M7.5 5.5H4.8v1.6a3.2 3.2 0 0 0 3 3.2M16.5 5.5h2.7v1.6a3.2 3.2 0 0 1-3 3.2"/><path d="M12 13v4.5M9 19.8h6"/>',
    flame: '<path d="M12 3.2c3 3.9 5.2 5.6 5.2 9a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.6 2.6-5.2.5 1.6 1.3 2.5 2.6 2.9-.4-2.4-.4-4.6 0-6.7z"/>',
    book: '<path d="M4.5 5.6A2.6 2.6 0 0 1 7.1 3H19v15.4H7.1A2.6 2.6 0 0 0 4.5 21V5.6z"/><path d="M4.5 18.4A2.6 2.6 0 0 1 7.1 15.8H19"/><path d="M8.6 7.4h6.4"/>',
    tool: '<rect x="3" y="8.5" width="18" height="11" rx="2.5"/><path d="M8.6 8.5V6.8A2.3 2.3 0 0 1 10.9 4.5h2.2a2.3 2.3 0 0 1 2.3 2.3v1.7"/><path d="M3 13.6h18"/>'
  }
  const STROKE = '#9c948c'
  const wrapper = (inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

  const lines = [
    '',
    '/* 菜单图标：内联 SVG（浅灰描边，深浅色都看得见） */',
    '.mi {',
    '  width: 44rpx;',
    '  height: 44rpx;',
    '  flex: none;',
    '  margin-right: 18rpx;',
    '  background-repeat: no-repeat;',
    '  background-position: center;',
    '  background-size: 40rpx 40rpx;',
    '}'
  ]
  for (const [name, inner] of Object.entries(ICONS)) {
    const b64 = Buffer.from(wrapper(inner), 'utf8').toString('base64')
    lines.push(`.mi-${name} { background-image: url("data:image/svg+xml;base64,${b64}"); }`)
  }
  t = t.trimEnd() + '\n' + lines.join('\n') + '\n'
  console.log('  ✓ 恢复 .mi 基类 + 5 个图标')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('  ✓ mine.wxss 已更新')

// ---------- 3. 检查其它页面是否也用了 .mi ----------
const path = require('path')
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const users = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.wxml')) {
      const c = fs.readFileSync(p, 'utf8')
      if (/class="mi /.test(c)) users.push(path.relative(MP, p))
    }
  }
}
walk(MP)
console.log('  使用 .mi 的页面: ' + (users.join(', ') || '无'))
