// 深色模式：把写死的白色背景换成变量，并给 venues 页补上圆角变量
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

// ---------- venues 页 ----------
const venuesPath = path.join(MP, 'pages/venues/venues.wxss')
let venues = fs.readFileSync(venuesPath, 'utf8')
venues = venues
  .replace(`.tab {
  display: inline-block;
  padding: 12rpx 28rpx;
  margin-right: 16rpx;
  border-radius: 32rpx;
  background: #fff;
  color: var(--sub);
}`, `.tab {
  display: inline-block;
  padding: 12rpx 28rpx;
  margin-right: 16rpx;
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--sub);
  box-shadow: var(--shadow);
}`)
  .replace(`.slot {
  width: calc(25% - 16rpx);
  margin: 8rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 16rpx 0;
  text-align: center;
  box-sizing: border-box;
  border: 1px solid #fff;
}`, `.slot {
  width: calc(25% - 16rpx);
  margin: 8rpx;
  background: var(--surface);
  border-radius: var(--r-sm);
  padding: 16rpx 0;
  text-align: center;
  box-sizing: border-box;
  border: 1rpx solid var(--surface);
}`)
  .replace('.tab.on { background: var(--brand); color: #fff; }',
    '.tab.on { background: var(--brand); color: #fff; box-shadow: none; }')
fs.writeFileSync(venuesPath, venues)
console.log('venues.wxss：白色背景改为 var(--surface)，圆角统一')

// ---------- profile 页的欢迎卡片渐变 ----------
const profilePath = path.join(MP, 'pages/profile/profile.wxss')
let profile = fs.readFileSync(profilePath, 'utf8')
profile = profile.replace(
  'background: linear-gradient(135deg, var(--brand-soft), #fff);',
  'background: linear-gradient(135deg, var(--brand-soft), var(--surface));'
)
fs.writeFileSync(profilePath, profile)
console.log('profile.wxss：欢迎卡片渐变终点改为 var(--surface)')

// ---------- 复查 ----------
console.log('\n=== 剩余写死的白色背景 ===')
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else out.push(p)
  }
  return out
}
let left = 0
for (const f of walk(MP, []).filter(x => x.endsWith('.wxss'))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/(background|background-color)\s*:\s*#ffffff|(background|background-color)\s*:\s*#fff\b/i.test(line)) {
      console.log('  ' + path.relative(MP, f) + ':' + (i + 1) + '  ' + line.trim())
      left++
    }
  })
}
console.log(left ? '  共 ' + left + ' 处' : '  无（白色背景已全部改为变量）✓')
