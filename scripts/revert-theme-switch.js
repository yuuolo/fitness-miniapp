// 撤销「深浅主题开关」，恢复成之前的系统跟随（媒体查询）方案
//   1) app.wxss 回到 page + @media 的写法
//   2) 所有页面去掉 themeClass / theme.sync / theme require
//   3) 删除 utils/theme.js
//   4) 「我的」页去掉外观选择器
//   5) 自定义 tabBar 去掉主题类，保留系统跟随 + 硬编码兜底
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

// ---------- 1. app.wxss ----------
const appPath = path.join(MP, 'app.wxss')
let css = fs.readFileSync(appPath, 'utf8')

// 取出浅色变量（page, .theme-light, .theme-auto 那段）
const lightStart = css.indexOf('page,\n.theme-light,\n.theme-auto {')
if (lightStart < 0) throw new Error('找不到浅色变量块')
const lightOpen = css.indexOf('{', lightStart)
let depth = 0
let lightEnd = -1
for (let i = lightOpen; i < css.length; i++) {
  if (css[i] === '{') depth++
  else if (css[i] === '}') { depth--; if (depth === 0) { lightEnd = i; break } }
}
const lightVars = css.slice(lightOpen + 1, lightEnd)

// 取出深色变量（.theme-dark 那段）
const darkIdx = css.indexOf('.theme-dark {')
if (darkIdx < 0) throw new Error('找不到深色变量块')
const darkOpen = css.indexOf('{', darkIdx)
depth = 0
let darkEnd = -1
for (let i = darkOpen; i < css.length; i++) {
  if (css[i] === '{') depth++
  else if (css[i] === '}') { depth--; if (depth === 0) { darkEnd = i; break } }
}
const darkVars = css.slice(darkOpen + 1, darkEnd)

// 清掉所有主题类和媒体查询，只保留基础样式
let base = css.slice(0, lightStart)
// 去掉 before 里多余的注释尾部即可，base 就是文件开头到浅色块前

// 找到样式主体（从「底部留出自定义 tabBar」开始到文件末尾的主题部分之前）
const bodyStart = css.indexOf('/* 底部留出自定义 tabBar 的高度')
const themeNote = css.indexOf('/* 深色模式')
let body = css.slice(bodyStart, themeNote < 0 ? undefined : themeNote).trimEnd()

const restored = base + `page {${lightVars}
}

` + body + `

/* ============================================================
   深色模式：跟随系统
   所有页面都用 var() 取色，这里只覆盖变量即可整体切换。
   ============================================================ */
@media (prefers-color-scheme: dark) {
  page {${darkVars}
  }
}
`
fs.writeFileSync(appPath, restored)
console.log('app.wxss：已恢复为 page + 媒体查询')

// ---------- 2. 页面回退 ----------
const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))
let jsFixed = 0
let wxmlFixed = 0

for (const page of app.pages) {
  const jsPath = path.join(MP, page + '.js')
  const wxmlPath = path.join(MP, page + '.wxml')

  if (fs.existsSync(jsPath)) {
    let js = fs.readFileSync(jsPath, 'utf8')
    const before = js
    // 去掉 theme 引入
    js = js.replace(/^const theme = require\([^)]*\)\n/m, '')
    // 去掉 data 里的 themeClass
    js = js.replace(/\s*themeClass: 'theme-auto',/g, '')
    // 去掉 onShow 里的 theme.sync(this)
    js = js.replace(/\n\s*theme\.sync\(this\)/g, '')
    // 只为了主题而新增的空 onShow（只剩同步 tabBar 的保留）
    js = js.replace(/\n\s*onShow\(\) \{\s*\n\s*\},/g, '\n')
    if (js !== before) { fs.writeFileSync(jsPath, js); jsFixed++ }
  }

  if (fs.existsSync(wxmlPath)) {
    let wxml = fs.readFileSync(wxmlPath, 'utf8')
    const before = wxml
    wxml = wxml.split('class="page {{themeClass}}"').join('class="page"')
    if (wxml !== before) { fs.writeFileSync(wxmlPath, wxml); wxmlFixed++ }
  }
}
console.log('页面 JS 回退：' + jsFixed + ' 个；WXML 回退：' + wxmlFixed + ' 个')

