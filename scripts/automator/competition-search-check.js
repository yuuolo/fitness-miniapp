// 验证竞赛录入页的会员搜索已与其他页面一致
const fs = require('fs')
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const CID = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/competition-id.txt', 'utf8').trim()

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  const page = await mp.navigateTo('/pages/staff/competition-entry/competition-entry?id=' + CID)
  await sleep(3500)
  let d = await page.data()
  console.log('  memberLoading=' + d.memberLoading + '，默认会员 ' + (d.members || []).length + ' 条，memberEmpty=' + d.memberEmpty)
  if ((d.members || []).length > 0) ok('进页面就有默认会员列表（不用先搜）')
  else bad('默认列表为空')

  const inputs = await page.$$('input')
  console.log('  输入框数: ' + inputs.length)
  if (inputs.length) {
    await inputs[0].input('小')
    await sleep(1000)
    d = await page.data()
    const names = (d.members || []).map(x => x.nickName || x.phone)
    console.log('  输入「小」→ ' + names.length + ' 条: ' + names.join('、'))
    if (d.keyword === '小') ok('竞赛页也是输入即搜（不用点搜索）')
    else bad('keyword 没更新', d.keyword)

    // 点选
    const rows = await page.$$('.list-item')
    if (rows.length) {
      await rows[0].tap()
      await sleep(700)
      d = await page.data()
      console.log('  点选后 picked=' + JSON.stringify(d.picked && (d.picked.nickName || d.picked.phone)))
      if (d.picked) ok('可以点选会员')
    }
  }

  console.log('  报错: ' + (errs.length ? errs.join(' | ') : '无'))
  if (!errs.length) ok('无 JS 报错')

  await mp.navigateBack()
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
