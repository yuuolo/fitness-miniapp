// 会员挑战（裁判制）
//
// 规则（2026-11-18 定稿）：
//   · 发起挑战必须指定一名教练当主裁判；教练可拒绝接活；被挑战者可否决赛判
//   · 被挑战者 2 小时内应战/拒绝；应战后双方各上传 1 段视频，2 小时内必须交齐
//   · 视频提交后 2 小时内主裁判必须判定（胜/负/平），可标记某方视频作弊
//   · 判定后 3 小时内可改判（留痕）；判定理由对所有会员公开
//   · 作弊：该方判负 + 公开标记 + 计入作弊次数 + 禁赛（默认 7 天，累计 3 次升到 30 天）
//   · 挑战对所有会员可见；每人同时最多 2 场进行中的挑战
//   · 视频走 /api/video（按管理页设定自动裁切、限制体积）
const { query, tx } = require('./db')
const {
  cnDate, cnDateTime, dayStart, fail, need, newId, memberLabel, memberRow,
  ROLE_LEVEL
} = require('./common')
const liftItems = require('./lift-items')
const limits = require('./limits')
const notify = require('./notify')

// 时间窗口
const ACCEPT_MS = 2 * 3600e3       // 应战期限
const VIDEO_MS = 2 * 3600e3        // 视频提交期限
const JUDGE_MS = 2 * 3600e3        // 裁判判决期限
const REJUDGE_MS = 3 * 3600e3      // 改判窗口
const BAN_MS = 7 * 24 * 3600e3     // 作弊禁赛（每次 7 天）
const BAN_HARD_MS = 30 * 24 * 3600e3 // 累计 3 次后 30 天
const CHEAT_HARD_COUNT = 3
const MAX_ACTIVE = 2               // 每人同时最多进行中挑战数
// 每方视频段数沿用后台「单条最多照片/视频数量」（maxCount），默认 9
let MAX_VIDEOS_PER_SIDE = 9
const PAGE_SIZE = 20

const ACTIVE_STATUS = ['pending', 'waiting_referee', 'accepted', 'ready']

const STATUS_NAMES = {
  pending: '待应战',
  waiting_referee: '上传视频中',
  accepted: '进行中',
  ready: '待判决',
  judged: '已判定',
  declined: '已拒绝',
  expired: '已失效',
  cancelled: '已取消',
  void: '流局',
  referee_vetoed: '裁判被否决'
}

const RESULT_NAMES = {
  win_challenger: '发起方胜',
  win_opponent: '应战方胜',
  draw: '平局',
  void: '流局'
}

function isStaff(me) {
  return (ROLE_LEVEL[me ? me.role : ''] || 0) >= ROLE_LEVEL.coach
}

function isAdmin(me) {
  return (ROLE_LEVEL[me ? me.role : ''] || 0) >= ROLE_LEVEL.admin
}

function fmtTime(ts) {
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
}

// ---------- 行映射 ----------

function challengeRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    challenger: r.challenger,
    opponent: r.opponent,
    referee: r.referee,
    liftKey: r.lift_key,
    metric: r.metric,
    trashTalk: r.trash_talk || '',
    status: r.status,
    refereeState: r.referee_state,
    judgeResult: r.judge_result || '',
    judgeNote: r.judge_note || '',
    judgedAt: Number(r.judged_at) || 0,
    judgeHistory: r.judge_history || [],
    expireAt: Number(r.expire_at) || 0,
    submitBy: Number(r.submit_by) || 0,
    judgeBy: Number(r.judge_by) || 0,
    createdAt: Number(r.created_at) || 0,
    finishedAt: Number(r.finished_at) || 0
  }
}

function videoRow(r) {
  if (!r) return null
  return {
    _id: r.id,
    challengeId: r.challenge_id,
    openid: r.openid,
    videoUrl: r.video_url,
    videoThumb: r.video_thumb || '',
    uploadedBy: r.uploaded_by || '',
    cheatFlag: !!r.cheat_flag,
    cheatReason: r.cheat_reason || '',
    createdAt: Number(r.created_at) || 0
  }
}

