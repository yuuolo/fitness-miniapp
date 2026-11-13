// 小程序真机前回归：用 miniprogram-automator 连接微信开发者工具，真跑页面
// 前提：cli auto --auto-port 9421 已开启
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const LOG = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/automator/regression.log'

let lines = []
function log(msg) {
  lines.push(msg)
  console.log(msg)
}
function ok(name) {
  log('  \u2713 ' + name)
}
function bad(name, detail) {
  log('  \u2717 ' + name + (detail ? ' -> ' + detail : ''))
  failures++
}
let failures = 0

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  log('连接 ' + ENDPOINT)
  const mp = await automator.connect({ wsEndpoint: ENDPOINT })
  log('已连接')

  // ---------- 系统与 SDK 版本 ----------
  const sysinfo = await mp.systemInfo()
  log('SDK: ' + JSON.stringify(sysinfo.SDKVersion || sysinfo))

  // ---------- 1. 首页：验证 wx.login + /api 打通 ----------
  log('\n[1] 首页 pages/index/index')
  const index = await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  const idx = await index.data()
  log('  data.initialized = ' + idx.initialized + '  loaded = ' + idx.loaded)
  log('  data.me = ' + JSON.stringify(idx.me))
  if (idx.loaded) ok('首页加载完成（request 合法域名与后端连通）')
  else bad('首页未加载完成')

  const initialized = idx.initialized
  log('  系统初始化状态: ' + initialized)
  if (idx.me && idx.me.role) ok('已拿到会员档案，role=' + idx.me.role)
  else bad('未拿到会员档案')

  // ---------- 2. 订阅消息模板是否被小程序读到 ----------
  log('\n[2] 小程序端配置')
  const cfg = await mp.evaluate(() => {
    const app = getApp()
    return (app && app.globalData && app.globalData.config) || null
  })
  log('  app.globalData.config = ' + JSON.stringify(cfg))
  if (cfg && cfg.templates && cfg.templates.bookingSuccess) {
    ok('订阅消息模板 ID 已被小程序读到（config.local.js 生效）')
  } else {
    bad('小程序没读到模板 ID', JSON.stringify(cfg))
  }

  // ---------- 3. 各页面渲染 ----------
  // tabBar 页面必须用 switchTab，普通页面用 navigateTo
  const TAB_PAGES = new Set(['/pages/index/index', '/pages/schedule/schedule', '/pages/venues/venues', '/pages/mine/mine', '/pages/moments/moments'])
  const pages = [
    ['/pages/mine/mine', '我的'],
    ['/pages/cards/cards', '会员卡'],
    ['/pages/bookings/bookings', '我的预约'],
    ['/pages/schedule/schedule', '约课'],
    ['/pages/venues/venues', '娱乐'],
    ['/pages/fitness/fitness', '健身数据'],
    ['/pages/rank/rank', '排行榜'],
    ['/pages/moments/moments', '友圈']
  ]
  log('\n[3] 逐页打开检查是否报错')
  for (const [route, name] of pages) {
    try {
      const page = TAB_PAGES.has(route)
        ? await mp.switchTab(route)
        : await mp.navigateTo(route)
      await sleep(2500)
      const d = await page.data()
      const errText = JSON.stringify(d || {}).match(/"(?:error|errorMsg)"\s*:\s*"([^"]+)"/)
      if (errText && errText[1]) {
        bad(name + ' ' + route + ' 显示错误', errText[1])
      } else {
        ok(name + ' ' + route + ' 打开正常')
      }
      if (TAB_PAGES.has(route)) {
        await mp.switchTab('/pages/index/index')
      } else {
        await mp.navigateBack()
      }
      await sleep(600)
    } catch (e) {
      bad(name + ' ' + route + ' 打开异常', e.message)
    }
  }

  // ---------- 4. 入场码 ----------
  log('\n[4] 入场码页面')
  try {
    const entry = await mp.navigateTo('/pages/entry/entry')
    await sleep(3000)
    const ed = await entry.data()
    if (ed.image && String(ed.image).indexOf('data:image') === 0) {
      ok('入场二维码已生成（' + String(ed.image).length + ' 字节 data URL）')
    } else if (ed.error) {
      log('    提示：' + ed.error + '（若没有可入场的卡属正常）')
      bad('入场码未生成', ed.error)
    } else {
      bad('入场码既无图片也无错误')
    }
    await mp.navigateBack()
  } catch (e) {
    bad('入场码页面异常', e.message)
  }
  await sleep(800)

  log('\n结果：' + (failures ? failures + ' 项失败' : '全部通过'))
  fs.writeFileSync(LOG, lines.join('\n'))
  await mp.disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(err => {
  console.error('回归脚本异常：', err)
  try {
    fs.writeFileSync(LOG, lines.concat(['脚本异常: ' + err.message]).join('\n'))
  } catch (e) {}
  process.exit(2)
})
