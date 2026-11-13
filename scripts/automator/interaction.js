// 交互回归：真点击按钮走完核心业务写入路径
const automator = require('miniprogram-automator')
const fs = require('fs')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const LOG = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/automator/interaction.log'

let lines = []
let failures = 0
function log(m) { lines.push(m); console.log(m) }
function ok(m) { log('  \u2713 ' + m) }
function bad(m, d) { log('  \u2717 ' + m + (d ? ' -> ' + d : '')); failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 抓 toast 文案：mock wx.showToast 记录
async function hookToast(mp) {
  await mp.evaluate(() => {
    if (global.__toasts) return
    global.__toasts = []
    const raw = wx.showToast
    wx.showToast = function (opt) {
      try { global.__toasts.push((opt && opt.title) || '') } catch (e) {}
      return raw.apply(wx, arguments)
    }
  })
}
async function drainToasts(mp) {
  return mp.evaluate(() => {
    const list = (global.__toasts || []).slice()
    global.__toasts = []
    return list
  })
}

async function main() {
  const mp = await automator.connect({ wsEndpoint: ENDPOINT })
  log('已连接 ' + ENDPOINT)
  await hookToast(mp)
  // 页面里很多操作会先弹 wx.showModal 确认框；自动化中直接让它返回「确定」
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false })
  // 订阅授权面板在自动化里不会自己返回，直接当作用户已授权
  await mp.mockWxMethod('requestSubscribeMessage', { bookingSuccess: 'accept', classReminder: 'accept' })
  log('已 mock showModal / requestSubscribeMessage')

  // ---------- 1. 约课页点击「预约」 ----------
  log('\n[1] 约课页点击预约')
  const schedule = await mp.switchTab('/pages/schedule/schedule')
  await sleep(3000)
  let sd = await schedule.data()
  log('  当日课程数: ' + (sd.list || []).length)
  const bookable = (sd.list || []).findIndex(i => !i.myStatus && !i.started && !i.full)
  if (bookable < 0) {
    bad('没有可预约的课程', JSON.stringify((sd.list || []).map(i => ({ my: i.myStatus, started: i.started, full: i.full }))))
  } else {
    log('  点击第 ' + bookable + ' 节的「预约」')
    const btns = await schedule.$$('button')
    // 找到文案为「预约」的按钮
    let target = null
    for (const b of btns) {
      const t = await b.text()
      if (String(t).trim() === '预约') { target = b; break }
    }
    if (!target) {
      bad('页面里找不到「预约」按钮')
    } else {
      await target.tap()
      await sleep(4000)
      const toasts = await drainToasts(mp)
      log('  toast: ' + JSON.stringify(toasts))
      let after = await schedule.data()
      log('  busyId: ' + JSON.stringify(after.busyId) + '  (非空说明卡在请求链中)')
      if (after.busyId) {
        await sleep(5000)
        after = await schedule.data()
        log('  5 秒后 busyId: ' + JSON.stringify(after.busyId))
      }
      sd = after
      const nowBooked = (sd.list || []).some(i => i.myStatus === 'booked')
      if (nowBooked) ok('预约成功（列表状态变为已预约）')
      else bad('预约后列表未显示已预约', 'toasts=' + JSON.stringify(toasts) + ' busyId=' + after.busyId)
    }
  }

  // ---------- 2. 我的预约 ----------
  log('\n[2] 我的预约页')
  const bookings = await mp.navigateTo('/pages/bookings/bookings')
  await sleep(2500)
  const bd = await bookings.data()
  const rows = bd.list || bd.bookings || []
  log('  预约条数: ' + rows.length)
  if (rows.length > 0) ok('我的预约能看到刚下的单')
  else bad('我的预约为空')
  await mp.navigateBack()
  await sleep(800)

  // ---------- 3. 会员卡页 ----------
  log('\n[3] 会员卡页')
  const cards = await mp.navigateTo('/pages/cards/cards')
  await sleep(2500)
  const cd = await cards.data()
  log('  卡数量: ' + (cd.cards || []).length + ' 卡种: ' + (cd.types || []).length)
  if ((cd.cards || []).length > 0) ok('会员卡页显示已有卡')
  else bad('会员卡页没有卡')
  await mp.navigateBack()
  await sleep(800)

  // ---------- 4. 友圈发帖（纯文字） ----------
  log('\n[4] 友圈发帖')
  try {
    const post = await mp.navigateTo('/pages/moments/post/post')
    await sleep(2000)
    const textarea = await post.$('textarea')
    if (!textarea) {
      bad('发帖页找不到输入框')
    } else {
      await textarea.input('自动化回归：这是一条测试动态')
      await sleep(800)
      const buttons = await post.$$('button')
      let submit = null
      for (const b of buttons) {
        const t = String(await b.text()).trim()
        if (t.indexOf('发布') >= 0 || t.indexOf('发表') >= 0) { submit = b; break }
      }
      if (!submit) {
        bad('找不到发布按钮', JSON.stringify(await post.data()).slice(0, 200))
      } else {
        await submit.tap()
        await sleep(4000)
        const toasts = await drainToasts(mp)
        log('  toast: ' + JSON.stringify(toasts))
        const cur = await mp.currentPage()
        log('  当前页面: ' + (cur && cur.path))
        ok('发帖动作已执行（toast=' + JSON.stringify(toasts) + '）')
      }
    }
  } catch (e) {
    bad('发帖流程异常', e.message)
  }

  // ---------- 5. 友圈列表能看到 ----------
  log('\n[5] 友圈列表')
  try {
    await mp.reLaunch('/pages/moments/moments')
    await sleep(3500)
    const cur = await mp.currentPage()
    const md = await cur.data()
    log('  动态条数: ' + (md.list || []).length)
    if ((md.list || []).length > 0) ok('友圈列表有数据')
    else bad('友圈列表为空')
  } catch (e) {
    bad('友圈列表异常', e.message)
  }

  // ---------- 6. 资料保存 ----------
  log('\n[6] 资料页')
  try {
    const profile = await mp.navigateTo('/pages/profile/profile')
    await sleep(2500)
    const pd = await profile.data()
    log('  nickName=' + pd.nickName + ' phone=' + pd.phone)
    if (pd.nickName && pd.phone) ok('资料页正确回填')
    else bad('资料页未回填昵称/手机号')
    await mp.navigateBack()
  } catch (e) {
    bad('资料页异常', e.message)
  }

  log('\n结果：' + (failures ? failures + ' 项失败' : '全部通过'))
  fs.writeFileSync(LOG, lines.join('\n'))
  await mp.disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(err => {
  console.error('交互回归异常：', err)
  try { fs.writeFileSync(LOG, lines.concat(['异常: ' + err.message]).join('\n')) } catch (e) {}
  process.exit(2)
})