// ---------- 过期处理（读的时候顺手结算，不依赖定时任务） ----------

async function settleOverdue(row) {
  if (!row) return row
  const now = Date.now()
  const c = challengeRow(row)

  // 待应战超时 → 失效
  if (c.status === 'pending' && c.expireAt && now > c.expireAt) {
    await query("update challenges set status = 'expired', finished_at = $2 where id = $1", [c._id, now])
    return challengeRow((await query('select * from challenges where id = $1', [c._id])).rows[0])
  }
  // 进行中但视频没交齐、超过提交截止 → 流局
  if ((c.status === 'accepted' || c.status === 'waiting_referee') && c.submitBy && now > c.submitBy) {
    await query("update challenges set status = 'void', finished_at = $2 where id = $1", [c._id, now])
    return challengeRow((await query('select * from challenges where id = $1', [c._id])).rows[0])
  }
  return c
}

async function loadChallenge(id) {
  const row = (await query('select * from challenges where id = $1', [id])).rows[0]
  if (!row) fail('挑战不存在')
  return settleOverdue(row)
}

// ---------- 角色校验 ----------

function assertParticipant(c, me) {
  if (c.challenger !== me._id && c.opponent !== me._id) fail('只有挑战双方能操作')
}

function assertReferee(c, me) {
  if (c.referee !== me._id && !isAdmin(me)) fail('只有主裁判能判定')
}

// 禁赛检查
function assertNotBanned(member) {
  const until = Number(member.challengeBanUntil) || 0
  if (until > Date.now()) {
    fail('你因作弊被禁赛到 ' + fmtTime(until) + '，暂时不能参与挑战')
  }
}

// 进行中的挑战数量
async function activeCount(openid) {
  const r = await query(
    "select count(*)::int as n from challenges where status = any($2::text[]) and (challenger = $1 or opponent = $1)",
    [openid, ACTIVE_STATUS]
  )
  return r.rows[0].n
}

// ---------- 发起 / 应战 / 裁判 ----------

// 可挑战的会员列表：普通会员也能调用（挑战选对手用）
// 注意：searchMembers 是教练权限的（员工端查会员用），会员挑战不能用它，
// 所以这里单独开一个只返回公开信息的列表（不含手机号）
async function challengeOpponents({ me, data }) {
  need(me, 'member')
  const kw = String((data && data.keyword) || '').trim()
  const limit = Math.min(Math.max(Number(data && data.limit) || 20, 1), 50)

  if (!kw) {
    const rows = (await query(
      `select openid, nick_name, avatar, role from members
        where openid <> $1 order by created_at desc limit $2`,
      [me._id, limit]
    )).rows
    return rows.map(row => ({
      _id: row.openid,
      name: row.nick_name || '未命名会员',
      nickName: row.nick_name || '',
      avatar: row.avatar || '',
      role: row.role || 'member'
    }))
  }

  // 数字当手机号搜（只用来匹配，不返回手机号），其他按昵称搜
  const pattern = '%' + kw.replace(/[%_\\]/g, ch => '\\' + ch) + '%'
  const column = /^\d+$/.test(kw) ? 'phone' : 'nick_name'
  const rows = (await query(
    `select openid, nick_name, avatar, role from members
      where ${column} ilike $1 and openid <> $2 order by created_at desc limit $3`,
    [pattern, me._id, limit]
  )).rows
  return rows.map(row => ({
    _id: row.openid,
    name: row.nick_name || '未命名会员',
    nickName: row.nick_name || '',
    avatar: row.avatar || '',
    role: row.role || 'member'
  }))
}

