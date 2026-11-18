// P2 后端：评论/点赞、挑战榜、徽章、判定快照
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

// ---------- 1. schema：点赞表 + 判定快照 ----------
edit('schema.sql', t => {
  if (t.includes('challenge_comment_likes')) return t
  return t + `
-- 评论点赞（一人一次，可取消）
create table if not exists challenge_comment_likes (
  comment_id text not null references challenge_comments(id) on delete cascade,
  openid     text not null,
  created_at bigint not null default 0,
  primary key (comment_id, openid)
);

-- 判定时的成绩快照（「以下克上」徽章用）
alter table challenges add column if not exists judge_snapshot jsonb not null default '{}'::jsonb;
`
}, 'schema：点赞表 + 判定快照')

// ---------- 2. challenge.js ----------
edit('lib/challenge.js', t => {
  if (t.includes('async function commentChallenge')) {
    console.log('  · 已有评论功能')
    return t
  }

  // 2.1 判定时记录双方成绩快照
  const snapAnchor = `  await tx(async client => {
    let finalResult = result`
  const snapNew = `  await tx(async client => {
    // 判定时记录双方在该项目的最好成绩（「以下克上」徽章要用）
    const snapshot = {}
    for (const who of [c.challenger, c.opponent]) {
      const row = (await client.query('select best_lift from members where openid = $1', [who])).rows[0]
      const bl = (row && row.best_lift) || {}
      snapshot[who] = bl[c.liftKey] ? Number(bl[c.liftKey].oneRM) || 0 : 0
    }

    let finalResult = result`
  t = t.replace(snapAnchor, snapNew)

  // 2.2 update 语句带上 judge_snapshot
  t = t.replace(
    `      \`update challenges set status = 'judged', judge_result = $2, judge_note = $3,
         judged_at = $4, judge_history = $5, finished_at = $6
        where id = $1\`,
      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now]`,
    `      \`update challenges set status = 'judged', judge_result = $2, judge_note = $3,
         judged_at = $4, judge_history = $5, finished_at = $6, judge_snapshot = $7
        where id = $1\`,
      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now, JSON.stringify(snapshot)]`
  )

  // 2.3 详情带上评论
  t = t.replace(
    `  const commentCount = (await query(
    "select count(*)::int as n from challenge_comments where challenge_id = $1 and status = 'normal'",
    [c._id]
  )).rows[0].n`,
    `  const comments = await commentsOf(c._id, me)
  const commentCount = comments.length`
  )

  // 2.4 详情返回值加 comments
  t = t.replace(
    `    canRejudge: c.status === 'judged' && now <= c.judgedAt + REJUDGE_MS,
    commentCount,`,
    `    canRejudge: c.status === 'judged' && now <= c.judgedAt + REJUDGE_MS,
    comments,
    commentCount,
    canComment: c.status !== 'expired' && c.status !== 'cancelled',`
  )

  // 2.5 追加：评论 / 点赞 / 挑战榜 / 徽章
  const tail = `
// ---------- 评论（先发后管） ----------

async function commentsOf(challengeId, me) {
  const rows = (await query(
    \`select c.*, m.nick_name, m.avatar from challenge_comments c
       left join members m on m.openid = c.openid
      where c.challenge_id = $1 and c.status = 'normal'
      order by c.created_at asc limit 200\`,
    [challengeId]
  )).rows
  const likedSet = new Set()
  if (me && rows.length) {
    const liked = (await query(
      'select comment_id from challenge_comment_likes where openid = $1 and comment_id = any($2::text[])',
      [me._id, rows.map(r => r.id)]
    )).rows
    liked.forEach(r => likedSet.add(r.comment_id))
  }
  return rows.map(r => ({
    _id: r.id,
    content: r.content,
    openid: r.openid,
    authorNname: r.nick_name || '会员',
    authorName: r.nick_name || '会员',
    avatar: r.avatar || '',
    likeCount: Number(r.like_count) || 0,
    likedByMe: likedSet.has(r.id),
    isMine: !!(me && r.openid === me._id),
    canDelete: !!(me && (r.openid === me._id || isAdmin(me))),
    time: fmtTime(r.created_at),
    createdAt: Number(r.created_at) || 0
  }))
}

async function commentChallenge({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  const content = String(data.content || '').trim()
  if (!content) fail('说点什么吧')
  if (content.length > 100) fail('评论最多 100 字')
  await query(
    \`insert into challenge_comments (id, challenge_id, openid, content, like_count, status, created_at)
     values ($1, $2, $3, $4, 0, 'normal', $5)\`,
    [newId(), c._id, me._id, content, Date.now()]
  )
  return commentsOf(c._id, me)
}

async function deleteChallengeComment({ me, data }) {
  need(me, 'member')
  const id = String(data.id || '')
  const row = (await query('select * from challenge_comments where id = $1', [id])).rows[0]
  if (!row) fail('评论不存在')
  if (row.openid !== me._id && !isAdmin(me)) fail('只能删自己的评论（管理员可删任意）')
  await query("update challenge_comments set status = 'hidden' where id = $1", [id])
  return commentsOf(row.challenge_id, me)
}

async function likeChallengeComment({ me, data }) {
  need(me, 'member')
  const id = String(data.id || '')
  const row = (await query('select * from challenge_comments where id = $1', [id])).rows[0]
  if (!row) fail('评论不存在')
  if (row.status !== 'normal') fail('这条评论已隐藏')

  const liked = (await query(
    'select 1 from challenge_comment_likes where comment_id = $1 and openid = $2', [id, me._id]
  )).rows.length
  if (liked) {
    await query('delete from challenge_comment_likes where comment_id = $1 and openid = $2', [id, me._id])
    await query('update challenge_comments set like_count = greatest(like_count - 1, 0) where id = $1', [id])
  } else {
    await query(
      'insert into challenge_comment_likes (comment_id, openid, created_at) values ($1, $2, $3) on conflict do nothing',
      [id, me._id, Date.now()]
    )
    await query('update challenge_comments set like_count = like_count + 1 where id = $1', [id])
  }
  return commentsOf(row.challenge_id, me)
}

// ---------- 挑战榜 + 徽章 ----------

const BADGE_DEFS = {
  first_win: { name: '首胜', desc: '赢下第一场挑战' },
  streak3: { name: '三连', desc: '连续赢 3 场' },
  streak5: { name: '五连', desc: '连续赢 5 场' },
  giant_killer: { name: '以下克上', desc: '赢了该项目成绩比自己高的人' },
  all_lifts: { name: '全项目挑战者', desc: '每个项目都赢过' },
  clean: { name: '清白之身', desc: '打完 10 场，没有作弊记录' }
}

// 本周一 00:00（北京时间）
function weekStartMs() {
  const now = new Date()
  const cn = new Date(now.getTime() + 8 * 3600e3)
  const day = cn.getUTCDay() || 7
  const startUtc = Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate() - (day - 1))
  return startUtc - 8 * 3600e3
}

async function statsOfAll() {
  const rows = (await query(
    \`select * from challenges where status = 'judged' order by judged_at asc\`
  )).rows
  const members = (await query('select * from members')).rows
  const nameById = {}
  members.forEach(m => { nameById[m.openid] = memberLabel(memberRow(m)) })

  const stats = {}
  for (const m of members) {
    stats[m.openid] = {
      openid: m.openid,
      name: nameById[m.openid],
      wins: 0, losses: 0, draws: 0,
      streak: 0, maxStreak: 0,
      winsByLift: [],
      giantKills: 0,
      judged: 0,
      cheatCount: Number(m.challenge_cheat_count) || 0,
      banUntil: Number(m.challenge_ban_until) || 0,
      weekWins: 0,
      lastJudgedAt: 0
    }
  }

  const weekStart = weekStartMs()
  for (const row of rows) {
    const c = challengeRow(row)
    const snap = row.judge_snapshot || {}
    const a = stats[c.challenger]
    const b = stats[c.opponent]
    if (!a || !b) continue
    a.judged++
    b.judged++

    if (c.judgeResult === 'draw') {
      a.draws++
      b.draws++
      continue
    }
    const winner = c.judgeResult === 'win_challenger' ? a : b
    const loser = winner === a ? b : a
    winner.wins++
    loser.losses++
    winner.streak++
    winner.maxStreak = Math.max(winner.maxStreak, winner.streak)
    loser.streak = 0
    winner.lastJudgedAt = c.judgedAt
    loser.lastJudgedAt = c.judgedAt
    if (!winner.winsByLift.includes(c.liftKey)) winner.winsByLift.push(c.liftKey)
    if (c.judgedAt >= weekStart) winner.weekWins++

    // 以下克上：赢的人该项目成绩反而更低
    const myRm = Number(snap[winner.openid]) || 0
    const hisRm = Number(snap[loser.openid]) || 0
    if (myRm > 0 && hisRm > 0 && myRm < hisRm) winner.giantKills++
  }
  return { stats, rows }
}

function badgesOf(s, liftKeys) {
  const list = []
  if (s.wins >= 1) list.push('first_win')
  if (s.maxStreak >= 3) list.push('streak3')
  if (s.maxStreak >= 5) list.push('streak5')
  if (s.giantKills >= 1) list.push('giant_killer')
  if (liftKeys.length && liftKeys.every(k => s.winsByLift.includes(k))) list.push('all_lifts')
  if (s.judged >= 10 && s.cheatCount === 0) list.push('clean')
  return list.map(k => ({ key: k, name: BADGE_DEFS[k].name, desc: BADGE_DEFS[k].desc }))
}

async function challengeBoard({ me, data }) {
  need(me, 'member')
  const { stats } = await statsOfAll()
  const items = await liftItems.list()
  const liftKeys = items.filter(i => i.enabled !== false).map(i => i.key)

  const decorateOne = s => Object.assign({}, s, {
    badges: badgesOf(s, liftKeys),
    winRate: s.judged ? Math.round((s.wins / s.judged) * 100) : 0,
    banned: s.banUntil > Date.now(),
    banUntilText: s.banUntil > Date.now() ? fmtTime(s.banUntil) : ''
  })

  const all = Object.values(stats).map(decorateOne)
  const week = all.filter(s => s.weekWins > 0 || s.wins > 0)
    .sort((x, y) => y.weekWins - x.weekWins || y.wins - x.wins || y.maxStreak - x.maxStreak)
    .slice(0, 20)
  const streak = all.filter(s => s.streak > 0)
    .sort((x, y) => y.streak - x.streak || y.wins - x.wins)
    .slice(0, 20)
  const total = all.filter(s => s.judged > 0)
    .sort((x, y) => y.wins - x.wins || y.winRate - x.winRate)
    .slice(0, 20)

  const mine = decorateOne(stats[me._id] || {
    openid: me._id, name: memberLabel(me), wins: 0, losses: 0, draws: 0, streak: 0, maxStreak: 0,
    winsByLift: [], giantKills: 0, judged: 0, cheatCount: 0, banUntil: 0, weekWins: 0, lastJudgedAt: 0
  })

  return { week, streak, total, mine, weekStart: weekStartMs() }
}

`

  t = t.replace(
    'module.exports = {\n  createChallenge,',
    tail + 'module.exports = {\n  createChallenge,'
  )

  // 2.6 导出新 action
  t = t.replace(
    `  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions
}`,
    `  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions,
  commentChallenge,
  deleteChallengeComment,
  likeChallengeComment,
  challengeBoard
}`
  )
  return t
}, 'challenge.js：评论/点赞/挑战榜/徽章')

// ---------- 3. index.js 功能开关映射 ----------
edit('index.js', t => {
  if (t.includes('commentChallenge:')) return t
  return t.replace(
    `  refereeOptions: 'rank',`,
    `  refereeOptions: 'rank',
  commentChallenge: 'rank',
  deleteChallengeComment: 'rank',
  likeChallengeComment: 'rank',
  challengeBoard: 'rank',`
  )
}, '注册 P2 action')

// ---------- 4. 测试清表加点赞表 ----------
edit('test/run.js', t => {
  if (t.includes("'challenge_comment_likes'")) return t
  return t.replace(
    `  'challenges', 'challenge_videos', 'challenge_comments'`,
    `  'challenges', 'challenge_videos', 'challenge_comments', 'challenge_comment_likes'`
  )
}, '测试清表加点赞表')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/lib/challenge.js'])
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/index.js'])
console.log('  ✓ 语法通过')
