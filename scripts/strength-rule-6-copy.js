// 更新文案：算法说明页 + 会员身体数据页的评分公式说明
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 1. 算法说明页
edit('pages/manual/manual.js', t => {
  const from = "{ k: '相对力量（40 分）', v: '三项合计（卧推 + 深蹲 + 硬拉）÷ 体重。男性 3.0 倍体重得满分，女性 2.2 倍得满分；低于满分线按比例给分，超过按满分算。三项没录全时，这一项最多只能得 15 分。' },"
  const to = "{ k: '相对力量（40 分）', v: '三项合计（卧推 + 深蹲 + 硬拉）÷ 体重。男性 3.0 倍体重得满分，女性 2.2 倍得满分；低于满分线按比例给分，超过按满分算。三项各占三分之一：只录 1 项最多 13.3 分，录 2 项最多 26.7 分，三项齐全才能拿满 40 分；一项都没录记 0 分。' },"
  if (!t.includes(from)) {
    console.log('  [!] 算法说明未匹配')
    return t
  }
  return t.replace(from, to)
}, '算法说明页')

// 2. 会员身体数据页公式说明
edit('pages/fitness/fitness.wxml', t => {
  const from = '<view class="muted mt">评分 = 体脂率 40 + 相对力量 40 + 体重指数 20，缺项自动归一</view>'
  const to = '<view class="muted mt">评分 = 体脂率 40 + 相对力量 40 + 体重指数 20；相对力量三项各占三分之一，没录力量记 0 分</view>'
  if (!t.includes(from)) {
    console.log('  [!] 身体数据页公式说明未匹配')
    return t
  }
  return t.replace(from, to)
}, '身体数据页公式说明')

// 3. 旧的「未录全最多 15 分」提示
edit('pages/fitness/fitness.wxml', t => {
  const from = '<view class="muted">相对力量要求卧推/深蹲/硬拉三项都录入；缺任意一项这一项最多得 15 分</view>'
  const to = '<view class="muted">相对力量三项各占三分之一：录 1 项最多 13.3 分、2 项最多 26.7 分，三项齐全才能满分</view>'
  if (!t.includes(from)) return t
  return t.replace(from, to)
}, '身体数据页缺项提示')

// 4. 排行榜页综合评分说明
edit('pages/rank/rank.wxml', t => {
  const from = '相对力量要求卧推/深蹲/硬拉三项都录入，缺项最多 15 分。成绩一更新，排名立刻变化。'
  const to = '相对力量三项各占三分之一，缺一项少三分之一（1 项≤13.3、2 项≤26.7），一项没录记 0 分。成绩一更新，排名立刻变化。'
  if (!t.includes(from)) return t
  return t.replace(from, to)
}, '排行榜页说明')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/manual/manual.js', 'pages/fitness/fitness.js', 'pages/rank/rank.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
