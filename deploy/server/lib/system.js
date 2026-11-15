// 系统初始化：第一个调用者成为管理员，写入示例卡种/娱乐项目/团课和入场码密钥
const crypto = require('crypto')
const { tx, query } = require('./db')
const { fail, newId, configGet } = require('./common')
const features = require('./features')

async function isInitialized() {
  return !!(await configGet('system'))
}

async function systemStatus() {
  return { initialized: await isInitialized() }
}

/** 小程序启动时拉一次功能开关，决定隐藏哪些入口与 tab（不需要登录态） */
async function featureFlags() {
  return features.flags()
}

// 哨兵（config/system）最后写：中途失败不会被误标记为已初始化，重新点一次会续上
async function bootstrap({ openid, me }) {
  if (await isInitialized()) fail('系统已经初始化过了')

  const now = Date.now()
  await tx(async client => {
    await client.query(
      `insert into members (openid, role, created_at) values ($1, 'admin', $2)
       on conflict (openid) do update set role = 'admin'`,
      [openid, now]
    )




    const secret = await client.query('select 1 from config where key = $1', ['secret'])
    if (secret.rowCount === 0) {
      await client.query('insert into config (key, value) values ($1, $2)', [
        'secret', JSON.stringify({ value: crypto.randomBytes(32).toString('hex') })
      ])
    }

    const sentinel = await client.query(
      'insert into config (key, value) values ($1, $2) on conflict (key) do nothing',
      ['system', JSON.stringify({ initializedAt: now, by: openid })]
    )
    if (sentinel.rowCount === 0) fail('系统已经初始化过了')
  })

  return { initialized: true }
}

module.exports = { systemStatus, bootstrap, isInitialized, featureFlags }
