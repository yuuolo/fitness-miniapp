// 三个 tab 的 js：tab 状态、跳转参数、力量/运动历史列表、样式
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

// ---------- 1. 体测页 js ----------
edit('pages/staff/fitness/fitness.js', t => {
  // data 增加 tab 与两个列表
  if (!t.includes('tab: ')) {
    t = t.replace(
      "    loading: false,",
      "    loading: false,\n    tab: 'body',\n    strengthList: [],\n    activityList: [],"
    )
  }
  // onLoad 读取 tab 参数
  if (!t.includes("q.tab")) {
    t = t.replace(
      "    this.setData({ isAdmin: q.admin === '1', manage: q.manage === '1' })",
      "    const tab = ['body', 'strength', 'activity'].includes(q.tab) ? q.tab : 'body'\n    this.setData({ tab })"
    )
    // 去掉旧的 isAdmin/manage 赋值（体测页没有这两个字段）
  }

  // load 里生成两个历史列表
  if (!t.includes('strengthList:')) {
    t = t.replace(
      "        hintText: hintOf(cur),",
      `        hintText: hintOf(cur),
        strengthList: buildStrengthList(f),
        activityList: buildActivityList(f),`
    )
  }

  // 加工具函数与 switchTab
  if (!t.includes('function buildStrengthList(')) {
    t = t.replace(
      'Page({',
      `// 力量成绩历史：把项目 key 换成名称，并标出当前最好成绩
function buildStrengthList(f) {
  const nameOf = {}
  ;(f.lifts || []).forEach(l => { nameOf[l.key] = l.name })
  const bestOf = {}
  Object.keys(f.bestLift || {}).forEach(k => {
    const b = f.bestLift[k]
    if (b && b.oneRM) bestOf[k] = b.oneRM
  })
  return (f.strengthHistory || []).map(s => ({
    id: s._id,
    liftName: nameOf[s.lift] || s.lift,
    date: s.date,
    weight: s.weight,
    reps: s.reps,
    oneRM: s.oneRM,
    isBest: bestOf[s.lift] != null && Number(bestOf[s.lift]) === Number(s.oneRM)
  }))
}

// 运动记录：把类型换成中文、拼出明细
function buildActivityList(f) {
  const nameOf = {}
  ;(f.actionTypes || []).forEach(t => { nameOf[t.key] = t.name })
  const fallback = { walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳', strength: '力量训练', class: '团课', other: '其他' }
  return (f.activity || []).map(a => {
    const parts = []
    if (a.distance > 0) parts.push(a.distance + ' 公里')
    if (a.duration > 0) parts.push(a.duration + ' 分钟')
    if (a.steps > 0) parts.push(a.steps + ' 步')
    if (a.calories > 0) parts.push(a.calories + ' 千卡')
    return {
      id: a._id,
      typeName: nameOf[a.type] || fallback[a.type] || '运动',
      date: a.date,
      detail: parts.join(' · '),
      avgHr: a.avgHr || 0
    }
  })
}

Page({`
    )
  }

  // switchTab 方法
  if (!t.includes('switchTab(')) {
    t = t.replace(
      '  onPullDownRefresh() {',
      `  // 三个录入 tab 之间切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.setData({ tab })
  },

  onPullDownRefresh() {`
    )
  }
  return t
}, '体测页 js：tab + 两个历史列表')

// ---------- 2. 样式：分段 tab ----------
edit('pages/staff/fitness/fitness.wxss', t => {
  if (t.includes('.seg-tabs')) return t
  return t + `
/* 三类录入的分段切换 */
.seg-tabs {
  display: flex;
  gap: 10rpx;
  margin: 8rpx 0 18rpx;
  background: var(--fill);
  border-radius: var(--r-pill);
  padding: 6rpx;
}
.seg-tab {
  flex: 1;
  text-align: center;
  font-size: 26rpx;
  color: var(--sub);
  padding: 12rpx 0;
  border-radius: var(--r-pill);
}
.seg-tab.on {
  background: var(--surface);
  color: var(--brand-strong);
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(35, 32, 29, 0.08);
}
`
}, '体测页样式：分段 tab')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/fitness/fitness.js'])
console.log('  ✓ 语法通过')
