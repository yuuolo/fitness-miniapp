// 验证「教练」身份下的会员资料录入流程
// 前置：把店长账号临时改成 coach（脚本外通过 psql 改），跑完再改回 admin
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
  await sleep(4000)

  // ---------- 1. 员工工作台：教练应看到「会员资料与体测」 ----------
  log('\n[1] 员工工作台（教练视角）')
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const sd = await staff.data()
  log('  role=' + sd.role + ' isStaff=' + sd.isStaff + ' isCoach=' + sd.isCoach)
  if (sd.isCoach === true) ok('教练被识别为可录入数据的人员')
  else bad('教练没有被识别（isCoach 应为 true）')

  const wxml = await staff.$$('.list-item')
  let labels = []
  for (const el of wxml) {
    try { labels.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(labels))
  // 前台/管理员看到「会员与办卡」，纯教练看到「会员资料与体测」
  const expectLabel = sd.isStaff ? '会员与办卡' : '会员资料与体测'
  const hasEntry = labels.some(t => t.indexOf(expectLabel) >= 0)
  if (hasEntry) ok('能看到会员入口（' + expectLabel + '）')
  else bad('看不到会员入口，期望「' + expectLabel + '」', JSON.stringify(labels))

  // ---------- 2. 搜索会员 ----------
  log('\n[2] 搜索会员')
  const members = await mp.navigateTo('/pages/staff/members/members?manage=0&admin=0')
  await sleep(3000)
  const md = await members.data()
  log('  默认列表条数: ' + (md.list || []).length)
  if (!md.error && (md.list || []).length >= 0) ok('搜索页正常打开（不再提示没权限）')
  else bad('搜索页异常', JSON.stringify(md).slice(0, 200))

  // 输入关键字再搜一次
  const input = await members.$('input')
  if (input) {
    await input.input('店长')
    await sleep(500)
    const btns = await members.$$('button')
    if (btns.length) {
      await btns[0].tap()
      await sleep(2500)
      const after = await members.data()
      log('  搜索「店长」结果: ' + (after.list || []).length + ' 条')
      if ((after.list || []).length > 0) ok('教练可以搜索到会员')
      else bad('搜索没有结果')
    }
  }

  // ---------- 3. 打开会员详情 ----------
  log('\n[3] 会员详情（教练视角）')
  const list = (await members.data()).list || []
  if (!list.length) {
    bad('没有会员可打开，跳过详情检查')
  } else {
    const detail = await mp.navigateTo('/pages/staff/member/member?id=' + list[0]._id + '&manage=0&admin=0')
    await sleep(3500)
    const dd = await detail.data()
    log('  会员: ' + ((dd.member && (dd.member.nickName || dd.member.phone)) || '?') + ' | manage=' + dd.manage)
    if (!dd.manage) ok('教练视角下不显示办卡/调次等前台功能')
    else bad('教练不该有办理会员卡的权限')

    const buttons = await detail.$$('button')
    let texts = []
    for (const b of buttons) { try { texts.push(String(await b.text()).trim()) } catch (e) {} }
    log('  按钮: ' + JSON.stringify(texts))

    const ddAll = await detail.data()
    const canEditProfile = texts.some(t => t.indexOf('代填') >= 0) || ddAll.editingProfile === true
    if (ddAll.manage === false) {
      if (!canEditProfile) ok('教练没有「代填/修改资料」入口（不能改别人昵称/手机号/头像）')
      else bad('教练不该有修改资料的入口')
    } else {
      log('  当前是前台/管理员视角（manage=true），跳过教练专属断言')
    }

    // 录入数据入口
    if (texts.length) {
      const fitItem = await detail.$$('.list-item')
      let hasFitness = false
      for (const it of fitItem) {
        if (String(await it.text()).indexOf('身体数据') >= 0) { hasFitness = true; break }
      }
      if (hasFitness) ok('教练能看到「身体数据与力量成绩」录入入口')
      else bad('没有体测录入入口')
    }
    await mp.navigateBack()
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('教练流程验证异常：', e.message)
  process.exit(2)
})