// 可选裁判：只有教练（admin 也能判，但列表只给教练，符合「主裁判只能是教练」）
async function refereeOptions({ me }) {
  need(me, 'member')
  const rows = (await query("select * from members where role = 'coach' order by created_at limit 100")).rows.map(memberRow)
  return rows.map(m => ({ _id: m._id, name: memberLabel(m), cheatCount: m.challengeCheatCount || 0 }))
}

async function createChallenge({ me, data }) {
  need(me, 'member')
  const fresh = memberRow((await query('select * from members where openid = $1', [me._id])).rows[0])
  assertNotBanned(fresh)

  const opponent = String(data.opponent || '')
  const referee = String(data.referee || '')
  if (!opponent) fail('请选择挑战对象')
  if (!referee) fail('请指定一名教练当主裁判')
  if (opponent === me._id) fail('不能挑战自己')
  if (referee === me._id || referee === opponent) fail('裁判不能是挑战双方')

  const op = (await query('select * from members where openid = $1', [opponent])).rows[0]
  if (!op) fail('被挑战的会员不存在')
  const rf = (await query('select * from members where openid = $1', [referee])).rows[0]
  if (!rf) fail('裁判不存在')
  if (rf.role !== 'coach') fail('主裁判只能指定教练')

  const items = await liftItems.enabledMap()
  const item = items[String(data.liftKey || '')]
  if (!item) fail('请选择挑战项目')
  const metric = data.metric === 'relative' ? 'relative' : 'absolute'

  if (await activeCount(me._id) >= MAX_ACTIVE) fail('你同时最多 ' + MAX_ACTIVE + ' 场挑战，先打完一场再来')
  if (await activeCount(opponent) >= MAX_ACTIVE) fail('对方手上已有 ' + MAX_ACTIVE + ' 场挑战，等他打完再约')

  const now = Date.now()
  const id = newId()
  await query(
    `insert into challenges (id, challenger, opponent, referee, lift_key, metric, trash_talk,
       status, referee_state, judge_result, judge_note, judge_history,
       expire_at, submit_by, judge_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'invited', '', '', '[]'::jsonb, $8, 0, 0, $9)`,
    [id, me._id, opponent, referee, item.key, metric, String(data.trashTalk || '').slice(0, 20),
      now + ACCEPT_MS, now]
  )
  const created = await loadChallenge(id)
  notifyInvite(created).catch(() => {})
  return detailById(id, me)
}

