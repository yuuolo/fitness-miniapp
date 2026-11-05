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
    const roster = await ok(CAROL, 'roster', { scheduleId: p._id })
    assert.strictEqual(roster.bookings.length, 1)
    clock = p.startAt
    await ok(CAROL, 'markAttendance', { bookingId: bk.bookingId, status: 'attended' })
    assert.strictEqual(store.get('member_cards').get(card._id).remainTimes, 9)
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

  console.log('\n全部 ' + passed + ' 组场景通过')
})().catch(e => {
  console.error('\n✗ ' + e.message)
  process.exit(1)
})
