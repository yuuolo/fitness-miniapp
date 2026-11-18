// 修：judgeChallenge 在事务里读详情会读到旧状态，改成事务提交后再读
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/challenge.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  return tx(async client => {
    let finalResult = result`
const to = `  await tx(async client => {
    let finalResult = result`

const from2 = `      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now]
    )
    return detailById(c._id, me)
  })`
const to2 = `      [c._id, finalResult, note, now, JSON.stringify(history.slice(-10)), now]
    )
  })
  // 事务提交后再读，避免读到旧状态
  return detailById(c._id, me)`

if (!t.includes(from) || !t.includes(from2)) {
  console.log('⚠ 未匹配事务块')
  process.exit(1)
}
t = t.replace(from, to)
t = t.replace(from2, to2)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已改为事务提交后再读详情')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
