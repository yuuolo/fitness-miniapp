// 自建后端集成测试：直连 PostgreSQL，逐条验证迁移后的业务规则。
// 用法：DATABASE_URL=postgres://postgres:pw@db:5432/gym_test node test/run.js
// 会清空目标库的所有业务表，请只对测试库执行。
const assert = require('assert')
const crypto = require('crypto')
const { query, pool, ensureSchema } = require('../lib/db')
const { memberRow, cnDate, dayStart, DAY, HOUR, MIN } = require('../lib/common')

const modules = {}
for (const name of ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment']) {
  Object.assign(modules, require('../lib/' + name))
}
const { runCron } = require('../lib/cron')

const TABLES = [
  'config', 'members', 'card_types', 'member_cards', 'card_logs', 'offline_payments',
  'schedules', 'bookings', 'venues', 'venue_slots', 'entry_logs', 'points_logs',
  'body_records', 'strength_records', 'activity_records', 'moments', 'media',
  'competitions', 'competition_entries'
]

let passed = 0
function ok(name) {
  passed++
  console.log('  \u2713 ' + name)
}

async function act(action, openid, data) {
  const me = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  return modules[action]({ openid, me, data: data || {} })
}

async function expectFail(fn, contains, name) {
  let err = null
  try {
    await fn()
  } catch (e) {
    err = e
  }
  assert.ok(err, name + ' 应该失败但成功了')
  if (contains) assert.ok(err.message.indexOf(contains) >= 0, name + ' 错误文案不符：' + err.message)
  ok(name)
}

async function ensureMember(openid) {
  await query(
    'insert into members (openid, created_at) values ($1, $2) on conflict (openid) do nothing',
    [openid, Date.now()]
  )
}

async function insertSchedule(fields) {
  const id = 'sch_' + Math.random().toString(36).slice(2, 10)
  await query(
    `insert into schedules (id, course_name, kind, coach_id, coach_name, start_at, duration,
       capacity, booked, room, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)`,
    [id, fields.courseName || '测试课', fields.kind || 'group', fields.coachId || 'coach1',
      fields.coachName || '教练一号', fields.startAt, fields.duration || 60,
      fields.capacity === undefined ? 10 : fields.capacity, fields.booked || 0,
      fields.room || '测试房', Date.now()]
  )
  return id
}

async function cardOf(openid, kind) {
  return (await query(
    'select * from member_cards where openid = $1 and kind = $2 order by created_at desc limit 1',
    [openid, kind]
  )).rows[0]
}

// 直接按后端签名规则构造入场码（小程序只拿二维码图片，测试需要原始字符串）
async function buildEntryCode(openid, ts) {
  const secret = (await query("select value from config where key = 'secret'")).rows[0].value.value
  const at = ts || Date.now()
  const sig = crypto.createHmac('sha256', secret).update(openid + '.' + at).digest('hex').slice(0, 20)
  return ['FE1', openid, at, sig].join('.')
}

