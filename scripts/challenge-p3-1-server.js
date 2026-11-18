// 挑战订阅消息：模板配置 + 发送钩子 + 给小程序下发的模板 ID + 首页挑战模块
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
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

// ---------- 1. templates.js：三个挑战相关模板 ----------
edit('lib/templates.js', t => {
  if (t.includes('challengeInvite')) return t
  const inject = `
  // ---- 会员挑战（订阅消息，一次性）----
  // 模板已在后台选用（2026-11-18）：
  //   比赛邀请通知  name1 邀请人 / date2 比赛时间 / thing4 比赛名称 / thing5 参赛球队 / thing6 比赛场地
  //   挑战开始提醒  thing1 挑战名称 / time2 挑战时间 / thing3 温馨提示
  //   对战结果通知  thing1 活动名称 / time2 开始时间 / time3 结束时间 / short_thing4 对战结果 / thing5 温馨提示
  challengeInvite: {
    id: id('CHALLENGE_INVITE') || '-UIVlMMxucmR3oTwIin1ROOSq9U9kCyp0mmFA1nzfY4',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      name1: v.inviter,
      date2: v.time,
      thing4: v.title,
      thing5: v.vs,
      thing6: v.place
    })
  },
  challengeStart: {
    id: id('CHALLENGE_START') || 'uD-Pu7n61BDSLDAmX45Jitf6Kwl4oisVtNSxVSVWTI4',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      thing1: v.title,
      time2: v.time,
      thing3: v.tip
    })
  },
  challengeResult: {
    id: id('CHALLENGE_RESULT') || 'ddrEoH_Zs3kHShU6NcMrkxPaijA9XMJ14IUi2ODEYwk',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      thing1: v.title,
      time2: v.startAt,
      time3: v.endAt,
      short_thing4: v.result,
      thing5: v.tip
    })
  },
`
  return t.replace('module.exports = {', 'module.exports = {\n' + inject)
}, 'templates.js：挑战模板')

// ---------- 2. challenge.js：发送订阅消息 ----------
edit('lib/challenge.js', t => {
  if (t.includes('notifyChallenge')) return t

  // 2.1 引入 notify
  t = t.replace(
    `const liftItems = require('./lift-items')`,
    `const liftItems = require('./lift-items')
const notify = require('./notify')
const { cnDateTime } = require('./common')`
  )

  // 2.2 发送辅助函数（放在 formatTime 之后）
  t = t.replace(
    `function fmtTime(ts) {
  return cnDateTime(Number(ts) || 0)
}`,
    `function fmtTime(ts) {
  return cnDateTime(Number(ts) || 0)
}

// ---------- 订阅消息 ----------
// 订阅消息是一次性的：用户在按钮上授权后才能发一条；没授权时微信会报 43101，只记日志
function safeNotify(kind, openid, values) {
  if (!openid) return
  notify.notify(kind, openid, values).catch(() => {})
}

async function memberNameOf(openid) {
  const row = (await query('select nick_name, phone from members where openid = $1', [openid])).rows[0]
  return row ? (row.nick_name || row.phone || '会员') : '会员'
}

// 给小程序下发的模板 ID（客户端要用它调 wx.requestSubscribeMessage）
async function notifyTemplates({ me }) {
  need(me, 'member')
  const templates = require('./templates')
  const pick = k => (templates[k] && templates[k].id) || ''
  return {
    invite: pick('challengeInvite'),
    start: pick('challengeStart'),
    result: pick('challengeResult')
  }
}

// 发起 / 指派裁判 时通知对方
async function notifyInvite(c) {
  const [items, challengerName, opponentName] = await Promise.all([
    liftItems.list(),
    memberNameOf(c.challenger),
    memberNameOf(c.opponent)
  ])
  const item = items.find(i => i.key === c.liftKey) || { name: c.liftKey }
  const title = item.name + '挑战'
  const vs = challengerName + ' VS ' + opponentName
  const time = fmtTime(c.createdAt)
  const values = { inviter: challengerName, time, title, vs, place: '健身房 · 视频挑战' }
  safeNotify('challengeInvite', c.opponent, values)
  safeNotify('challengeInvite', c.referee, values)
}

// 裁判该判了
async function notifyJudgeReady(c) {
  const items = await liftItems.list()
  const item = items.find(i => i.key === c.liftKey) || { name: c.liftKey }
  safeNotify('challengeStart', c.referee, {
    title: item.name + '挑战',
    time: fmtTime(c.judgeBy),
    tip: '双方视频已交齐，请尽快判定'
  })
}

// 判定结果通知双方
async function notifyJudgeResult(c) {
  const items = await liftItems.list()
  const item = items.find(i => i.key === c.liftKey) || { name: c.liftKey }
  const resultName = c.judgeResult === 'win_challenger' ? '发起方胜'
    : c.judgeResult === 'win_opponent' ? '应战方胜'
      : c.judgeResult === 'draw' ? '平局' : '已判定'
  const values = {
    title: item.name + '挑战',
    startAt: fmtTime(c.createdAt),
    endAt: fmtTime(c.judgedAt),
    result: resultName,
    tip: '点开查看判定理由'
  }
  safeNotify('challengeResult', c.challenger, values)
  safeNotify('challengeResult', c.opponent, values)
}`
  )

  // 2.3 在 createChallenge 返回前发通知
  t = t.replace(
    `    [id, me._id, opponent, referee, item.key, metric, String(data.trashTalk || '').slice(0, 20),
      now + ACCEPT_MS, now]
  )
  return detailById(id, me)`,
    `    [id, me._id, opponent, referee, item.key, metric, String(data.trashTalk || '').slice(0, 20),
      now + ACCEPT_MS, now]
  )
  const created = await loadChallenge(id)
  notifyInvite(created).catch(() => {})
  return detailById(id, me)`
  )

  // 2.4 双方交齐视频 → 提醒裁判
  t = t.replace(
    `  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
  }`,
    `  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
    const ready = await loadChallenge(c._id)
    notifyJudgeReady(ready).catch(() => {})
  }`
  )

  // 2.5 判定后通知双方
  t = t.replace(
    `  // 事务提交后再读，避免读到旧状态
  return detailById(c._id, me)`,
    `  // 事务提交后再读，避免读到旧状态
  const judged = await loadChallenge(c._id)
  notifyJudgeResult(judged).catch(() => {})
  return decorate(judged, me)`
  )

  // 2.6 导出 notifyTemplates
  t = t.replace(
    `  challengeBoard
}`,
    `  challengeBoard,
  notifyTemplates
}`
  )
  return t
}, 'challenge.js：订阅消息钩子')

