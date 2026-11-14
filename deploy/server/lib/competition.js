// 竞赛：教练/店员发起、有起止时间与奖品，会员查看实时排名
//
// 每个参赛者可以有多条成绩（一个项目可以反复挑战），排名取最好的一条。
// 成绩可以配一段视频作为凭证，由教练上传，会员点开就能看。
const { query } = require('./db')
const {
  cnDateTime, fail, need, newId, memberLabel, getMember, ROLE_LEVEL
} = require('./common')
const liftItems = require('./lift-items')

const MAX_TITLE = 20
const MAX_PRIZE = 60
const MAX_RULES = 500
const MAX_DESC = 200
const MAX_ENTRIES_PER_PAGE = 200

function text(value, max, label, required) {
  const s = String(value === undefined || value === null ? '' : value).trim()
  if (required && !s) fail('请填写' + label)
  if (s.length > max) fail(label + '不能超过 ' + max + ' 个字')
  return s
}

function isStaff(me) {
  return (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.staff
}

function isCoach(me) {
  return (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.coach
}

function round(n, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(n * p) / p
}

// 状态按时间实时推导：到点自动结束，避免依赖定时任务
function statusOf(c) {
  if (c.status === 'cancelled') return 'cancelled'
  const now = Date.now()
  if (now < c.start_at) return 'upcoming'
  if (now >= c.end_at) return 'ended'
  return 'active'
}

const STATUS_NAMES = { upcoming: '未开始', active: '进行中', ended: '已结束', cancelled: '已取消' }

function view(c, extra) {
  const status = statusOf(c)
  return Object.assign({
    _id: c.id,
    title: c.title,
    desc: c.descr || '',
    liftKey: c.lift_key,
    liftName: c.lift_name,
    metric: c.metric,
    unit: c.unit,
    startAt: c.start_at,
    endAt: c.end_at,
    startText: cnDateTime(c.start_at),
    endText: cnDateTime(c.end_at),
    prize: c.prize || '',
    rules: c.rules || '',
    status,
    statusName: STATUS_NAMES[status] || status,
    createdBy: c.created_by,
    createdByName: c.created_by_name,
    createdAt: c.created_at
  }, extra || {})
}

function entryView(e) {
  return {
    _id: e.id,
    openid: e.openid,
    memberName: e.member_name,
    value: Number(e.value) || 0,
    weight: Number(e.weight) || 0,
    reps: e.reps,
    note: e.note || '',
    videoUrl: e.video_url || '',
    videoThumb: e.video_thumb || '',
    operator: e.operator || '',
    recordedAt: e.recorded_at,
    recordedText: cnDateTime(e.recorded_at || e.created_at)
  }
}

/** 排名：每个参赛者取最好成绩，按数值降序 */
async function rankingOf(competitionId) {
  const rows = (await query(
    `select distinct on (openid) *
       from competition_entries
      where competition_id = $1
      order by openid, value desc, recorded_at asc`,
    [competitionId]
  )).rows
  const sorted = rows.sort((a, b) => Number(b.value) - Number(a.value))
  return sorted.map((e, i) => Object.assign(entryView(e), { rank: i + 1 }))
}

// ---------- 会员侧 ----------

async function competitionList({ me, data = {} }) {
  need(me, 'member')
  const includeEnded = data.includeEnded !== false
  const rows = (await query(
    `select c.*,
            (select count(distinct openid) from competition_entries e where e.competition_id = c.id) as player_count
       from competitions c
      where c.status <> 'cancelled'
      order by (c.status = 'active') desc, c.end_at desc
      limit 50`
  )).rows

  const list = []
  for (const c of rows) {
    const status = statusOf(c)
    if (!includeEnded && status !== 'active' && status !== 'upcoming') continue
    const mine = (await query(
      `select value from competition_entries where competition_id = $1 and openid = $2 order by value desc limit 1`,
      [c.id, me._id]
    )).rows[0]
    const rank = mine
      ? (await query(
        `select count(distinct openid)::int as n from competition_entries
          where competition_id = $1 and value > $2`,
        [c.id, mine.value]
      )).rows[0].n + 1
      : null
    list.push(view(c, {
      playerCount: Number(c.player_count) || 0,
      myValue: mine ? Number(mine.value) : null,
      myRank: rank
    }))
  }
  return { list }
}

async function competitionDetail({ me, data = {} }) {
  need(me, 'member')
  const c = (await query('select * from competitions where id = $1', [data.id])).rows[0]
  if (!c) fail('竞赛不存在')
  const ranking = await rankingOf(c.id)
  const myEntries = (await query(
    `select * from competition_entries where competition_id = $1 and openid = $2 order by value desc`,
    [c.id, me._id]
  )).rows.map(entryView)

  return {
    competition: view(c, {
      playerCount: ranking.length,
      canManage: isCoach(me) && (c.created_by === me._id || isStaff(me))
    }),
    ranking: ranking.slice(0, 50),
    myRank: ranking.find(r => r.openid === me._id) || null,
    myEntries
  }
}

// ---------- 员工侧 ----------

async function saveCompetition({ me, data = {} }) {
  need(me, 'coach')
  const title = text(data.title, MAX_TITLE, '竞赛名称', true)
  const descr = text(data.desc, MAX_DESC, '简介')
  const prize = text(data.prize, MAX_PRIZE, '奖品')
  const rules = text(data.rules, MAX_RULES, '规则')

  const items = await liftItems.enabledMap()
  const item = items[data.liftKey]
  if (!item) fail('请选择比赛项目')

  const startAt = Number(data.startAt)
  const endAt = Number(data.endAt)
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) fail('请选择起止时间')
  if (endAt <= startAt) fail('结束时间要晚于开始时间')
  if (endAt < Date.now()) fail('结束时间已经过去了')

  const now = Date.now()

  // 修改：只有创建者或前台以上可以改，且已结束的不能改
  if (data._id) {
    const old = (await query('select * from competitions where id = $1', [data._id])).rows[0]
    if (!old) fail('竞赛不存在')
    if (old.created_by !== me._id && !isStaff(me)) fail('只能修改自己发起的竞赛')
    if (statusOf(old) === 'ended') fail('竞赛已经结束了，不能修改')
    await query(
      `update competitions set title = $2, descr = $3, lift_key = $4, lift_name = $5,
         metric = $6, unit = $7, start_at = $8, end_at = $9, prize = $10, rules = $11
       where id = $1`,
      [data._id, title, descr, item.key, item.name, item.metric, item.unit,
        startAt, endAt, prize, rules]
    )
    return view((await query('select * from competitions where id = $1', [data._id])).rows[0])
  }

  const id = newId()
  await query(
    `insert into competitions (id, title, descr, lift_key, lift_name, metric, unit,
       start_at, end_at, prize, rules, status, created_by, created_by_name, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $13, $14)`,
    [id, title, descr, item.key, item.name, item.metric, item.unit,
      startAt, endAt, prize, rules, me._id, memberLabel(me), now]
  )
  return view((await query('select * from competitions where id = $1', [id])).rows[0], { playerCount: 0 })
}

async function setCompetitionStatus({ me, data = {} }) {
  need(me, 'coach')
  const c = (await query('select * from competitions where id = $1', [data.id])).rows[0]
  if (!c) fail('竞赛不存在')
  if (c.created_by !== me._id && !isStaff(me)) fail('只能操作自己发起的竞赛')
  if (!['cancelled', 'ended'].includes(data.status)) fail('未知状态')
  await query('update competitions set status = $2, end_at = $3 where id = $1',
    // 手动结束时把结束时间拉到当前，排名停止变化
    [c.id, data.status, data.status === 'ended' ? Math.min(c.end_at, Date.now()) : c.end_at])
  return view((await query('select * from competitions where id = $1', [c.id])).rows[0])
}

/** 录入一条成绩（教练/店员），可附带视频 */
async function recordCompetitionEntry({ me, data = {} }) {
  need(me, 'coach')
  const c = (await query('select * from competitions where id = $1', [data.id])).rows[0]
  if (!c) fail('竞赛不存在')
  const status = statusOf(c)
  if (status === 'cancelled') fail('竞赛已取消')
  if (status === 'ended') fail('竞赛已经结束了')
  if (status === 'upcoming') fail('竞赛还没开始')

  const target = await getMember(data.openid)
  if (!target) fail('会员不存在')

  const weight = Number(data.weight) || 0
  const reps = Number(data.reps) || 0
  if (!Number.isInteger(reps) || reps < 1 || reps > 200) fail('次数需在 1–200 之间')
  if (c.metric !== 'reps' && weight <= 0) fail('请填写重量')
  if (weight < 0 || weight > 500) fail('重量需在 0–500 之间')

  const value = liftItems.computeValue(c.metric, weight, reps)
  const note = text(data.note, 100, '备注')
  const videoUrl = String(data.videoUrl || '')
  if (videoUrl && !/^https:\/\//.test(videoUrl)) fail('视频地址不正确')

  const id = newId()
  const now = Date.now()
  await query(
    `insert into competition_entries (id, competition_id, openid, member_name, value,
       weight, reps, note, video_url, video_thumb, operator, recorded_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, c.id, target._id, memberLabel(target), value, weight, reps, note,
      videoUrl, String(data.videoThumb || ''), me._id, data.recordedAt ? Number(data.recordedAt) : now, now]
  )

  const entry = (await query('select * from competition_entries where id = $1', [id])).rows[0]
  const ranking = await rankingOf(c.id)
  return {
    entry: entryView(entry),
    myBest: ranking.find(r => r.openid === target._id) || null
  }
}

/** 员工查看某场竞赛的全部成绩（用于管理/删除） */
async function competitionEntries({ me, data = {} }) {
  need(me, 'coach')
  const c = (await query('select * from competitions where id = $1', [data.id])).rows[0]
  if (!c) fail('竞赛不存在')
  const entries = (await query(
    `select * from competition_entries where competition_id = $1 order by value desc, recorded_at asc limit $2`,
    [c.id, MAX_ENTRIES_PER_PAGE]
  )).rows.map(entryView)
  return { competition: view(c), entries }
}

async function deleteCompetitionEntry({ me, data = {} }) {
  need(me, 'coach')
  const e = (await query('select * from competition_entries where id = $1', [data.entryId])).rows[0]
  if (!e) fail('成绩不存在')
  const c = (await query('select * from competitions where id = $1', [e.competition_id])).rows[0]
  if (c && c.created_by !== me._id && !isStaff(me)) fail('只能操作自己发起的竞赛')
  await query('delete from competition_entries where id = $1', [e.id])
  return { ok: true }
}

/** 员工发起的竞赛列表（含已结束，便于回看） */
async function myCompetitions({ me }) {
  need(me, 'coach')
  const rows = (await query(
    `select c.*,
            (select count(distinct openid) from competition_entries e where e.competition_id = c.id) as player_count
       from competitions c
      where $2 = true or c.created_by = $1
      order by c.created_at desc limit 50`,
    [me._id, isStaff(me)]
  )).rows
  return rows.map(c => view(c, { playerCount: Number(c.player_count) || 0 }))
}

module.exports = {
  competitionList,
  competitionDetail,
  saveCompetition,
  setCompetitionStatus,
  recordCompetitionEntry,
  competitionEntries,
  deleteCompetitionEntry,
  myCompetitions,
  // 供内部/测试复用
  statusOf
}
