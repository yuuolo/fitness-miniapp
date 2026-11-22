// 小程序按版本切后端：正式版走正式域名，体验版/开发版走测试域名
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(p, fn, label) {
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 1. api.js：环境判断
edit(MP + '/utils/api.js', t => {
  if (t.includes('BASE_TEST')) return t
  return t.replace(
    `// 小程序请求封装：所有业务请求走自建后端 https://gym.novrein.com/api
// 用法与云开发版一致：call(action, data, options) → Promise；另外提供 upload(filePath, ext)
const BASE = 'https://gym.novrein.com'`,
    `// 小程序请求封装：所有业务请求走自建后端
//
// 两套环境：
//   正式版（release）→ https://gym.novrein.com        正式库
//   体验版/开发版      → https://test.gym.novrein.com   测试库（独立数据，不影响会员）
// 判断依据：wx.getAccountInfoSync().miniProgram.envVersion
const BASE_RELEASE = 'https://gym.novrein.com'
const BASE_TEST = 'https://test.gym.novrein.com'

function pickBase() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    // develop（开发版）/ trial（体验版）一律走测试环境
    if (env === 'release') return BASE_RELEASE
    return BASE_TEST
  } catch (e) {
    return BASE_RELEASE
  }
}

const BASE = pickBase()`
  )
}, 'api.js：按 envVersion 切后端')

// 2. 后端：测试环境默认不发微信通知（避免测试数据打扰真实会员）
edit('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/notify.js', t => {
  if (t.includes('NOTIFY_DISABLED')) return t
  return t.replace(
    `async function notify(kind, openid, values) {
  const t = templates[kind]
  if (!t || !t.id) return false`,
    `async function notify(kind, openid, values) {
  // 测试环境可关闭发送，避免测试数据打扰真实会员
  if (process.env.NOTIFY_DISABLED === '1') return false
  const t = templates[kind]
  if (!t || !t.id) return false`
  )
}, 'notify.js：支持 NOTIFY_DISABLED')

// 3. staging compose 打开 NOTIFY_DISABLED
edit('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/docker-compose.staging.yml', t => {
  if (t.includes('NOTIFY_DISABLED')) return t
  return t.replace(
    `      OCR_URL: \${OCR_URL:-}`,
    `      # 测试环境不发微信订阅消息（避免打扰真实会员）
      NOTIFY_DISABLED: "1"
      OCR_URL: \${OCR_URL:-}`
  )
}, 'staging compose：关闭真实通知发送')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['miniprogram/utils/api.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/' + f])
}
console.log('  ✓ 语法通过')
