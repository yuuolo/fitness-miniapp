// 在「我的」页面加入「算法说明」入口
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

function edit(rel, fn) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    console.log('  ✓ ' + rel)
  } else {
    console.log('  [!] 无变化 ' + rel)
  }
}

// ---------- wxml：菜单里加一项（放在员工工作台之前，所有人都能看到） ----------
edit('pages/mine/mine.wxml', t => {
  if (t.includes('goManual')) return t
  const anchor = `      <view wx:if="{{isStaff}}" class="menu-item" bindtap="goStaff">`
  if (!t.includes(anchor)) throw new Error('找不到员工工作台入口')
  const row = `      <view class="menu-item" bindtap="goManual">
        <view class="mi mi-book"></view><text class="grow">算法说明</text><text class="chevron">›</text>
      </view>
`
  return t.replace(anchor, row + anchor)
})

// ---------- js：跳转 ----------
edit('pages/mine/mine.js', t => {
  if (t.includes('goManual()')) return t
  const anchor = '  goStaff() {'
  if (!t.includes(anchor)) throw new Error('找不到 goStaff')
  const method = `  // 算法说明书：评分、排行榜项目、能力图
  goManual() {
    wx.navigateTo({ url: '/pages/manual/manual' })
  },

`
  return t.replace(anchor, method + anchor)
})

// ---------- wxss：菜单图标 ----------
edit('pages/mine/mine.wxss', t => {
  if (t.includes('.mi-book')) return t
  return t + `
/* 算法说明图标：一本书 */
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
})

// 校验
for (const f of ['pages/mine/mine.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
