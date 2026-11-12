// 本地业务流程测试：node test/run.js
const assert = require('assert')
const { store, ctx, sent, unsubscribed } = require('./mock-cloud')
const api = require('../cloudfunctions/api/index')
const templates = require('../cloudfunctions/api/templates')

templates.bookingSuccess.id = 'T_BOOK'
templates.classReminder.id = 'T_CLASS'
templates.cardExpire.id = 'T_CARD'

const HOUR = 3600e3
const DAY = 864e5
let clock = Date.parse('2026-11-02T08:00:00+08:00')
Date.now = () => clock

const ADMIN = 'o_admin'
const BOB = 'o_bob'
const CAROL = 'o_carol'

async function as(openid, action, data) {
  ctx.openid = openid
  return api.main({ action, data })
}
async function timer() {
  ctx.openid = ''
  return api.main({ Type: 'Timer', TriggerName: 'every15min' })
}
async function ok(openid, action, data) {
  const r = await as(openid, action, data)
  assert.strictEqual(r.code, 0, action + ' 应成功，实际：' + JSON.stringify(r))
  return r.data
}
async function bad(openid, action, data, msgPart) {
  const r = await as(openid, action, data)
  assert.notStrictEqual(r.code, 0, action + ' 应失败')
  if (msgPart) assert.ok(r.msg.includes(msgPart), action + ' 错误信息应含「' + msgPart + '」，实际：' + r.msg)
  return r
}

let passed = 0
async function step(name, fn) {
  await fn()
  passed++
  console.log('  ✓ ' + name)
}

