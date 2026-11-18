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

// 时间窗口
const ACCEPT_MS = 2 * 3600e3       // 应战期限
const VIDEO_MS = 2 * 3600e3        // 视频提交期限
const JUDGE_MS = 2 * 3600e3        // 裁判判决期限
const REJUDGE_MS = 3 * 3600e3      // 改判窗口
const BAN_MS = 7 * 24 * 3600e3     // 作弊禁赛（每次 7 天）
const BAN_HARD_MS = 30 * 24 * 3600e3 // 累计 3 次后 30 天
const CHEAT_HARD_COUNT = 3
const MAX_ACTIVE = 2               // 每人同时最多进行中挑战数
const MAX_VIDEOS_PER_SIDE = 1      // 每方最多 1 段视频
const PAGE_SIZE = 20

const ACTIVE_STATUS = ['pending', 'waiting_referee', 'accepted', 'ready']

const STATUS_NAMES = {
  pending: '待应战',
  waiting_referee: '等裁判确认',
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
  if (c.status === 'accepted' && c.submitBy && now > c.submitBy) {
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

  // 接受：如果对方已经应战，进入视频阶段
  if (c.status === 'waiting_referee') {
    await query(
      `update challenges set referee_state = 'accepted', status = 'accepted', submit_by = $2
        where id = $1`,
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query("update challenges set referee_state = 'accepted' where id = $1", [c._id])
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
  // 裁判已接受 → 直接进入视频阶段；否则等裁判
  if (c.refereeState === 'accepted') {
    await query(
      "update challenges set status = 'accepted', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query("update challenges set status = 'waiting_referee' where id = $1", [c._id])
  }
  return detailById(c._id, me)
}

// ---------- 视频 ----------

async function submitChallengeVideo({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  assertParticipant(c, me)
  if (c.status !== 'accepted') fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  const url = String(data.videoUrl || '')
  if (!/^(cloud:\/\/|https:\/\/)/.test(url)) fail('视频地址不正确')

  const mine = (await query(
    'select count(*)::int as n from challenge_videos where challenge_id = $1 and openid = $2',
    [c._id, me._id]
  )).rows[0].n
  if (mine >= MAX_VIDEOS_PER_SIDE) fail('每人最多 ' + MAX_VIDEOS_PER_SIDE + ' 段视频，先删掉旧的再传')

  const now = Date.now()
  await query(
    `insert into challenge_videos (id, challenge_id, openid, video_url, video_thumb, uploaded_by, cheat_flag, cheat_reason, created_at)
     values ($1, $2, $3, $4, $5, $6, false, '', $7)`,
    [newId(), c._id, me._id, url, String(data.videoThumb || ''), me._id, now]
  )

  // 双方都交了 → 进入待判决，开始算裁判的 2 小时
  const counts = (await query(
    'select count(distinct openid)::int as n from challenge_videos where challenge_id = $1',
    [c._id]
  )).rows[0].n
  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
  }
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
         judged_at = $4, judge_history = $5, finished_at = $6
        where id = $1`,
      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now]
    )
  })
  // 事务提交后再读，避免读到旧状态
  return detailById(c._id, me)
}

// ---------- 查询 ----------

function metricName(metric) {
  return metric === 'relative' ? '相对体重' : '绝对成绩'
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

  const commentCount = (await query(
    "select count(*)::int as n from challenge_comments where challenge_id = $1 and status = 'normal'",
    [c._id]
  )).rows[0].n

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
    commentCount,
    createdAt: c.createdAt,
    createdDate: cnDate(c.createdAt),
    createdTime: fmtTime(c.createdAt),
    expireAt: c.expireAt,
    submitBy: c.submitBy,
    judgeBy: c.judgeBy,
    // 前端用的可操作性判断
    canRespond: c.status === 'pending' && c.opponent === me._id,
    canRefereeAct: c.referee === me._id && c.refereeState === 'invited' && c.status === 'pending',
    canSubmitVideo: c.status === 'accepted' && (c.challenger === me._id || c.opponent === me._id),
    myVideo: videos.find(v => v.openid === me._id) || null,
    canJudge: c.status === 'ready' && (c.referee === me._id || isAdmin(me)),
    canReinvite: (c.status === 'referee_vetoed' || (c.status === 'pending' && c.refereeState === 'declined')) &&
      c.challenger === me._id,
    isMine: c.challenger === me._id || c.opponent === me._id,
    isReferee: c.referee === me._id,
    // 倒计时用的截止点
    deadline: c.status === 'pending' ? c.expireAt
      : c.status === 'accepted' ? c.submitBy
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

module.exports = {
  createChallenge,
  pickReferee,
  respondChallenge,
  refereeRespond,
  submitChallengeVideo,
  judgeChallenge,
  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions
}
