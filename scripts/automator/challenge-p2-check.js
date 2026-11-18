// 挑战 P2 前端联调：详情评论 + 挑战榜
const automator = require('miniprogram-automator')
const fs = require('fs')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }
const created = []

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  // ---------- 1. 挑战榜 ----------
  console.log('\n[1] 挑战榜')
  const board = await mp.navigateTo('/pages/challenges/board/board')
  await sleep(3000)
  let d = await board.data()
  console.log('  loaded=' + d.loaded + '，mine=' + JSON.stringify(d.mine && {
    name: d.mine.name, wins: d.mine.wins, judged: d.mine.judged, badges: (d.mine.badges || []).length
  }))
  const tabs = await board.$$('.tab')
  console.log('  榜单 tab: ' + tabs.length)
  if (d.loaded && tabs.length === 3) ok('挑战榜加载正常，3 个榜')
  else bad('挑战榜异常')
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].tap()
    await sleep(600)
    d = await board.data()
    console.log('  切到 ' + d.tab + ' 榜')
  }
  if (d.tab === 'total') ok('三个榜都能切')
  await mp.navigateBack()
  await sleep(600)

  // ---------- 2. 发起一场挑战用于测评论 ----------
  console.log('\n[2] 发起挑战（用于测评论）')
  const nu = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(2800)
  let pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1200)
    const inputs = await nu.$$('input')
    if (inputs.length) {
      await inputs[0].input('龙')
      await sleep(1200)
      const rows = await nu.$$('.list-item')
      if (rows.length) { await rows[0].tap(); await sleep(800) }
    }
  }
  pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1000)
    const refRows = await nu.$$('.list-item')
    if (refRows.length) { await refRows[0].tap(); await sleep(600) }
  }
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.submit()
  })
  await sleep(3200)
  let cur = await mp.currentPage()
  let curData = await cur.data()
  if (curData && curData.id) {
    created.push(curData.id)
    console.log('  挑战 id=' + curData.id + '，状态=' + (curData.c && curData.c.status))
    ok('挑战创建成功')
  } else {
    bad('挑战没创建成功')
  }

  // ---------- 3. 详情页评论 ----------
  console.log('\n[3] 详情页评论')
  if (curData && curData.id) {
    curData = await cur.data()
    console.log('  评论数=' + curData.c.commentCount + '，可评论=' + curData.c.canComment)
    const inputs = await cur.$$('.comment-input')
    console.log('  评论输入框: ' + inputs.length)
    if (inputs.length) {
      await inputs[0].input('这场我看好发起方')
      await sleep(500)
      await mp.evaluate(() => {
        const p = getCurrentPages()[getCurrentPages().length - 1]
        p.sendComment()
      })
      await sleep(2500)
      curData = await cur.data()
      console.log('  发送后评论数=' + curData.c.commentCount)
      if (curData.c.commentCount === 1) ok('发表意见成功')
      else bad('发表意见失败')
      // 点赞
      const likes = await cur.$$('.like')
      console.log('  点赞按钮: ' + likes.length)
      if (likes.length) {
        await likes[0].tap()
        await sleep(1800)
        curData = await cur.data()
        const lk = (curData.c.comments || [])[0] || {}
        console.log('  点赞后 likeCount=' + lk.likeCount + '，likedByMe=' + lk.likedByMe)
        if (lk.likeCount === 1 && lk.likedByMe) ok('点赞成功')
        else bad('点赞失败')
      }
      // 删除自己的评论
      const dels = await cur.$$('.op-del')
      if (dels.length) {
        await mp.evaluate(() => {
          const p = getCurrentPages()[getCurrentPages().length - 1]
          wx.showModal = (o) => { o.success && o.success({ confirm: true }) }
        })
        await dels[0].tap()
        await sleep(2000)
        curData = await cur.data()
        console.log('  删除后评论数=' + curData.c.commentCount)
        if (curData.c.commentCount === 0) ok('删除自己的评论成功')
      }
    }
  }

  // ---------- 4. 报错 ----------
  console.log('\n[4] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  fs.writeFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', created.join('\n'))
  console.log('\n创建的挑战: ' + (created.join(',') || '(无)'))
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
