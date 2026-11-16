// 排行榜：不指定项目时，默认选「最近有变化」的那一项
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 引入 one ----------
if (!t.includes('const { query, one, tx }')) {
  t = t.replace("const { query, tx } = require('./db')", "const { query, one, tx } = require('./db')")
  done.push('引入 one()')
}

// ---------- 2. 计算默认项目的函数 ----------
if (!t.includes('async function lastChangedLift')) {
  const fn = `// 找出「最近发生过变化」的项目：
// 取每条运动记录里「等于该会员该项目当前最好成绩」的那条（也就是造成当前名次的那次），
// 再看哪个项目最近的这种记录最新。
//   from 不为空时只看该周期内的记录；周期内没有就退回全部历史
async function lastChangedLift(keys, from) {
  const pick = async (since) => one(
    \`with bests as (
       select openid, lift, max(one_rm)::numeric as best
         from strength_records
        where lift = any($1::text[])
        group by openid, lift
     ),
     latest as (
       select s.lift, max(s.created_at) as ts
         from strength_records s
         join bests b
           on b.openid = s.openid and b.lift = s.lift and s.one_rm = b.best
        where s.lift = any($1::text[]) and s.created_at >= $2
        group by s.lift
     )
     select lift, ts from latest order by ts desc limit 1\`,
    [keys, since]
  )
  return (await pick(Number(from) || 0)) || (from ? await pick(0) : null)
}

`
  t = t.replace('async function leaderboard({ me, data }) {', fn + 'async function leaderboard({ me, data }) {')
  done.push('新增 lastChangedLift()')
}

// ---------- 3. leaderboard 里解析默认项目 ----------
const oldResolve = `  const wanted = String(data.lift || '')
  const item = items.find(i => i.key === wanted) || items[0]
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())`

const newResolve = `  const wanted = String(data.lift || '')
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'
  const period = ['week', 'month'].includes(data.period) ? data.period : 'all'
  const range = periodRange(period, Date.now())

  // 没指定项目时自动挑一个：
  // 优先「本周期内最近有成绩变化」的项目，本周期没人练就退回全部历史最近的
  let item = items.find(i => i.key === wanted) || null
  let autoPicked = false
  let recentAt = 0
  if (!item) {
    const recent = await lastChangedLift(items.map(i => i.key), range.from)
    if (recent) {
      item = items.find(i => i.key === recent.lift) || items[0]
      autoPicked = true
      recentAt = Number(recent.ts) || 0
    } else {
      item = items[0]
    }
  }`

if (t.includes(oldResolve)) {
  t = t.replace(oldResolve, newResolve)
  done.push('leaderboard 自动选择项目')
} else {
  console.log('⚠ 未匹配 leaderboard 项目解析')
}

// ---------- 4. 返回值带上自动选择信息 ----------
t = t.replace(
  `  return {
    lift: item.key,
    liftName: item.name,`,
  `  return {
    lift: item.key,
    liftName: item.name,
    autoPicked,
    recentAt,`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
