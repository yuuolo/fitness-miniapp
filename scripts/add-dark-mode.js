// 给 app.wxss 追加深色模式：只覆盖设计变量，所有页面自动跟着变
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/app.wxss'
let css = fs.readFileSync(FILE, 'utf8')

if (css.includes('@media (prefers-color-scheme: dark)')) {
  console.log('已经存在深色模式，跳过')
  process.exit(0)
}

const DARK = `

/* ============================================================
   深色模式
   所有页面都通过 var() 取色，所以这里只覆盖变量即可整体切换。
   深色下把主色提亮一点（#f0704a），否则在深底上会显得发暗。
   ============================================================ */
@media (prefers-color-scheme: dark) {
  page {
    /* 品牌色：深底上提亮，保持可读性 */
    --brand: #f0704a;
    --brand-strong: #f58a68;
    --brand-soft: rgba(240, 112, 74, 0.16);
    --brand-line: rgba(240, 112, 74, 0.38);
    --brand-grad-a: #ef6b45;
    --brand-grad-b: #f28a60;

    /* 文字：不用纯白，用暖白降低刺眼感 */
    --ink: #ece8e4;
    --sub: #b7afa6;
    --muted: #948c84;
    --ph: #6f6860;

    /* 背景与线条 */
    --bg: #121110;
    --surface: #1c1a18;
    --line: #302d29;
    --line-soft: #262320;
    --fill: #262320;

    /* 语义色 */
    --ok: #4bbd8b;
    --ok-soft: rgba(75, 189, 139, 0.16);
    --warn: #d8a33e;
    --warn-soft: rgba(216, 163, 62, 0.16);
    --danger: #e2685f;
    --danger-soft: rgba(226, 104, 95, 0.16);

    /* 阴影：深色下要更重一点才有层次 */
    --shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.35);
    --shadow-up: 0 -2rpx 12rpx rgba(0, 0, 0, 0.3);
  }
}
`

fs.writeFileSync(FILE, css + DARK)
console.log('app.wxss 已追加深色模式变量覆盖（' + DARK.split('\n').length + ' 行）')