;(async () => {
  await step('初始化前首页显示未初始化，未知操作返回 404', async () => {
    const home = await ok(ADMIN, 'home')
    assert.strictEqual(home.initialized, false)
    assert.strictEqual((await as(ADMIN, 'nope')).code, 404)
  })

  await step('定时触发：未初始化时跳过；小程序端伪造 Timer 无效', async () => {
    const r = await timer()
    assert.strictEqual(r.skipped, 'not initialized')
    ctx.openid = BOB
    assert.strictEqual((await api.main({ Type: 'Timer' })).code, 404)
  })

  await step('首个用户初始化成为管理员，重复初始化被拒绝', async () => {
    await ok(ADMIN, 'bootstrap')
    await bad(BOB, 'bootstrap', {}, '已经初始化')
    const home = await ok(ADMIN, 'home')
    assert.strictEqual(home.initialized, true)
    assert.strictEqual(home.me.role, 'admin')
    assert.strictEqual(store.get('schedules').size, 9)
    assert.strictEqual(store.get('venues').size, 4)
  })

  await step('初始化可续做：哨兵丢失后重跑不会重复写入示例数据', async () => {
    const typesBefore = store.get('card_types').size
    const venuesBefore = store.get('venues').size
    const schedulesBefore = store.get('schedules').size
    // 模拟「上次初始化在写哨兵之前中断」：示例数据已写入，但 config/system 不存在
    store.get('config').delete('system')
    await ok(ADMIN, 'bootstrap')
    assert.strictEqual(store.get('card_types').size, typesBefore, '卡种不应重复')
    assert.strictEqual(store.get('venues').size, venuesBefore, '娱乐项目不应重复')
    assert.strictEqual(store.get('schedules').size, schedulesBefore, '课程不应重复')
    assert.ok(store.get('config').get('system'), '哨兵应补上')
    await bad(BOB, 'bootstrap', {}, '已经初始化')
  })

  const types = await ok(ADMIN, 'listCardTypes')
  const timesType = types.find(t => t.kind === 'times')
  const lessonType = types.find(t => t.kind === 'lesson')
  const monthType = types.find(t => t.name === '月卡')

  await step('新会员自动建档；没填手机号、没卡都不能约课', async () => {
    await ok(BOB, 'home')
    const tomorrow = await ok(BOB, 'listSchedules', { date: '2026-11-03' })
    assert.strictEqual(tomorrow.length, 3)
    await bad(BOB, 'bookSchedule', { scheduleId: tomorrow[0]._id }, '手机号')
    await bad(BOB, 'updateProfile', { phone: '123' }, '11 位')
    await ok(BOB, 'updateProfile', { phone: '13800000001', nickName: '小博' })
    await bad(BOB, 'bookSchedule', { scheduleId: tomorrow[0]._id }, '会员卡')
    await bad(BOB, 'entryCode', {}, '会员卡')
  })

  await step('普通会员不能调用员工接口', async () => {
    await bad(BOB, 'verifyEntry', { code: 'x' }, '没有权限')
    await bad(BOB, 'openCard', { openid: BOB, typeId: timesType._id, amount: 1, payMethod: 'cash' }, '没有权限')
  })

  await step('前台办 10 次卡并记录线下收款', async () => {
    await ok(ADMIN, 'openCard', { openid: BOB, typeId: timesType._id, amount: 45000, payMethod: 'wechat_qr', remark: '活动价' })
    const pay = [...store.get('offline_payments').values()][0]
    assert.strictEqual(pay.amount, 45000)
    assert.strictEqual(pay.payMethodName, '微信收款码')
    const cards = await ok(BOB, 'myCards')
    assert.strictEqual(cards.cards[0].remainTimes, 10)
  })

  let code
  await step('入场码核验：当天首次扣 1 次并加 10 积分，再次入场不重复扣', async () => {
    const res = await ok(BOB, 'entryCode')
    assert.ok(res.image.startsWith('data:image/png;base64,'))
    code = Buffer.from(res.image.split(',')[1], 'base64').toString()
    const first = await ok(ADMIN, 'verifyEntry', { code })
    assert.strictEqual(first.remainTimes, 9)
    const second = await ok(ADMIN, 'verifyEntry', { code })
    assert.strictEqual(second.remainTimes, 9)
    assert.ok(second.message.includes('不重复'))
    const pts = await ok(BOB, 'myPoints')
    assert.strictEqual(pts.points, 10)
  })

  await step('伪造或过期的入场码被拒绝', async () => {
    const parts = code.split('.')
    await bad(ADMIN, 'verifyEntry', { code: parts.slice(0, 3).join('.') + '.' + 'f'.repeat(20) }, '无效')
    await bad(ADMIN, 'verifyEntry', { code: ['FE1', CAROL, parts[2], parts[3]].join('.') }, '无效')
    clock += 2 * 60e3
    await bad(ADMIN, 'verifyEntry', { code }, '过期')
  })

  let yoga
  await step('约团课：成功、重复预约被拒、名额计数正确', async () => {
    const list = await ok(BOB, 'listSchedules', { date: '2026-11-03' })
    yoga = list.find(s => s.courseName === '晨间瑜伽')
    const r = await ok(BOB, 'bookSchedule', { scheduleId: yoga._id })
    await bad(BOB, 'bookSchedule', { scheduleId: yoga._id }, '预约过')
    const again = await ok(BOB, 'listSchedules', { date: '2026-11-03' })
    const y = again.find(s => s._id === yoga._id)
    assert.strictEqual(y.booked, 1)
    assert.strictEqual(y.myStatus, 'booked')
    yoga.bookingId = r.bookingId
    const msg = sent.at(-1)
    assert.strictEqual(msg.touser, BOB)
    assert.strictEqual(msg.templateId, 'T_BOOK')
    assert.strictEqual(msg.data.time2.value, '2026-11-03 09:00')
    assert.ok(msg.data.thing1.value.length <= 20)
  })

  await step('会员未授权时发消息失败不影响预约', async () => {
    unsubscribed.add(BOB)
    const venues = await ok(BOB, 'listVenues')
    const climb = venues.find(v => v.name === '攀岩墙')
    const r = await ok(BOB, 'bookVenue', { venueId: climb._id, date: '2026-11-04', hour: 10 })
    await ok(BOB, 'cancelBooking', { bookingId: r.bookingId })
    unsubscribed.delete(BOB)
  })

  await step('名额满了不能再约；取消后名额释放', async () => {
    await ok(ADMIN, 'saveSchedule', {
      _id: yoga._id, courseName: '晨间瑜伽', kind: 'group', coachId: ADMIN,
      startAt: yoga.startAt, duration: 60, capacity: 1, room: '瑜伽室'
    })
    await ok(CAROL, 'updateProfile', { phone: '13800000002', nickName: '卡罗' })
    await ok(ADMIN, 'openCard', { openid: CAROL, typeId: monthType._id, amount: 29900, payMethod: 'cash' })
    await bad(CAROL, 'bookSchedule', { scheduleId: yoga._id }, '名额已满')
    await bad(ADMIN, 'saveSchedule', {
      _id: yoga._id, courseName: '晨间瑜伽', kind: 'group', coachId: ADMIN,
      startAt: yoga.startAt, duration: 60, capacity: 0, room: ''
    }, '人数上限')
    await ok(BOB, 'cancelBooking', { bookingId: yoga.bookingId })
    await ok(CAROL, 'bookSchedule', { scheduleId: yoga._id })
    await bad(BOB, 'bookSchedule', { scheduleId: yoga._id }, '名额已满')
  })

  await step('开课前 2 小时内不能取消', async () => {
    const carolBooking = 'c_' + yoga._id + '_' + CAROL
    clock = yoga.startAt - HOUR
    await bad(CAROL, 'cancelBooking', { bookingId: carolBooking }, '2 小时')
  })

  await step('娱乐项目：单人台球桌同一时段只能约一人，取消后可再约', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const venues = await ok(BOB, 'listVenues')
    const pool = venues.find(v => v.name === '台球桌')
    const b = await ok(BOB, 'bookVenue', { venueId: pool._id, date: '2026-11-03', hour: 15 })
    await bad(CAROL, 'bookVenue', { venueId: pool._id, date: '2026-11-03', hour: 15 }, '约满')
    await bad(CAROL, 'bookVenue', { venueId: pool._id, date: '2026-11-03', hour: 9 }, '营业时段')
    await bad(CAROL, 'bookVenue', { venueId: pool._id, date: '2026-11-20', hour: 15 }, '7 天')
    const slots = await ok(BOB, 'venueSlots', { venueId: pool._id, date: '2026-11-03' })
    const s15 = slots.slots.find(s => s.hour === 15)
    assert.strictEqual(s15.remain, 0)
    assert.strictEqual(s15.myBookingId, b.bookingId)
    await ok(BOB, 'cancelBooking', { bookingId: b.bookingId })
    await ok(CAROL, 'bookVenue', { venueId: pool._id, date: '2026-11-03', hour: 15 })
    await bad(ADMIN, 'useVenueBooking', { bookingId: 'v_' + pool._id + '_2026-11-03_15_' + CAROL }, '今天')
    clock = Date.parse('2026-11-03T14:50:00+08:00')
    await ok(ADMIN, 'useVenueBooking', { bookingId: 'v_' + pool._id + '_2026-11-03_15_' + CAROL })
  })

  await step('教练只能看自己的课；签到加 5 积分', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    await ok(ADMIN, 'setRole', { openid: CAROL, role: 'coach' })
    await bad(ADMIN, 'setRole', { openid: ADMIN, role: 'member' }, '自己')
    await bad(CAROL, 'roster', { scheduleId: yoga._id }, '自己的课程')
    const r = await ok(ADMIN, 'roster', { scheduleId: yoga._id })
    assert.strictEqual(r.bookings.length, 1)
    await bad(ADMIN, 'markAttendance', { bookingId: r.bookings[0]._id, status: 'attended' }, '30 分钟')
    clock = yoga.startAt - 10 * 60e3
    await ok(ADMIN, 'markAttendance', { bookingId: r.bookings[0]._id, status: 'attended' })
    await bad(ADMIN, 'markAttendance', { bookingId: r.bookings[0]._id, status: 'absent' }, '处理过')
    const pts = await ok(CAROL, 'myPoints')
    assert.strictEqual(pts.points, 5)
  })

  await step('私教课：没有课包不能约；上课签到扣课包 1 节', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const p = await ok(ADMIN, 'saveSchedule', {
      courseName: '私教·增肌', kind: 'private', coachId: CAROL,
      startAt: Date.parse('2026-11-04T18:00:00+08:00'), duration: 60, capacity: 9, room: ''
    })
    assert.strictEqual(p.capacity, 1)
    await bad(BOB, 'bookSchedule', { scheduleId: p._id }, '私教课包')
    const card = await ok(ADMIN, 'openCard', { openid: BOB, typeId: lessonType._id, amount: 299000, payMethod: 'pos' })
    const bk = await ok(BOB, 'bookSchedule', { scheduleId: p._id })
    // 预约时只在 pending 上占位，不动 remainTimes
    assert.strictEqual(store.get('member_cards').get(card._id).pending, 1)
    assert.strictEqual(store.get('member_cards').get(card._id).remainTimes, 10)
    const roster = await ok(CAROL, 'roster', { scheduleId: p._id })
    assert.strictEqual(roster.bookings.length, 1)
    clock = p.startAt
    await ok(CAROL, 'markAttendance', { bookingId: bk.bookingId, status: 'attended' })
    assert.strictEqual(store.get('member_cards').get(card._id).remainTimes, 9)
    // 正式消课后占位释放
    assert.strictEqual(store.get('member_cards').get(card._id).pending, 0)
  })

  await step('累计 3 次缺席暂停预约 7 天', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const days = ['2026-11-03', '2026-11-04', '2026-11-05']
    const ids = []
    for (const d of days) {
      const list = await ok(BOB, 'listSchedules', { date: d })
      const spin = list.find(s => s.courseName === '动感单车')
      ids.push((await ok(BOB, 'bookSchedule', { scheduleId: spin._id })).bookingId)
    }
    await bad(ADMIN, 'markAttendance', { bookingId: ids[0], status: 'absent' }, '开课后')
    clock = Date.parse('2026-11-05T23:00:00+08:00')
    for (const id of ids) await ok(ADMIN, 'markAttendance', { bookingId: id, status: 'absent' })
    const list = await ok(BOB, 'listSchedules', { date: '2026-11-06' })
    if (list.length) await bad(BOB, 'bookSchedule', { scheduleId: list[0]._id }, '暂停预约')
    const me = (await ok(BOB, 'home')).me
    assert.ok(me.blockUntil > clock)
  })

  await step('停卡期间不计有效期；次数不能扣成负数', async () => {
    clock = Date.parse('2026-11-10T10:00:00+08:00')
    const detail = await ok(ADMIN, 'memberDetail', { openid: BOB })
    const card = detail.cards.find(c => c.kind === 'times')
    await ok(ADMIN, 'setCardStatus', { cardId: card._id, status: 'paused' })
    await bad(BOB, 'entryCode', {}, '会员卡')
    clock += 10 * DAY
    const resumed = await ok(ADMIN, 'setCardStatus', { cardId: card._id, status: 'active' })
    assert.strictEqual(resumed.expireAt, card.expireAt + 10 * DAY)
    await bad(ADMIN, 'adjustCard', { cardId: card._id, delta: -100, remark: '测试' }, '不足')
    const adj = await ok(ADMIN, 'adjustCard', { cardId: card._id, delta: 2, remark: '赔偿' })
    assert.strictEqual(adj.remainTimes, 11)
    await bad(ADMIN, 'adjustCard', { cardId: card._id, delta: 1 }, '调整原因')
  })

  await step('取消整节课时已有预约一并取消', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const list = await ok(BOB, 'listSchedules', { date: '2026-11-04' })
    const box = list.find(s => s.courseName === '燃脂搏击')
    await ok(ADMIN, 'openCard', { openid: CAROL, typeId: monthType._id, amount: 0, payMethod: 'free' })
    await ok(CAROL, 'bookSchedule', { scheduleId: box._id })
    const res = await ok(ADMIN, 'cancelSchedule', { scheduleId: box._id })
    assert.strictEqual(res.cancelledBookings, 1)
    const after = await ok(CAROL, 'listSchedules', { date: '2026-11-04' })
    assert.ok(!after.find(s => s._id === box._id))
  })

  await step('调整有效期不能缩到开卡之前', async () => {
    const detail = await ok(ADMIN, 'memberDetail', { openid: BOB })
    const card = detail.cards.find(c => c.kind === 'times')
    await bad(ADMIN, 'adjustCard', { cardId: card._id, extendDays: -3650, remark: '测试下限' }, '早于开卡')
  })

  await step('取消整节私教课时释放课包占位', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const card = await ok(ADMIN, 'openCard', { openid: CAROL, typeId: lessonType._id, amount: 0, payMethod: 'free' })
    const p = await ok(ADMIN, 'saveSchedule', {
      courseName: '私教·待取消', kind: 'private', coachId: CAROL,
      startAt: Date.parse('2026-11-06T18:00:00+08:00'), duration: 60, capacity: 1, room: ''
    })
    await ok(CAROL, 'bookSchedule', { scheduleId: p._id })
    assert.strictEqual(store.get('member_cards').get(card._id).pending, 1, '预约后应占位 1')
    const res = await ok(ADMIN, 'cancelSchedule', { scheduleId: p._id })
    assert.strictEqual(res.cancelledBookings, 1)
    assert.strictEqual(store.get('member_cards').get(card._id).pending, 0, '占位应释放')
    assert.strictEqual(store.get('schedules').get(p._id).booked, 0, '计数应自愈为 0')
  })

  await step('员工搜索会员与概况统计', async () => {
    const found = await ok(ADMIN, 'searchMembers', { keyword: '1380000000' })
    assert.strictEqual(found.length, 2)
    const byName = await ok(ADMIN, 'searchMembers', { keyword: '小博' })
    assert.strictEqual(byName[0]._id, BOB)
    const special = await ok(ADMIN, 'searchMembers', { keyword: '(.*' })
    assert.strictEqual(special.length, 0)
    const dash = await ok(ADMIN, 'dashboard')
    assert.strictEqual(dash.members, 3)
    const coachDash = await ok(CAROL, 'dashboard')
    assert.strictEqual(coachDash.members, undefined)
  })

  const DAVE = 'o_dave'
  let daveCard, daveBooking
  await step('定时任务：开课前 2 小时提醒一次，不重复', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    await ok(DAVE, 'updateProfile', { phone: '13800000003', nickName: '大卫' })
    daveCard = await ok(ADMIN, 'openCard', { openid: DAVE, typeId: monthType._id, amount: 29900, payMethod: 'cash' })
    const list = await ok(DAVE, 'listSchedules', { date: '2026-11-03' })
    const spin = list.find(s => s.courseName === '动感单车')
    daveBooking = (await ok(DAVE, 'bookSchedule', { scheduleId: spin._id })).bookingId
    clock = Date.parse('2026-11-03T16:00:00+08:00')
    assert.strictEqual((await timer()).classReminders, 0)
    clock = Date.parse('2026-11-03T17:15:00+08:00')
    assert.strictEqual((await timer()).classReminders, 1)
    assert.strictEqual(sent.at(-1).templateId, 'T_CLASS')
    assert.strictEqual(sent.at(-1).touser, DAVE)
    clock += 15 * 60e3
    assert.strictEqual((await timer()).classReminders, 0)
  })

  await step('定时任务：下课 30 分钟后仍未签到自动记缺席', async () => {
    clock = Date.parse('2026-11-03T20:10:00+08:00')
    assert.strictEqual((await timer()).absent, 0)
    clock = Date.parse('2026-11-03T20:20:00+08:00')
    assert.strictEqual((await timer()).absent, 1)
    assert.strictEqual(store.get('bookings').get(daveBooking).status, 'absent')
    assert.strictEqual(store.get('members').get(DAVE).noShow, 1)
    assert.strictEqual((await timer()).absent, 0)
  })

  await step('定时任务：会员卡到期前 3 天提醒，夜间不发，延期后可再提醒', async () => {
    const expireAt = store.get('member_cards').get(daveCard._id).expireAt
    clock = expireAt - 2 * DAY
    assert.strictEqual(new Date(clock + 8 * HOUR).getUTCHours(), 8)
    assert.strictEqual((await timer()).cardReminders, 0)
    clock += 2 * HOUR
    // 同一时刻开的另外两张月卡也会一起提醒
    assert.strictEqual((await timer()).cardReminders, 3)
    const msg = sent.find(m => m.touser === DAVE && m.templateId === 'T_CARD')
    assert.ok(msg)
    assert.strictEqual(msg.data.thing3.value, '续卡请到前台办理')
    assert.strictEqual((await timer()).cardReminders, 0)
    await ok(ADMIN, 'adjustCard', { cardId: daveCard._id, extendDays: 1, remark: '活动赠送' })
    assert.strictEqual(store.get('member_cards').get(daveCard._id).expireRemindedAt, 0)
    assert.strictEqual((await timer()).cardReminders, 1)
  })

  await step('身体数据：前台录入、自动评分、只能员工录入', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const r = await ok(ADMIN, 'saveBodyRecord', {
      openid: BOB, weight: 80, height: 180, bodyFat: 18, gender: 'male'
    })
    assert.strictEqual(r.bmi, 24.7)
    assert.ok(r.score >= 90 && r.score <= 100, '评分应接近满分，实际 ' + r.score)
    assert.ok(r.detail.length >= 2)
    const mine = await ok(BOB, 'myFitness')
    assert.strictEqual(mine.latestBody.weight, 80)
    assert.strictEqual(mine.bodyHistory.length, 1)
    await bad(BOB, 'saveBodyRecord', { openid: BOB, weight: 80 }, '没有权限')
  })

  await step('力量成绩：1RM 换算与最佳成绩', async () => {
    const s = await ok(ADMIN, 'saveStrength', { openid: BOB, lift: 'bench', weight: 80, reps: 1 })
    assert.strictEqual(s.oneRM, 80)
    assert.strictEqual(s.improved, true)
    assert.ok(s.bodyScore > 0 && s.bodyScore <= 100, '有力量数据后分数应重算')
    // 60kg × 5 次 → Epley 1RM = 70
    const c = await ok(ADMIN, 'saveStrength', { openid: CAROL, lift: 'bench', weight: 60, reps: 5 })
    assert.strictEqual(c.oneRM, 70)
    // 更差的成绩不应覆盖最佳
    const worse = await ok(ADMIN, 'saveStrength', { openid: BOB, lift: 'bench', weight: 60, reps: 1 })
    assert.strictEqual(worse.improved, false)
    assert.strictEqual(worse.best.oneRM, 80)
  })

  await step('排行榜：绝对重量榜 + 相对体重榜，且尊重隐私', async () => {
    const abs = await ok(BOB, 'leaderboard', { lift: 'bench', metric: 'absolute' })
    assert.strictEqual(abs.total, 2)
    assert.strictEqual(abs.top[0].isMe, true)
    assert.strictEqual(abs.top[0].oneRM, 80)
    assert.strictEqual(abs.me.rank, 1)
    // 未公开身体数据时，体重不外泄
    assert.strictEqual(abs.top[0].weight, null)
    assert.strictEqual(abs.top[0].bodyScore, null)
    // 未公开者不进相对体重榜
    const rel0 = await ok(BOB, 'leaderboard', { lift: 'bench', metric: 'relative' })
    assert.strictEqual(rel0.total, 0)
    // 公开后进入相对榜：80 / 80 = 1.0
    await ok(BOB, 'setBodyPublic', { isPublic: true })
    const rel = await ok(BOB, 'leaderboard', { lift: 'bench', metric: 'relative' })
    assert.strictEqual(rel.total, 1)
    assert.strictEqual(rel.top[0].relative, 1)
    const abs2 = await ok(BOB, 'leaderboard', { lift: 'bench', metric: 'absolute' })
    assert.strictEqual(abs2.top[0].weight, 80)
  })

  await step('运动数据：同一天同来源幂等覆盖', async () => {
    const a = await ok(ADMIN, 'saveActivity', { openid: BOB, steps: 8000, type: 'walk' })
    assert.strictEqual(a.steps, 8000)
    assert.strictEqual(a.typeName, '步行')
    await ok(ADMIN, 'saveActivity', { openid: BOB, steps: 12000, duration: 40, calories: 220, type: 'walk' })
    const fit = await ok(BOB, 'myFitness')
    assert.strictEqual(fit.activity.length, 1, '同一天同来源应覆盖而不是新增')
    assert.strictEqual(fit.activity[0].steps, 12000)
    await bad(ADMIN, 'saveActivity', { openid: BOB }, '至少填写')
  })

  await step('分享海报：小程序码只生成一次，短码可反查动态', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    const m = await ok(BOB, 'postMoment', { content: '海报测试', media: [{ fileID: 'cloud://env.bucket/a.jpg', type: 'image' }] })
    const doc = store.get('moments').get(m._id)
    assert.ok(doc.short && doc.short.length >= 6, '应生成短码')

    const p1 = await ok(BOB, 'momentPoster', { id: m._id })
    assert.ok(p1.fileID.startsWith('cloud://'), '应返回云存储 fileID')
    assert.strictEqual(p1.cached, false)
    // 第二次直接命中缓存，不再调微信接口
    const p2 = await ok(BOB, 'momentPoster', { id: m._id })
    assert.strictEqual(p2.fileID, p1.fileID)
    assert.strictEqual(p2.cached, true)

    // 扫码进来用短码反查
    const found = await ok(BOB, 'momentByShort', { short: doc.short })
    assert.strictEqual(found._id, m._id)
    await bad(BOB, 'momentByShort', { short: 'nope' }, '不存在')

    // 清理：这条只是为了测海报，别影响后面友圈列表的条数断言
    await ok(BOB, 'deleteMoment', { id: m._id })
  })

  await step('员工可查看会员完整档案', async () => {
    const all = await ok(ADMIN, 'memberFitness', { openid: BOB })
    assert.strictEqual(all.latestBody.weight, 80)
    assert.strictEqual(all.bodyHistory.length, 1)
    await bad(BOB, 'memberFitness', { openid: CAROL }, '没有权限')
  })

  await step('健身友圈：发文、列表、点赞、删除权限', async () => {
    clock = Date.parse('2026-11-02T08:00:00+08:00')
    await bad(BOB, 'postMoment', { content: '' }, '写点什么')
    const m1 = await ok(BOB, 'postMoment', { content: '今天卧推破了 80kg' })
    assert.strictEqual(m1.type, 'text')
    assert.strictEqual(m1.isMine, true)
    // 云存储 fileID 才收，普通字符串会被过滤掉
    await bad(BOB, 'postMoment', { media: [{ fileID: 'http://x/y.mp4', type: 'video' }] }, '写点什么')
    clock += 60e3
    const m2 = await ok(BOB, 'postMoment', {
      content: '深蹲 100kg',
      media: [{ fileID: 'cloud://env.bucket/demo.mp4', type: 'video', duration: 12 }]
    })
    assert.strictEqual(m2.type, 'video')
    assert.strictEqual(m2.media.length, 1)

    const feed = await ok(CAROL, 'momentList')
    assert.strictEqual(feed.list.length, 2)
    assert.strictEqual(feed.list[0]._id, m2._id, '应按时间倒序')
    assert.strictEqual(feed.list[0].isMine, false)

    const liked = await ok(CAROL, 'likeMoment', { id: m2._id })
    assert.strictEqual(liked.liked, true)
    assert.strictEqual(liked.likeCount, 1)
    const unliked = await ok(CAROL, 'likeMoment', { id: m2._id, like: false })
    assert.strictEqual(unliked.likeCount, 0)

    // 别人不能删；作者可以删
    await bad(CAROL, 'deleteMoment', { id: m1._id }, '只能删除自己的')
    await ok(BOB, 'deleteMoment', { id: m1._id })
    const after = await ok(BOB, 'momentList')
    assert.strictEqual(after.list.length, 1)
    await bad(BOB, 'momentDetail', { id: m1._id }, '不存在或已删除')
  })

  await step('健身友圈：教练可以帮会员代拍', async () => {
    const m = await ok(CAROL, 'postMoment', {
      openid: BOB,
      content: '教练帮拍的训练记录',
      media: [{ fileID: 'cloud://env.bucket/demo2.jpg', type: 'image' }]
    })
    assert.strictEqual(m.openid, BOB)
    assert.strictEqual(m.isMine, false)
    assert.strictEqual(m.coachName, '卡罗', '应记录代拍教练')
    // 普通会员不能指定别人
    const self = await ok(DAVE, 'postMoment', { openid: BOB, content: '想冒名发一条' })
    assert.strictEqual(self.openid, DAVE, '会员指定别人时应退回自己')
  })

  await step('体测设备报告：完整指标录入与历史版本', async () => {
    clock = Date.parse('2026-09-18T09:00:00+08:00')
    const r = await ok(ADMIN, 'saveBodyRecord', {
      openid: DAVE,
      weight: 77, height: 170, gender: 'male', bodyFat: 27.9, heartRate: 144,
      muscle: 52.6, muscleRate: 68.3, protein: 10.8, proteinRate: 14,
      water: 41.1, waterRate: 53.4, boneMass: 2.9, boneRate: 3.8,
      fatMass: 21.5, skeletalMuscle: 30, visceral: 9,
      waistHipRatio: 0.9, bodyAge: 39, skeletalMuscleIndex: 79,
      recommendedCalories: 2275, bmr: 1569, fatFreeMass: 55.5,
      bodyShape: '倒三角型', bodyType: '肥胖', deviceScore: 75,
      deviceName: '米家体成分秤 S800',
      reportImage: 'cloud://env.bucket/report.jpg'
    })
    assert.strictEqual(r.weight, 77)
    assert.strictEqual(r.bmi, 26.6)
    assert.strictEqual(r.bodyAge, 39)
    assert.strictEqual(r.bodyType, '肥胖')
    assert.strictEqual(r.deviceScore, 75)
    assert.strictEqual(r.reportImage, 'cloud://env.bucket/report.jpg')
    assert.ok(r.score > 0, '系统自己的评分也要算出来')

    // 非 cloud:// 的报告图应被丢弃
    clock += 1000
    const r2 = await ok(ADMIN, 'saveBodyRecord', {
      openid: DAVE, weight: 76, reportImage: 'http://evil/x.jpg'
    })
    assert.strictEqual(r2.reportImage, '')
    assert.strictEqual(r2.height, 170, '身高沿用上一次')

    const fit = await ok(DAVE, 'myFitness')
    assert.strictEqual(fit.bodyHistory.length, 2, '应有 2 个历史版本')
    assert.strictEqual(fit.latestBody.weight, 76)
  })

  await step('身体数据趋势：按时间段算变化量', async () => {
    clock = Date.parse('2026-09-18T09:00:00+08:00')
    const t30 = await ok(DAVE, 'bodyTrend', { days: 30 })
    assert.strictEqual(t30.count, 2)
    assert.strictEqual(t30.points.length, 2)
    // 77 -> 76，体重应该是 -1
    assert.strictEqual(t30.delta.weight, -1)
    assert.ok(t30.from)
    // 超出范围的天数会被夹到 365
    const t0 = await ok(DAVE, 'bodyTrend', { days: 9999 })
    assert.strictEqual(t0.days, 365)
    // 员工可以查任意会员
    const byStaff = await ok(ADMIN, 'bodyTrend', { openid: DAVE, days: 30 })
    assert.strictEqual(byStaff.count, 2)
  })

  console.log('\n全部 ' + passed + ' 组场景通过')
})().catch(e => {
  console.error('\n✗ ' + e.message)
  process.exit(1)
})