async function main() {
  await ensureSchema()
  await query('truncate ' + TABLES.join(', ') + ' restart identity cascade')
  console.log('表已清空，开始测试\n')

  const ADMIN = 'openid-admin'
  const STAFF = 'openid-staff'
  const COACH = 'openid-coach'
  const MEMBER = 'openid-member'
  for (const id of [ADMIN, STAFF, COACH, MEMBER]) await ensureMember(id)

  // ---------- 系统初始化 ----------
  assert.deepStrictEqual(await act('systemStatus', MEMBER), { initialized: false })
  ok('初始化前 systemStatus 为 false')

  await act('bootstrap', ADMIN)
  assert.deepStrictEqual(await act('systemStatus', MEMBER), { initialized: true })
  const adminMe = memberRow((await query('select * from members where openid = $1', [ADMIN])).rows[0])
  assert.strictEqual(adminMe.role, 'admin')
  ok('首个初始化者成为管理员')

  await expectFail(() => act('bootstrap', MEMBER), '已经初始化', '重复初始化被拒绝')
  assert.strictEqual((await query('select count(*)::int as n from card_types')).rows[0].n, 4)
  assert.strictEqual((await query('select count(*)::int as n from venues')).rows[0].n, 4)
  assert.strictEqual((await query('select count(*)::int as n from schedules')).rows[0].n, 9)
  ok('示例卡种 / 娱乐项目 / 三天团课已写入')

  // ---------- 资料与权限 ----------
  await expectFail(() => act('updateProfile', MEMBER, { phone: '123' }), '11 位手机号', '手机号格式校验')
  await act('updateProfile', MEMBER, { nickName: '小明', phone: '13800001111' })
  const homeView = await act('home', MEMBER)
  assert.strictEqual(homeView.me.profileReady, true)
  ok('会员可更新资料，home 返回 profileReady')

  await act('updateProfile', COACH, { nickName: '教练一号', phone: '13800002222' })
  await act('updateProfile', STAFF, { nickName: '前台小美', phone: '13800003333' })
  await act('setRole', ADMIN, { openid: COACH, role: 'coach' })
  await act('setRole', ADMIN, { openid: STAFF, role: 'staff' })
  ok('管理员设置教练 / 前台角色')

  await expectFail(() => act('setRole', ADMIN, { openid: ADMIN, role: 'member' }), '自己的角色', '不能改自己的角色')
  await expectFail(() => act('dashboard', MEMBER), '没有权限', '普通会员不能用员工接口')

  // ---------- 办卡 ----------
  const types = (await query('select * from card_types')).rows
  const timesType = types.find(t => t.kind === 'times')
  const lessonType = types.find(t => t.kind === 'lesson')

  await expectFail(
    () => act('openCard', STAFF, { openid: MEMBER, typeId: timesType.id, amount: 49900, payMethod: 'xxx' }),
    '收款方式', '办卡必须选择收款方式'
  )
  const card = await act('openCard', STAFF, {
    openid: MEMBER, typeId: timesType.id, amount: 49900, payMethod: 'cash', remark: ''
  })
  assert.strictEqual(card.remainTimes, 10)
  assert.strictEqual(card.totalTimes, 10)
  const payments = (await query('select * from offline_payments')).rows
  assert.strictEqual(payments.length, 1)
  assert.strictEqual(payments[0].amount, 49900)
  ok('前台办 10 次卡并记录线下收款')

  // ---------- 入场码 ----------
  const qr = await act('entryCode', MEMBER)
  assert.ok(qr.image.indexOf('data:image/') === 0)
  assert.strictEqual(qr.remainTimes, 10)
  ok('会员生成入场二维码')

  await expectFail(() => act('verifyEntry', MEMBER, { code: 'FE1.x.1.y' }), '没有权限', '会员不能核验入场码')
  await expectFail(() => act('verifyEntry', STAFF, { code: 'FE1.fake.123.abc' }), '入场码无效', '伪造入场码被拒绝')

  const first = await act('verifyEntry', STAFF, { code: await buildEntryCode(MEMBER) })
  assert.strictEqual(first.message, '已扣 1 次')
  assert.strictEqual(first.remainTimes, 9)
  let memberNow = memberRow((await query('select * from members where openid = $1', [MEMBER])).rows[0])
  assert.strictEqual(memberNow.points, 10)
  ok('当天首次入场扣 1 次并加 10 积分')

  const second = await act('verifyEntry', STAFF, { code: await buildEntryCode(MEMBER) })
  assert.strictEqual(second.message, '今日已入场，不重复扣次')
  assert.strictEqual((await cardOf(MEMBER, 'times')).remain_times, 9)
  ok('当天再次入场不重复扣次')

  const staleCode = await buildEntryCode(MEMBER, Date.now() - 5 * MIN)
  await expectFail(
    () => act('verifyEntry', STAFF, { code: staleCode }),
    '已过期', '过期入场码被拒绝'
  )

  // ---------- 约团课 ----------
  const startAt = Date.now() + 5 * HOUR
  const scheduleId = await insertSchedule({ coachId: COACH, startAt, capacity: 2 })

  const listed = await act('listSchedules', MEMBER, { date: cnDate(startAt) })
  assert.ok(listed.some(s => s._id === scheduleId))
  ok('按日期列出课程')

  const booked = await act('bookSchedule', MEMBER, { scheduleId })
  assert.strictEqual(booked.bookingId, 'c_' + scheduleId + '_' + MEMBER)
  assert.strictEqual((await query('select booked from schedules where id = $1', [scheduleId])).rows[0].booked, 1)
  ok('约团课成功并占名额')

  await expectFail(() => act('bookSchedule', MEMBER, { scheduleId }), '已经预约过', '同一节课不能重复预约')

  // 名额满
  const OTHER = 'openid-other'
  await ensureMember(OTHER)
  await act('updateProfile', OTHER, { nickName: '小红', phone: '13800004444' })
  await act('openCard', STAFF, { openid: OTHER, typeId: timesType.id, amount: 49900, payMethod: 'cash' })
  await act('bookSchedule', OTHER, { scheduleId })
  const THIRD = 'openid-third'
  await ensureMember(THIRD)
  await act('updateProfile', THIRD, { nickName: '小刚', phone: '13800005555' })
  await act('openCard', STAFF, { openid: THIRD, typeId: timesType.id, amount: 49900, payMethod: 'cash' })
  await expectFail(() => act('bookSchedule', THIRD, { scheduleId }), '名额已满', '名额满了不能再约')

  await act('cancelBooking', MEMBER, { bookingId: booked.bookingId })
  assert.strictEqual((await query('select booked from schedules where id = $1', [scheduleId])).rows[0].booked, 1)
  await act('bookSchedule', THIRD, { scheduleId })
  ok('取消后名额释放，别人可以约')

  // 开课前 2 小时内不能取消
  const soonId = await insertSchedule({ coachId: COACH, startAt: Date.now() + 1 * HOUR, capacity: 5 })
  const soonBooking = await act('bookSchedule', MEMBER, { scheduleId: soonId })
  await expectFail(
    () => act('cancelBooking', MEMBER, { bookingId: soonBooking.bookingId }),
    '2 小时内', '开课前 2 小时内不能取消'
  )

  // ---------- 私教课 ----------
  const privateId = await insertSchedule({
    kind: 'private', coachId: COACH, startAt: Date.now() + 20 * MIN, capacity: 1
  })
  await expectFail(() => act('bookSchedule', MEMBER, { scheduleId: privateId }), '私教课包', '没有私教课包不能约私教')

  await act('openCard', STAFF, { openid: MEMBER, typeId: lessonType.id, amount: 299000, payMethod: 'pos' })
  const privateBooking = await act('bookSchedule', MEMBER, { scheduleId: privateId })
  assert.strictEqual((await cardOf(MEMBER, 'lesson')).pending, 1)
  ok('约私教课在课包上占位 pending=1')

  const pointsBefore = memberRow((await query('select * from members where openid = $1', [MEMBER])).rows[0]).points
  await act('markAttendance', COACH, { bookingId: privateBooking.bookingId, status: 'attended' })
  const lessonAfter = await cardOf(MEMBER, 'lesson')
  assert.strictEqual(lessonAfter.remain_times, 9)
  assert.strictEqual(lessonAfter.pending, 0)
  memberNow = memberRow((await query('select * from members where openid = $1', [MEMBER])).rows[0])
  assert.strictEqual(memberNow.points, pointsBefore + 5)
  ok('私教签到扣课包 1 节、释放占位并加 5 积分')

  const otherId = await insertSchedule({ coachId: 'someone-else', startAt: Date.now() + 3 * HOUR })
  await expectFail(() => act('roster', COACH, { scheduleId: otherId }), '自己的课程', '教练只能看自己的课')

  // ---------- 娱乐项目 ----------
  const venue = (await query('select * from venues where capacity = 1 and on_sale = true limit 1')).rows[0]
  const vdate = cnDate(Date.now() + DAY)
  const hour = venue.open_hour + 1
  await act('bookVenue', MEMBER, { venueId: venue.id, date: vdate, hour })
  await expectFail(
    () => act('bookVenue', OTHER, { venueId: venue.id, date: vdate, hour }),
    '已约满', '单人项目同一时段只能约一人'
  )
  const vb = await act('venueBookings', STAFF, { date: vdate })
  assert.strictEqual(vb.length, 1)
  ok('娱乐项目预约 + 时段名额限制')

  // ---------- 停卡与调次 ----------
  const periodType = types.find(t => t.kind === 'period')
  const periodCard = await act('openCard', STAFF, {
    openid: OTHER, typeId: periodType.id, amount: 29900, payMethod: 'cash'
  })
  await expectFail(
    () => act('adjustCard', STAFF, { cardId: periodCard._id, delta: 1, remark: '测试' }),
    '期限卡没有次数', '期限卡不能调次'
  )
  await act('setCardStatus', STAFF, { cardId: periodCard._id, status: 'paused' })
  const beforePause = (await query('select * from member_cards where id = $1', [periodCard._id])).rows[0]
  await query('update member_cards set paused_at = $2 where id = $1', [periodCard._id, Date.now() - 2 * DAY])
  await act('setCardStatus', STAFF, { cardId: periodCard._id, status: 'active' })
  const resumed = (await query('select * from member_cards where id = $1', [periodCard._id])).rows[0]
  assert.ok(resumed.expire_at - beforePause.expire_at >= 2 * DAY - 5e3)
  ok('停卡期间不计有效期，恢复时顺延')

  await expectFail(
    () => act('adjustCard', STAFF, { cardId: card._id, delta: -100, remark: '扣爆' }),
    '剩余次数不足', '次数不能扣成负数'
  )
  await act('adjustCard', STAFF, { cardId: card._id, delta: 2, remark: '补次数' })
  // 开卡 10 次 → 入场扣 1 次 → 补 2 次 = 11
  assert.strictEqual((await cardOf(MEMBER, 'times')).remain_times, 11)
  ok('调整次数 +2 生效')

  // ---------- 取消整节课 ----------
  const groupId = await insertSchedule({ coachId: COACH, startAt: Date.now() + 6 * HOUR, capacity: 5 })
  await act('bookSchedule', MEMBER, { scheduleId: groupId })
  await act('bookSchedule', OTHER, { scheduleId: groupId })
  const cancelled = await act('cancelSchedule', STAFF, { scheduleId: groupId })
  assert.strictEqual(cancelled.cancelledBookings, 2)
  assert.strictEqual((await query(
    "select count(*)::int as n from bookings where schedule_id = $1 and status = 'booked'", [groupId]
  )).rows[0].n, 0)
  assert.strictEqual((await query('select booked from schedules where id = $1', [groupId])).rows[0].booked, 0)
  ok('取消整节课时已有预约一并取消')

  // ---------- 缺席限制 ----------
  const NO_SHOW = 'openid-noshow'
  await ensureMember(NO_SHOW)
  await act('updateProfile', NO_SHOW, { nickName: '缺席王', phone: '13800006666' })
  await act('openCard', STAFF, { openid: NO_SHOW, typeId: timesType.id, amount: 49900, payMethod: 'cash' })
  for (let i = 0; i < 3; i++) {
    const id = await insertSchedule({ coachId: COACH, startAt: Date.now() + (i + 2) * HOUR, capacity: 5 })
    const bk = await act('bookSchedule', NO_SHOW, { scheduleId: id })
    const now = Date.now()
    await query('update bookings set start_at = $2, end_at = $3 where id = $1',
      [bk.bookingId, now - 2 * HOUR, now - 1 * HOUR])
    await act('markAttendance', COACH, { bookingId: bk.bookingId, status: 'absent' })
  }
  const blocked = memberRow((await query('select * from members where openid = $1', [NO_SHOW])).rows[0])
  assert.ok(blocked.blockUntil > Date.now())
  assert.strictEqual(blocked.noShow, 0)
  const futureId = await insertSchedule({ startAt: Date.now() + 4 * HOUR })
  await expectFail(
    () => act('bookSchedule', NO_SHOW, { scheduleId: futureId }), '暂停预约', '累计 3 次缺席暂停预约 7 天'
  )

  // ---------- 员工台 ----------
  const byPhone = await act('searchMembers', STAFF, { keyword: '13800001111' })
  assert.ok(byPhone.some(m => m._id === MEMBER))
  const byName = await act('searchMembers', STAFF, { keyword: '小明' })
  assert.ok(byName.some(m => m._id === MEMBER))
  const detail = await act('memberDetail', STAFF, { openid: MEMBER })
  assert.ok(detail.cards.length >= 2)
  assert.ok(detail.entries.length >= 1)
  const dash = await act('dashboard', STAFF)
  assert.ok(dash.members >= 4)
  ok('员工搜索会员、会员详情与工作台统计')

  const coaches = await act('listCoaches', STAFF)
  assert.ok(coaches.some(c => c._id === COACH && c.role === 'coach'))
  ok('列出可选教练')

  // ---------- 健身数据 ----------
  await expectFail(
    () => act('saveBodyRecord', MEMBER, { openid: MEMBER, weight: 70 }),
    '没有权限', '员工才能录入身体数据'
  )
  const body = await act('saveBodyRecord', STAFF, {
    openid: MEMBER, weight: 72.5, height: 175, bodyFat: 18, muscle: 55, visceral: 8, deviceName: 'S800'
  })
  assert.strictEqual(body.bmi, 23.7)
  assert.ok(body.score > 0)
  ok('录入身体数据并算 BMI / 评分')

  const strength = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 100, reps: 5 })
  assert.strictEqual(strength.oneRM, 116.7)
  assert.strictEqual(strength.improved, true)
  const squat = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 140, reps: 3 })
  assert.strictEqual(squat.oneRM, 154)
  const mine = await act('myFitness', MEMBER)
  assert.strictEqual(mine.sbdTotal, 270.7)
  assert.strictEqual(mine.latestBody.weight, 72.5)
  ok('力量成绩 Epley 估算 + SBD 合计')

  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 8000, duration: 45, calories: 400 })
  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 9000, duration: 50, calories: 450 })
  const acts = (await query('select * from activity_records where openid = $1', [MEMBER])).rows
  assert.strictEqual(acts.length, 1)
  assert.strictEqual(acts[0].steps, 9000)
  ok('运动数据同一天同来源幂等覆盖')

  const trend = await act('bodyTrend', MEMBER, { days: 30 })
  assert.strictEqual(trend.count, 1)
  ok('身体数据趋势返回一段时间的点')

  const boardBefore = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardBefore.total, 0)
  await act('setBodyPublic', MEMBER, { isPublic: true })
  const boardAfter = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardAfter.total, 1)
  assert.strictEqual(boardAfter.me.isMe, true)
  ok('相对体重榜只收自愿公开体重的会员')

  await act('setBodyPublic', MEMBER, { isPublic: false })
  const staffView = await act('memberFitness', STAFF, { openid: MEMBER })
  assert.strictEqual(staffView.latestBody.weight, null)
  assert.ok(staffView.latestBody.score > 0)
  ok('未公开身体数据时只暴露评分')

  // ---------- 健身友圈 ----------
  await expectFail(() => act('postMoment', MEMBER, { content: '' }), '写点什么', '空动态被拒绝')
  const moment1 = await act('postMoment', MEMBER, { content: '今天卧推 PR', media: [] })
  assert.strictEqual(moment1.type, 'text')
  assert.strictEqual(moment1.authorName, '小明')
  ok('会员发动态')

  const byCoach = await act('postMoment', COACH, { openid: MEMBER, content: '教练代拍' })
  assert.strictEqual(byCoach.authorName, '小明')
  assert.strictEqual(byCoach.coachName, '教练一号')
  ok('教练可以帮会员代拍')

  const list = await act('momentList', MEMBER, {})
  assert.ok(list.list.length >= 2)
  assert.strictEqual(list.list[0].isMine, true)
  ok('友圈列表按时间倒序')

  assert.deepStrictEqual(await act('likeMoment', OTHER, { id: moment1._id }), { liked: true, likeCount: 1 })
  assert.deepStrictEqual(await act('likeMoment', OTHER, { id: moment1._id }), { liked: false, likeCount: 0 })
  ok('点赞与取消点赞')

  await expectFail(() => act('deleteMoment', OTHER, { id: moment1._id }), '只能删除自己', '不能删别人的动态')
  await act('deleteMoment', MEMBER, { id: moment1._id })
  await expectFail(() => act('momentDetail', MEMBER, { id: moment1._id }), '不存在', '删除后详情不可见')

  const coachShort = (await query('select short from moments where id = $1', [byCoach._id])).rows[0].short
  const byShort = await act('momentByShort', MEMBER, { short: coachShort })
  assert.strictEqual(byShort._id, byCoach._id)
  await act('setPosterQr', STAFF, { fileID: 'https://gym.novrein.com/static/qr.jpg' })
  assert.strictEqual(
    (await query("select value from config where key = 'posterQr'")).rows[0].value.fileID,
    'https://gym.novrein.com/static/qr.jpg'
  )
  ok('短码反查动态 + 静态小程序码兜底配置')

  // ---------- 定时任务 ----------
  const cronSched = await insertSchedule({ coachId: COACH, startAt: Date.now() + 1 * HOUR, capacity: 5 })
  const cronBooking = await act('bookSchedule', OTHER, { scheduleId: cronSched })
  const pastStart = Date.now() - 2 * HOUR
  await query('update bookings set start_at = $2, end_at = $3 where id = $1',
    [cronBooking.bookingId, pastStart, pastStart + HOUR])

  // 明天 15:00（北京时间）当作「现在」：下课时间已过，且不在夜间静默时段
  const cronNow = dayStart(cnDate(Date.now() + DAY)) + 15 * HOUR
  await query(
    'update member_cards set expire_at = $2, expire_reminded_at = 0 where id = $1',
    [card._id, cronNow + DAY]
  )

  const cronResult = await runCron(cronNow)
  assert.ok(cronResult.absent >= 1, '应记为缺席：' + JSON.stringify(cronResult))
  assert.strictEqual(
    (await query('select status from bookings where id = $1', [cronBooking.bookingId])).rows[0].status,
    'absent'
  )
  ok('定时任务：下课 30 分钟后仍未签到自动记缺席')

  assert.strictEqual(
    (await query('select expire_reminded_at from member_cards where id = $1', [card._id])).rows[0].expire_reminded_at,
    cronNow
  )
  ok('定时任务：到期提醒先占位，不重复发送')

  await query('update member_cards set expire_reminded_at = 0 where id = $1', [card._id])
  const night = dayStart(cnDate(Date.now() + DAY)) + 2 * HOUR
  assert.strictEqual((await runCron(night)).cardReminders, 0)
  ok('定时任务：夜间不发到期提醒')

  console.log('\n全部 ' + passed + ' 项断言通过')
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
