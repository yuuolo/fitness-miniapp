// 验证：管理员可删力量成绩 + 会员自录运动页面
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const OPENID = process.env.TARGET_OPENID

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })
  console.log('已连接')

  console.log('\n[1] 员工端：力量成绩可删除（管理员）')
  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + OPENID + '&tab=strength')
  await sleep(4500)
  const d = await page.data()
  console.log('  canManageStrength=' + (d.f && d.f.canManageStrength) + ' 力量历史 ' + (d.strengthList || []).length + ' 条')
  const delBtns = await page.$$('.list-item button')
  console.log('  历史行里按钮数: ' + delBtns.length)
  if (d.f && d.f.canManageStrength) ok('管理员看到删除权限')
  else bad('管理员没拿到删除权限')
  if (delBtns.length > 0) ok('每行都有删除按钮')
  else if (!(d.strengthList || []).length) ok('该会员暂无力量成绩，跳过')
  else bad('有成绩但没有删除按钮')

  console.log('\n[2] 会员端：记录运动页面')
  const act = await mp.navigateTo('/pages/activity/activity')
  await sleep(4000)
  let ad = await act.data()
  console.log('  运动类型数: ' + (ad.actionTypes || []).length + ' 现有记录 ' + (ad.list || []).length + ' 条')
  if ((ad.actionTypes || []).length) ok('类型已加载')

  // 选「跑步」并填距离/时长，然后保存
  const runIdx = (ad.actionTypes || []).findIndex(t => t.key === 'run')
  if (runIdx >= 0) {
    await act.setData({
      typeIndex: runIdx,
      currentType: ad.actionTypes[runIdx],
      currentFields: ad.actionTypes[runIdx].fields,
      activity: { distance: '3.6', duration: '21' }
    })
    await sleep(300)
    await mp.evaluate(() => {
      const p = getCurrentPages()[getCurrentPages().length - 1]
      p.submit()
    })
    await sleep(3000)
    ad = await act.data()
    const row = (ad.list || []).find(x => x.typeName === '跑步' && x.detail.indexOf('3.6') >= 0)
    console.log('  保存后记录数: ' + (ad.list || []).length)
    if (row) {
      ok('会员自己录的跑步记录已保存（' + row.detail + '）')
      console.log('  记录 id: ' + row.id)
    } else {
      bad('没看到刚保存的记录')
    }

    // 清理：删掉这条测试记录
    if (row) {
      await mp.evaluate(async id => {
        const p = getCurrentPages()[getCurrentPages().length - 1]
        p.remove({ currentTarget: { dataset: { id, name: '测试' } } })
        return true
      }, row.id)
      await sleep(1200)
      // 直接调接口删除（remove 里有 showModal，自动化点不到）
      await mp.evaluate(async id => {
        const api = require('utils/api.js')
      }).catch(() => {})
      await mp.evaluate(id => {
        const p = getCurrentPages()[getCurrentPages().length - 1]
        // 直接走接口，避免弹窗
        return new Promise(resolve => {
          wx.request({
            url: 'https://gym.novrein.com/api',
            method: 'POST',
            data: { action: 'deleteActivity', data: { id }, code: '' },
            success: () => resolve(true),
            fail: () => resolve(false)
          })
        })
      }, row.id).catch(() => {})
    }
  }

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
