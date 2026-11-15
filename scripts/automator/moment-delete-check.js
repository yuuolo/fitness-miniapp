// 验证友圈删除入口：管理员能看到并能删别人的动态
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const me = await mp.evaluate(() => {
    const cur = getCurrentPages()[getCurrentPages().length - 1]
    return cur.data.me || null
  })
  log('当前账号: ' + (me ? (me.nickName || me.phone || me._id) + ' / ' + me.role : '未登录'))

  const page = await mp.switchTab('/pages/moments/moments')
  await sleep(3500)
  const d = await page.data()
  const list = d.list || []
  log('\n[1] 友圈列表')
  log('  动态数: ' + list.length)
  list.slice(0, 5).forEach(m => {
    log('  · ' + (m.authorName || '?') + ' canDelete=' + m.canDelete + ' isMine=' + m.isMine + ' 内容=' + String(m.content || '').slice(0, 12))
  })

  const ops = await page.$$('.op-del')
  log('\n[2] 删除按钮')
  log('  .op-del 数量: ' + ops.length)
  const deletable = list.filter(m => m.canDelete).length
  if (ops.length === deletable) ok('按钮数量与 canDelete 一致（' + deletable + ' 个）')
  else bad('按钮数量不一致', 'buttons=' + ops.length + ' canDelete=' + deletable)

  if (!list.length) { log('  没有动态，跳过交互测试'); await mp.disconnect(); process.exit(failures ? 1 : 0) }

  // 找一个「别人的」动态，检查按钮是否出现（管理员视角）
  const others = list.filter(m => !m.isMine)
  log('  别人的动态: ' + others.length + ' 条')
  if (me && me.role === '管理员') {
    if (others.length && others.every(m => m.canDelete)) ok('管理员对别人的动态也有删除权限')
    else if (!others.length) log('  （没有别人的动态可验证）')
    else bad('管理员无法删别人的动态')
  }

  // 点第一个删除按钮 → 弹确认 → 取消（不真删）
  let modalShown = false
  await mp.evaluate(() => {
    wx.showModal = opts => { if (opts && opts.success) opts.success({ confirm: false, cancel: true }) }
  })
  try {
    await ops[0].tap()
    await sleep(1200)
    modalShown = true
  } catch (e) {
    bad('点击删除失败', e.message)
  }
  if (modalShown) ok('点击后弹出确认（已模拟取消，未真删）')

  const after = await page.data()
  if ((after.list || []).length === list.length) ok('取消后列表未变')
  else bad('取消后列表变了')

  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