// 发起人重选裁判（裁判拒绝 / 被挑战者否决后用）
async function pickReferee({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  if (c.challenger !== me._id) fail('只有发起人能换裁判')
  if (!['pending', 'referee_vetoed'].includes(c.status)) fail('现在不能换裁判')
  const referee = String(data.referee || '')
  if (!referee) fail('请选择教练')
  if (referee === c.challenger || referee === c.opponent) fail('裁判不能是挑战双方')
  const rf = (await query('select * from members where openid = $1', [referee])).rows[0]
  if (!rf || rf.role !== 'coach') fail('主裁判只能指定教练')

  await query(
    `update challenges set referee = $2, referee_state = 'invited', status = 'pending'
      where id = $1`,
    [c._id, referee]
  )
  return detailById(c._id, me)
}

// 裁判接受 / 拒绝
async function refereeRespond({ me, data }) {
  need(me, 'coach')
  const c = await loadChallenge(String(data.id || ''))
  if (c.referee !== me._id) fail('这不是指派给你的挑战')
  if (c.refereeState !== 'invited') fail('这单裁判已经处理过了')
  const decision = data.decision === 'decline' ? 'decline' : 'accept'
  const now = Date.now()

  if (decision === 'decline') {
    await query("update challenges set referee_state = 'declined' where id = $1", [c._id])
    return detailById(c._id, me)
  }

  // 接受：按当前进度决定状态（视频已交齐就直接待判决）
  await query("update challenges set referee_state = 'accepted' where id = $1", [c._id])
  const vids = (await query(
    'select count(distinct openid)::int as n from challenge_videos where challenge_id = $1',
    [c._id]
  )).rows[0].n
  if (vids >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
  } else if (c.status === 'waiting_referee') {
    await query(
      "update challenges set status = 'accepted', submit_by = coalesce(nullif(submit_by, 0), $2) where id = $1",
      [c._id, now + VIDEO_MS]
    )
  }
  return detailById(c._id, me)
}

// 被挑战者应战 / 拒绝（可否决赛判）
async function respondChallenge({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  if (c.opponent !== me._id) fail('这场挑战不是发给你的')
  if (c.status !== 'pending') fail('这单已经不能应战了（' + (STATUS_NAMES[c.status] || c.status) + '）')
  const now = Date.now()

  if (data.decision === 'decline') {
    await query("update challenges set status = 'declined', finished_at = $2 where id = $1", [c._id, now])
    return detailById(c._id, me)
  }
  if (data.vetoReferee) {
    await query("update challenges set status = 'referee_vetoed' where id = $1", [c._id])
    return detailById(c._id, me)
  }
  // 双方确认后立刻开始 2 小时视频倒计时；裁判还没接单也不影响传视频
  if (c.refereeState === 'accepted') {
    await query(
      "update challenges set status = 'accepted', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query(
      "update challenges set status = 'waiting_referee', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  }
  return detailById(c._id, me)
}

// ---------- 视频 ----------

async function submitChallengeVideo({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  // 待判决（双方都已交齐）时也允许继续补传，方便补齐多段视频
  if (!['accepted', 'waiting_referee', 'ready'].includes(c.status)) {
    fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  }

  // 谁上传的：本人或裁判（教练/管理员）代传
  const isReferee = c.referee === me._id || isAdmin(me)
  let owner = me._id
  if (data.forOpenid) {
    if (!isReferee) fail('只有主裁判可以代传视频')
    owner = String(data.forOpenid)
    if (owner !== c.challenger && owner !== c.opponent) fail('只能给挑战双方代传')
  } else if (!isReferee) {
    if (c.challenger !== me._id && c.opponent !== me._id) fail('只有挑战双方能上传视频')
  } else if (c.challenger !== me._id && c.opponent !== me._id && !data.forOpenid) {
    // 裁判自己上传时必须说明是哪一方
    fail('裁判代传请指定是给哪一方')
  }

  const url = String(data.videoUrl || '')
  if (!/^(cloud:\/\/|https:\/\/)/.test(url)) fail('视频地址不正确')

  // 段数上限跟随管理页设定
  const cfg = await limits.get()
  MAX_VIDEOS_PER_SIDE = cfg.maxCount > 0 ? cfg.maxCount : 9
  const count = (await query(
    'select count(*)::int as n from challenge_videos where challenge_id = $1 and openid = $2',
    [c._id, owner]
  )).rows[0].n
  if (count >= MAX_VIDEOS_PER_SIDE) {
    fail('每方最多 ' + MAX_VIDEOS_PER_SIDE + ' 段视频（管理页设定），请先删掉一些再传')
  }

  const now = Date.now()
  await query(
    `insert into challenge_videos (id, challenge_id, openid, video_url, video_thumb, uploaded_by, cheat_flag, cheat_reason, created_at)
     values ($1, $2, $3, $4, $5, $6, false, '', $7)`,
    [newId(), c._id, owner, url, String(data.videoThumb || ''), me._id, now]
  )

  // 双方都至少有一段 → 进入待判决，开始算裁判的 2 小时
  const counts = (await query(
    'select count(distinct openid)::int as n from challenge_videos where challenge_id = $1',
    [c._id]
  )).rows[0].n
  if (counts >= 2) {
    if (c.status === 'ready') {
      // 已经是待判决：只补视频，不重置裁判倒计时
      await query("update challenges set status = 'ready' where id = $1", [c._id])
    } else {
      await query(
        "update challenges set status = 'ready', judge_by = $2 where id = $1",
        [c._id, now + JUDGE_MS]
      )
      const ready = await loadChallenge(c._id)
      notifyJudgeReady(ready).catch(() => {})
    }
  }
  return detailById(c._id, me)
}

// 删除一段挑战视频（本人可删自己的，裁判/管理员可删任意）
async function deleteChallengeVideo({ me, data }) {
  need(me, 'member')
  const id = String(data.id || '')
  const video = (await query('select * from challenge_videos where id = $1', [id])).rows[0]
  if (!video) fail('视频不存在')
  const c = await loadChallenge(video.challenge_id)
  const isReferee = c.referee === me._id || isAdmin(me)
  if (!isReferee && video.openid !== me._id) fail('只能删除自己的视频')
  if (c.status === 'judged' && !isAdmin(me)) fail('已判定的挑战不能再删视频')
  await query('delete from challenge_videos where id = $1', [id])
  return detailById(c._id, me)
}

// ---------- 判定 ----------

async function judgeChallenge({ me, data }) {
  // 用 member 门槛 + 裁判校验：普通会员会看到「只有主裁判能判定」，而不是笼统的「没有权限」
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  assertReferee(c, me)
  if (c.status !== 'ready' && c.status !== 'judged') fail('现在不能判定（' + (STATUS_NAMES[c.status] || c.status) + '）')

  const now = Date.now()
  const result = ['win_challenger', 'win_opponent', 'draw'].includes(data.result) ? data.result : ''
  if (!result) fail('请选择判定结果')
  const note = String(data.note || '').slice(0, 100)
  const cheatOpenid = String(data.cheatOpenid || '')

  // 改判只允许判定后 3 小时内
  if (c.status === 'judged' && now > c.judgedAt + REJUDGE_MS) {
    fail('判定已超过 ' + (REJUDGE_MS / 3600e3) + ' 小时，不能改判了')
  }

  await tx(async client => {
    // 判定时记录双方在该项目的最好成绩（「以下克上」徽章要用）
    const snapshot = {}
    for (const who of [c.challenger, c.opponent]) {
      const row = (await client.query('select best_lift from members where openid = $1', [who])).rows[0]
      const bl = (row && row.best_lift) || {}
      snapshot[who] = bl[c.liftKey] ? Number(bl[c.liftKey].oneRM) || 0 : 0
    }

    let finalResult = result
    if (cheatOpenid) {
      if (cheatOpenid !== c.challenger && cheatOpenid !== c.opponent) fail('作弊方必须是挑战双方之一')
      // 标记该方视频作弊
      await client.query(
        `update challenge_videos set cheat_flag = true, cheat_reason = $3
          where challenge_id = $1 and openid = $2`,
        [c._id, cheatOpenid, note || '裁判判定视频作弊']
      )
      // 作弊方直接判负
      finalResult = cheatOpenid === c.challenger ? 'win_opponent' : 'win_challenger'
      // 禁赛 + 累计作弊次数
      const row = (await client.query('select * from members where openid = $1 for update', [cheatOpenid])).rows[0]
      const count = (Number(row.challenge_cheat_count) || 0) + 1
      const banMs = count >= CHEAT_HARD_COUNT ? BAN_HARD_MS : BAN_MS
      await client.query(
        'update members set challenge_cheat_count = $2, challenge_ban_until = $3 where openid = $1',
        [cheatOpenid, count, now + banMs]
      )
    }

    const history = Array.isArray(c.judgeHistory) ? c.judgeHistory.slice() : []
    history.push({
      result: finalResult, note, cheatOpenid, judge: me._id, at: now, rejudge: c.status === 'judged'
    })

    await client.query(
      `update challenges set status = 'judged', judge_result = $2, judge_note = $3,
         judged_at = $4, judge_history = $5, finished_at = $6, judge_snapshot = $7
        where id = $1`,
      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now, JSON.stringify(snapshot)]
    )
  })
  // 事务提交后再读，避免读到旧状态
  const judged = await loadChallenge(c._id)
  notifyJudgeResult(judged).catch(() => {})
  return decorate(judged, me)
}

// ---------- 查询 ----------

function metricName(metric) {
  return metric === 'relative' ? '相对体重' : '绝对成绩'
}

async function videoLimitOf() {
  const cfg = await limits.get()
  return cfg.maxCount > 0 ? cfg.maxCount : 9
}

async function decorate(c, me, opts) {
  const items = await liftItems.list()
  const item = items.find(i => i.key === c.liftKey) || { name: c.liftKey, unit: '' }
  const people = (await query(
    'select * from members where openid = any($1::text[])',
    [[c.challenger, c.opponent, c.referee]]
  )).rows.map(memberRow)
  const byId = {}
  people.forEach(p => { byId[p._id] = p })
  const nameOf = id => (byId[id] ? memberLabel(byId[id]) : '（已退会）')

  const videos = (await query(
    'select * from challenge_videos where challenge_id = $1 order by created_at asc', [c._id]
  )).rows.map(videoRow)

  const comments = await commentsOf(c._id, me)
  const commentCount = comments.length

  const now = Date.now()
  return {
    _id: c._id,
    liftKey: c.liftKey,
    liftName: item.name,
    unit: item.unit,
    metric: c.metric,
    metricName: metricName(c.metric),
    trashTalk: c.trashTalk,
    status: c.status,
    statusName: STATUS_NAMES[c.status] || c.status,
    challenger: { openid: c.challenger, name: nameOf(c.challenger), isMe: c.challenger === me._id },
    opponent: { openid: c.opponent, name: nameOf(c.opponent), isMe: c.opponent === me._id },
    referee: {
      openid: c.referee,
      name: nameOf(c.referee),
      state: c.refereeState,
      isMe: c.referee === me._id
    },
    videos: videos.map(v => Object.assign({}, v, {
      side: v.openid === c.challenger ? 'challenger' : 'opponent',
      ownerName: nameOf(v.openid)
    })),
    judgeResult: c.judgeResult,
    judgeResultName: RESULT_NAMES[c.judgeResult] || '',
    judgeNote: c.judgeNote,
    judgedAt: c.judgedAt,
    canRejudge: c.status === 'judged' && now <= c.judgedAt + REJUDGE_MS,
    comments,
    commentCount,
    canComment: c.status !== 'expired' && c.status !== 'cancelled',
    createdAt: c.createdAt,
    createdDate: cnDate(c.createdAt),
    createdTime: fmtTime(c.createdAt),
    expireAt: c.expireAt,
    submitBy: c.submitBy,
    judgeBy: c.judgeBy,
    // 前端用的可操作性判断
    canRespond: c.status === 'pending' && c.opponent === me._id,
    canRefereeAct: c.referee === me._id && c.refereeState === 'invited' && c.status === 'pending',
    canSubmitVideo: ['accepted', 'waiting_referee', 'ready'].includes(c.status) &&
      (c.challenger === me._id || c.opponent === me._id || c.referee === me._id || isAdmin(me)),
    // 裁判 / 管理员可以给任意一方代传
    canProxyVideo: ['accepted', 'waiting_referee', 'ready'].includes(c.status) &&
      (c.referee === me._id || isAdmin(me)) && c.challenger !== me._id && c.opponent !== me._id,
    videoLimit: await videoLimitOf(),
    myVideo: videos.find(v => v.openid === me._id) || null,
    canJudge: c.status === 'ready' && (c.referee === me._id || isAdmin(me)),
    canReinvite: (c.status === 'referee_vetoed' || (c.status === 'pending' && c.refereeState === 'declined')) &&
      c.challenger === me._id,
    isMine: c.challenger === me._id || c.opponent === me._id,
    isReferee: c.referee === me._id,
    // 倒计时用的截止点
    deadline: c.status === 'pending' ? c.expireAt
      : (c.status === 'accepted' || c.status === 'waiting_referee') ? c.submitBy
        : c.status === 'ready' ? c.judgeBy : 0
  }
}

async function detailById(id, me) {
  const c = await loadChallenge(id)
  return decorate(c, me)
}

async function challengeDetail({ me, data }) {
  need(me, 'member')
  return detailById(String(data.id || ''), me)
}

async function challengeList({ me, data }) {
  need(me, 'member')
  const tab = ['all', 'mine', 'incoming', 'judging'].includes(data.tab) ? data.tab : 'all'
  const before = Number(data.before) || 0
  const params = [PAGE_SIZE]
  let where = '1 = 1'
  if (before) {
    params.push(before)
    where += ' and created_at < $' + params.length
  }
  if (tab === 'mine') {
    params.push(me._id)
    where += ' and (challenger = $' + params.length + ' or opponent = $' + params.length + ')'
  } else if (tab === 'incoming') {
    params.push(me._id)
    where += ' and opponent = $' + params.length
  } else if (tab === 'judging') {
    params.push(me._id)
    where += ' and referee = $' + params.length
  }

  const rows = (await query(
    'select * from challenges where ' + where + ' order by created_at desc limit $1', params
  )).rows
  const settled = []
  for (const r of rows) settled.push(await settleOverdue(r))

  const list = []
  for (const c of settled) list.push(await decorate(c, me))
  const counts = await summaryCounts(me)
  return { tab, list, hasMore: rows.length >= PAGE_SIZE, counts }
}

// 红点用的计数
async function summaryCounts(me) {
  if (!me) return { incoming: 0, judging: 0, active: 0, toSubmit: 0, toJudge: 0 }
  const openid = me._id
  const r = (await query(
    `select
       count(*) filter (where status = 'pending' and opponent = $1)::int as incoming,
       count(*) filter (where status = 'pending' and referee_state = 'invited' and referee = $1)::int as judging_invite,
       count(*) filter (where status in ('pending','waiting_referee','accepted','ready')
                          and (challenger = $1 or opponent = $1))::int as active,
       count(*) filter (where status = 'accepted' and (challenger = $1 or opponent = $1))::int as to_submit,
       count(*) filter (where status = 'ready' and referee = $1)::int as to_judge
       from challenges`,
    [openid]
  )).rows[0]
  const incoming = r.incoming
  // 「待我处理」= 待应战 + 待交视频 + 待判决（裁判）
  const mine = incoming + r.to_submit + r.judge_invite + r.to_judge
  return {
    incoming,
    toSubmit: r.to_submit,
    toJudge: r.to_judge,
    judgingInvite: r.judging_invite,
    active: r.active,
    badge: mine
  }
}

async function challengeSummary({ me }) {
  need(me, 'member')
  return summaryCounts(me)
}


// ---------- 评论（先发后管） ----------

async function commentsOf(challengeId, me) {
  const rows = (await query(
    `select c.*, m.nick_name, m.avatar from challenge_comments c
       left join members m on m.openid = c.openid
      where c.challenge_id = $1 and c.status = 'normal'
      order by c.created_at asc limit 200`,
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
    `insert into challenge_comments (id, challenge_id, openid, content, like_count, status, created_at)
     values ($1, $2, $3, $4, 0, 'normal', $5)`,
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
    `select * from challenges where status = 'judged' order by judged_at asc`
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

module.exports = {
  createChallenge,
  pickReferee,
  respondChallenge,
  refereeRespond,
  submitChallengeVideo,
  deleteChallengeVideo,
  judgeChallenge,
  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions,
  commentChallenge,
  deleteChallengeComment,
  likeChallengeComment,
  challengeBoard,
  challengeOpponents,
  notifyTemplates
}