// ---------- 3. 删除 theme.js ----------
const themePath = path.join(MP, 'utils/theme.js')
if (fs.existsSync(themePath)) {
  fs.rmSync(themePath)
  console.log('已删除 utils/theme.js')
}

// ---------- 4. 「我的」页去掉外观选择器 ----------
const mineJs = path.join(MP, 'pages/mine/mine.js')
let mjs = fs.readFileSync(mineJs, 'utf8')
mjs = mjs.replace(/\n  \/\/ 切换外观：主题类立刻生效，自定义 tabBar 通过订阅同步\n  onTheme\(e\) \{[\s\S]*?\n  \},\n/, '\n')
mjs = mjs.replace(/\n    \/\/ 外观：跟随系统 \/ 浅色 \/ 深色\n    themeMode: 'auto',\n    themeOptions: \[\n[\s\S]*?\n    \],\n/, '\n')
mjs = mjs.replace(/\n\s*this\.setData\(\{ themeMode: theme\.get\(\) \}\)/, '')
fs.writeFileSync(mineJs, mjs)

const mineWxml = path.join(MP, 'pages/mine/mine.wxml')
let mwxml = fs.readFileSync(mineWxml, 'utf8')
mwxml = mwxml.replace(/    <!-- 外观切换 -->\n    <view class="card">[\s\S]*?<div class="seg">[\s\S]*?<\/view>\n    <\/view>\n\n/, '')
// 兜底：按结构删除整块
const segIdx = mwxml.indexOf('<!-- 外观切换 -->')
if (segIdx >= 0) {
  const cardEnd = mwxml.indexOf('<!-- 积分（可在管理页关掉） -->')
  if (cardEnd > segIdx) mwxml = mwxml.slice(0, segIdx) + mwxml.slice(cardEnd)
}
fs.writeFileSync(mineWxml, mwxml)

const mineWxss = path.join(MP, 'pages/mine/mine.wxss')
let mwxss = fs.readFileSync(mineWxss, 'utf8')
mwxss = mwxss.replace(/\n\/\* 外观切换：三段式选择器 \*\/[\s\S]*$/, '\n')
fs.writeFileSync(mineWxss, mwxss)
console.log('「我的」页外观选择器已移除')

// ---------- 5. tabBar 回退 ----------
const tabJs = path.join(MP, 'custom-tab-bar/index.js')
let tjs = fs.readFileSync(tabJs, 'utf8')
tjs = tjs.replace(/^const theme = require\([^)]*\)\n/m, '')
tjs = tjs.replace(/\s*themeClass: 'theme-auto',/g, '')
tjs = tjs.replace(/,\s*themeClass: theme\.cls\(\)/, '')
tjs = tjs.replace(/\n\s*this\.offTheme = theme\.subscribe\(\(\) => this\.refresh\(\)\)/, '')
tjs = tjs.replace(/\n\s*if \(this\.offTheme\) this\.offTheme\(\)/, '')
fs.writeFileSync(tabJs, tjs)

const tabWxml = path.join(MP, 'custom-tab-bar/index.wxml')
let twxml = fs.readFileSync(tabWxml, 'utf8')
twxml = twxml.split('class="tabbar {{themeClass}}"').join('class="tabbar"')
fs.writeFileSync(tabWxml, twxml)

const tabWxss = path.join(MP, 'custom-tab-bar/index.wxss')
let twxss = fs.readFileSync(tabWxss, 'utf8')
const cut = twxss.indexOf('/* ---------- 深色：手动切换或跟随系统 ---------- */')
if (cut >= 0) {
  twxss = twxss.slice(0, cut) + `/* ---------- 深色：跟随系统 ---------- */
/* 组件是独立作用域，颜色保留硬编码兜底，不依赖 page 上的变量 */
@media (prefers-color-scheme: dark) {
  .tabbar {
    background: #1c1a18;
    border-top-color: #302d29;
    box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.3);
  }
  .tab-text { color: #948c84; }
  .tab.on .tab-text { color: #f0704a; }
  .tab.on::before { background: #f0704a; }
}
`
}
fs.writeFileSync(tabWxss, twxss)
console.log('custom-tab-bar 已回退为跟随系统')

console.log('\n完成')
