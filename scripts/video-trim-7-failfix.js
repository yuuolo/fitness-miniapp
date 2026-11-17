// 修：超过体积上限时不要直接 destroy 请求（否则响应发不回去，客户端看到 empty reply）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/receive.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    const fail = err => {
      if (settled) return
      settled = true
      out.destroy()
      try { req.destroy() } catch (e) {}
      reject(err)
    }`

const to = `    const fail = err => {
      if (settled) return
      settled = true
      out.destroy()
      // 不能 destroy 请求：先把剩余数据读掉，响应（JSON）才能正常发回客户端
      try {
        req.removeAllListeners('data')
        req.on('error', () => {})
        req.resume()
      } catch (e) {}
      reject(err)
    }`

if (!t.includes(from)) {
  console.log('⚠ 未匹配 fail')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修超限时的响应')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
