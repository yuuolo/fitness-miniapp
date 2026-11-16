// api.js：登录 code 失效时自动重新登录并重试一次
// （后端重启后，客户端缓存的 code 会被判「code been used」，以前会直接报错、页面空白）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/api.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// 1. 加一个「彻底清掉缓存」的函数
t = t.replace(
  `function request(path, options) {`,
  `// 登录 code 只能用一次：服务端会话失效时要重新取 code，不能一直用旧的
function resetLogin() {
  cached = { code: '', at: 0 }
}

// 这些报错说明是 code 的问题，换一个新的再试
function isLoginError(msg) {
  return /code been used|登录失败|invalid code|已被使用|expired|会话/i.test(String(msg || ''))
}

function request(path, options) {`
)

// 2. call：失败且是登录问题时重登一次
const oldCall = `function call(action, data, options) {
  return login().then(code => request('/api', {
    data: { action, data: data || {}, code },
    loading: options && options.loading,
    silent: options && options.silent
  }))
}`

const newCall = `function call(action, data, options) {
  const send = () => login().then(code => request('/api', {
    data: { action, data: data || {}, code },
    loading: options && options.loading,
    silent: options && options.silent
  }))
  return send().catch(err => {
    if (!isLoginError(err && err.message)) throw err
    // 换一个新 code 重试一次；第二次还失败就把错误抛出去
    resetLogin()
    return send()
  })
}`

if (!t.includes(oldCall)) {
  console.log('⚠ 未匹配 call 原文')
} else {
  t = t.replace(oldCall, newCall)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('  ✓ call 失败时自动重登重试')
}

// 3. upload 也一样处理（上传也用 code）
t = t.replace(
  `  return Promise.all([login(), readFile(filePath)]).then(([code, buffer]) => request(`,
  `  return Promise.all([login(), readFile(filePath)]).then(([code, buffer]) => request(`
)

// 导出 resetLogin 便于调试
t = t.replace(
  'module.exports = { call, upload }',
  'module.exports = { call, upload, resetLogin }'
)
if (!t.includes('resetLogin }')) {
  // 兜底：如果没有 module.exports 行，就补一行
  t = t.replace(/\nmodule\.exports\s*=[^\n]*/, '\nmodule.exports = { call, upload, resetLogin }')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

const tail = t.slice(-120)
console.log('  文件结尾: ' + JSON.stringify(tail))
