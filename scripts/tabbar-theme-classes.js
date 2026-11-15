// tabBar 的主题类覆盖：.tabbar.theme-dark 用深色，.theme-auto 继续跟随系统
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/custom-tab-bar/index.wxss'
let css = fs.readFileSync(FILE, 'utf8')

// 去掉原来只针对系统深色的媒体查询（改成类名驱动 + auto 媒体查询）
const mediaIdx = css.indexOf('/* 深色模式：组件内自己处理')
if (mediaIdx < 0) throw new Error('找不到原深色块')
css = css.slice(0, mediaIdx).trimEnd()

css += `

/* ---------- 深色：手动切换或跟随系统 ---------- */
/* 手动选中深色 */
.tabbar.theme-dark {
  background: #1c1a18;
  border-top-color: #302d29;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.3);
}
.tabbar.theme-dark .tab-text { color: #948c84; }
.tabbar.theme-dark .tab.on .tab-text { color: #f0704a; }
.tabbar.theme-dark .tab.on::before { background: #f0704a; }

/* 显式浅色：即使系统是深色也保持浅色 */
.tabbar.theme-light {
  background: #ffffff;
  border-top-color: #efe8e1;
  box-shadow: 0 -2rpx 12rpx rgba(35, 32, 29, 0.04);
}
.tabbar.theme-light .tab-text { color: #9c948c; }
.tabbar.theme-light .tab.on .tab-text { color: #e9603a; }
.tabbar.theme-light .tab.on::before { background: #e9603a; }

/* 跟随系统：系统深色时切换 */
@media (prefers-color-scheme: dark) {
  .tabbar.theme-auto {
    background: #1c1a18;
    border-top-color: #302d29;
    box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.3);
  }
  .tabbar.theme-auto .tab-text { color: #948c84; }
  .tabbar.theme-auto .tab.on .tab-text { color: #f0704a; }
  .tabbar.theme-auto .tab.on::before { background: #f0704a; }
}
`

fs.writeFileSync(FILE, css)
const open = (css.match(/\{/g) || []).length
const close = (css.match(/\}/g) || []).length
console.log('tabBar 主题样式已更新，括号 ' + open + '/' + close + (open === close ? ' ✓' : ' ✗'))
