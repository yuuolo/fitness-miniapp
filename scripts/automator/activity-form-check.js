// 验证运动数据表单：类型切换时字段联动 + 必填校验
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const MEMBER = process.env.MEMBER_OPENID || ''

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + MEMBER + '&name=test')
  await sleep(4000)

  let d = await page.data()
  console.log('\n[1] 初始类型')
  console.log('  类型数: ' + (d.actionTypes || []).length)
  console.log('  当前类型: ' + (d.currentType && d.currentType.name))
  console.log('  字段: ' + JSON.stringify((d.currentFields || []).map(f => f.label + '(' + f.unit + ')')))
  if ((d.actionTypes || []).length === 7) ok('7 种运动类型都从服务端下发')
  else bad('类型数量不对', (d.actionTypes || []).length)
  if ((d.currentFields || []).length) ok('初始就有字段')
  else bad('初始没有字段')

  console.log('\n[2] 逐个类型看字段')
  const want = {
    walk: ['步数', '距离', '时长'],
    run: ['距离', '时长', '步数'],
    cycling: ['距离', '时长', '消耗', '平均心率'],
    swim: ['距离', '时长'],
    strength: ['时长', '消耗'],
    class: ['时长'],
    other: ['步数', '距离', '时长', '消耗']
  }
  const types = d.actionTypes
  for (let i = 0; i < types.length; i++) {
    const t = types[i]
    await mp.evaluate(idx => {
      const p = getCurrentPages()[getCurrentPages().length - 1]
      p.onType({ detail: { value: idx } })
    }, i)
    await sleep(500)
    const cur = await page.data()
    const labels = (cur.currentFields || []).map(f => f.label)
    const expect = want[t.key] || []
    const hit = expect.every(x => labels.indexOf(x) >= 0)
    console.log('  ' + t.name + ': ' + JSON.stringify(labels) + (hit ? '  ✓' : '  ✗ 期望含 ' + JSON.stringify(expect)))
    if (hit) ok(t.name + ' 字段正确')
    else bad(t.name + ' 字段不符合预期')
  }

  console.log('\n[3] 骑行不应出现「步数」')
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    const idx = p.data.actionTypes.findIndex(t => t.key === 'cycling')
    p.onType({ detail: { value: idx } })
  })
  await sleep(500)
  d = await page.data()
  const labels = (d.currentFields || []).map(f => f.label)
  if (labels.indexOf('步数') < 0) ok('骑行没有步数输入框')
  else bad('骑行还有步数输入框')
  console.log('  提示: ' + d.hintText)

  console.log('\n[4] 步行不填步数 → 客户端拦截')
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    const idx = p.data.actionTypes.findIndex(t => t.key === 'walk')
    p.onType({ detail: { value: idx } })
  })
  await sleep(500)
  const toast = await mp.evaluate(() => {
    return new Promise(resolve => {
      const orig = wx.showToast
      wx.showToast = opts => { wx.showToast = orig; resolve(opts.title) }
      const p = getCurrentPages()[getCurrentPages().length - 1]
      p.submitActivity()
      setTimeout(() => { wx.showToast = orig; resolve('(没有拦截)') }, 1500)
    })
  })
  console.log('  toast: ' + toast)
  if (String(toast).indexOf('步数') >= 0) ok('提示「请填写步数」')
  else bad('没有拦截或提示不对', toast)

  await mp.navigateBack()
  await sleep(700)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
