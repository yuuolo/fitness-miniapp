// 1) 服务端：fitnessOf 返回 openid（分享链接需要）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let t = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n')

if (t.includes('openid: member._id,')) {
  console.log('· 已有 openid')
} else {
  const anchor = `  return {
    memberName: memberLabel(member),`
  if (!t.includes(anchor)) {
    console.log('⚠ 未匹配 fitnessOf 返回块')
  } else {
    t = t.replace(anchor, `  return {
    openid: member._id,
    memberName: memberLabel(member),`)
    fs.writeFileSync(P, t)
    console.log('  ✓ fitnessOf 返回 openid')
  }
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