// ---------- 3. index.js：注册 notifyTemplates + 功能开关 ----------
edit('index.js', t => {
  if (t.includes('notifyTemplates:')) return t
  return t.replace(
    `  challengeBoard: 'rank',`,
    `  challengeBoard: 'rank',
  notifyTemplates: 'rank',`
  )
}, '注册 notifyTemplates')

// ---------- 4. layout.js：首页「挑战」模块 ----------
edit('lib/layout.js', t => {
  if (t.includes("type: 'challenge'")) return t
  t = t.replace(
    `  { type: 'competitions', name: '竞赛预览', desc: '进行中的竞赛', scope: 'all', feature: 'rank' },`,
    `  { type: 'competitions', name: '竞赛预览', desc: '进行中的竞赛', scope: 'all', feature: 'rank' },
  { type: 'challenge', name: '挑战预览', desc: '待你应战 / 待你判决 / 进行中', scope: 'all', feature: 'rank' },`
  )
  // 快捷入口页面目录加挑战
  t = t.replace(
    `  { path: '/pages/competitions/competitions', name: '竞赛', tab: false },`,
    `  { path: '/pages/competitions/competitions', name: '竞赛', tab: false },
  { path: '/pages/challenges/list/list', name: '会员挑战', tab: false },
  { path: '/pages/challenges/board/board', name: '挑战榜', tab: false },`
  )
  // 默认布局：快捷入口后面放挑战
  t = t.replace(
    `  const social = [
    block('hero'),
    block('quick'),
    block('competitions'),`,
    `  const social = [
    block('hero'),
    block('quick'),
    block('challenge'),
    block('competitions'),`
  )
  t = t.replace(
    `    coach: [block('hero'), block('quick'), block('competitions'), block('rank'), block('members-link', {`,
    `    coach: [block('hero'), block('quick'), block('challenge'), block('competitions'), block('rank'), block('members-link', {`
  )
  t = t.replace(
    `    admin: [block('hero'), block('quick'), block('competitions'), block('rank'), block('moments')]`,
    `    admin: [block('hero'), block('quick'), block('challenge'), block('competitions'), block('rank'), block('moments')]`
  )
  return t
}, 'layout.js：挑战模块')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/templates.js', 'lib/challenge.js', 'lib/layout.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
console.log('  ✓ 语法通过')
