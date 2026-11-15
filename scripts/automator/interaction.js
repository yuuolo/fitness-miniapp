// 交互回归：真点击按钮走完核心业务写入路径
// 会先读功能开关，关掉的模块自动跳过（精简模式下没有约课/预约/会员卡）
const automator = require('miniprogram-automator')
const fs = require('fs')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const LOG = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/automator/interaction.log'

let lines = []
let failures = 0
function log(m) { lines.push(m); console.log(m) }
function ok(m) { log('  \u2713 ' + m) }
function skip(m) { log('  - ' + m + '（功能已关闭，跳过）') }
function bad(m, d) { log('  \u2717 ' + m + (d ? ' -> ' + d : '')); failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false })
  await mp.mockWxMethod('requestSubscribeMessage', { bookingSuccess: 'accept', classReminder: 'accept' })
  log('已 mock showModal / requestSubscribeMessage')

  // 先拿功能开关，决定哪些流程要测
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const home = await (await mp.currentPage()).data()
  const feat = home.features || {}
  log('功能开关: ' + JSON.stringify(feat))
  const classesOn = feat.classes !== false
  const venuesOn = feat.venues !== false
  const cardsOn = feat.cards !== false
  const bookingOn = classesOn || venuesOn

  // ---------- 1. 约课页点击「预约」 ----------
  log('\n[1] 约课页点击预约')
  if (!classesOn) {
    skip('团课预约')
  } else {
    const schedule = await mp.switchTab('/pages/schedule/schedule')
    await sleep(3000)
    let sd = await schedule.data()
    log('  当日课程数: ' + (sd.list || []).length)
    const bookable = (sd.list || []).findIndex(i => !i.myStatus && !i.started && !i.full)
    if (bookable < 0) {
      skip('没有可预约的课程（后台还没有排课）')
    } else {
      const btns = await schedule.$$('button')
      let target = null
      for (const b of btns) {
        if (String(await b.text()).trim() === '预约') { target = b; break }
      }
      if (!target) {
        bad('页面里找不到「预约」按钮')
      } else {
        await target.tap()
        await sleep(4000)
        const toasts = await drainToasts(mp)
        log('  toast: ' + JSON.stringify(toasts))
        let after = await schedule.data()
        if (after.busyId) {
          await sleep(5000)
          after = await schedule.data()
        }
        const nowBooked = (after.list || []).some(i => i.myStatus === 'booked')
        if (nowBooked) ok('预约成功（列表状态变为已预约）')
        else bad('预约后列表未显示已预约', 'toasts=' + JSON.stringify(toasts))
      }
    }
  }

  // ---------- 2. 我的预约 ----------
  log('\n[2] 我的预约页')
  if (!bookingOn) {
    skip('我的预约')
  } else {
    const bookings = await mp.navigateTo('/pages/bookings/bookings')
    await sleep(2500)
    const bd = await bookings.data()
    const rows = bd.list || bd.bookings || []
    log('  预约条数: ' + rows.length)
    if (bd.disabled === true) skip('预约页显示「暂未开放」')
    else if (rows.length > 0) ok('我的预约能看到记录')
    else skip('当前没有预约记录')
    await mp.navigateBack()
    await sleep(800)
  }

  // ---------- 3. 会员卡页 ----------
  log('\n[3] 会员卡页')
  if (!cardsOn) {
    skip('会员卡')
  } else {
    const cards = await mp.navigateTo('/pages/cards/cards')
    await sleep(2500)
    const cd = await cards.data()
    log('  卡数量: ' + (cd.cards || []).length + ' 卡种: ' + (cd.types || []).length)
    if (cd.disabled === true) skip('会员卡页显示「暂未开放」')
    else if ((cd.cards || []).length > 0) ok('会员卡页显示已有卡')
    else skip('还没有会员卡（属正常）')
    await mp.navigateBack()
    await sleep(800)
  }

  // ---------- 4. 友圈发帖 ----------
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
        bad('找不到发布按钮')
      } else {
        await submit.tap()
        await sleep(4000)
        const toasts = await drainToasts(mp)
        log('  toast: ' + JSON.stringify(toasts))
        const posted = toasts.some(t => /已发布/.test(t))
        if (posted) ok('发帖成功')
        else bad('发帖没有成功提示', JSON.stringify(toasts))
      }
    }
  } catch (e) {
    bad('发帖流程异常', e.message)
  }

  // ---------- 5. 友圈列表 ----------
  log('\n[5] 友圈列表')
  try {
    await mp.switchTab('/pages/moments/moments')
    await sleep(3500)
    const md = await (await mp.currentPage()).data()
    log('  动态条数: ' + (md.list || []).length)
    if ((md.list || []).length > 0) ok('友圈列表有数据')
    else bad('友圈列表为空')
  } catch (e) {
    bad('友圈列表异常', e.message)
  }

  // ---------- 6. 资料页 ----------
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
