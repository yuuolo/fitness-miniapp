// 员工端会员详情：加「查看公开资料」入口（按实际结构插入）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const log = []

function edit(rel, fn) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    log.push(rel)
  } else {
    console.log('  [!] 无变化 ' + rel)
  }
}

// ---------- wxml ----------
edit('pages/staff/member/member.wxml', t => {
  if (t.includes('goPublicProfile')) return t
  const oldBlock = `      <text class="muted">›</text>
    </view>
  </view>
</view>
`
  const newBlock = `      <text class="muted">›</text>
    </view>
    <view class="list-item" bindtap="goPublicProfile">
      <view class="grow">
        <view>查看公开资料</view>
        <view class="muted">只读页面，会员都能看到，还会和我的数据做对比</view>
      </view>
      <text class="muted">›</text>
    </view>
  </view>
</view>
`
  if (!t.includes(oldBlock)) throw new Error('找不到卡片结尾')
  // 只替换最后一次出现（页面末尾那个 card 结尾）
  const idx = t.lastIndexOf(oldBlock)
  return t.slice(0, idx) + newBlock + t.slice(idx + oldBlock.length)
})

// ---------- js ----------
edit('pages/staff/member/member.js', t => {
  if (t.includes('goPublicProfile()')) return t
  const anchor = '  goFitness() {'
  if (!t.includes(anchor)) throw new Error('找不到 goFitness')
  const method = `  // 看 TA 的公开资料页（只读，含和我的身体数据 PK）
  goPublicProfile() {
    if (!this.id) return
    wx.navigateTo({ url: '/pages/member/member?openid=' + this.id })
  },

`
  return t.replace(anchor, method + anchor)
})

console.log(log.length ? log.map(x => '  ✓ 已改 ' + x).join('\n') : '  无改动')
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/member/member.js'])
console.log('  ✓ 语法通过')
