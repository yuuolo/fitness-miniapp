// 删掉重复的 publicMe（保留带 _id / gender 的那个），并全仓检查重复函数定义
const fs = require('fs')
const path = require('path')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const P = SERVER + '/lib/member.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// 第二个（旧的、没有 _id 的那份）整段删掉
const dup = `function publicMe(me) {
  if (!me) return null
  return {
    nickName: me.nickName,
    phone: me.phone,
    role: me.role,
    blockUntil: me.blockUntil || 0,
    avatar: me.avatar || '',
    // 前端用来提示「资料还没填完」
    profileReady: !!(me.nickName && me.phone)
  }
}

`

if (t.includes(dup)) {
  t = t.replace(dup, '')
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('  ✓ 删除重复的 publicMe 定义')
} else {
  console.log('  ⚠ 未找到重复定义原文')
}

require('child_process').execFileSync(process.execPath, ['--check', P])

// ---------- 全仓检查重复的函数定义（只针对 server/lib 与 index.js） ----------
function scan(file) {
  const src = fs.readFileSync(file, 'utf8')
  const names = {}
  for (const m of src.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const n = m[1]
    names[n] = (names[n] || 0) + 1
  }
  const dupes = Object.entries(names).filter(([, c]) => c > 1)
  return dupes
}

const files = []
const libDir = SERVER + '/lib'
for (const f of fs.readdirSync(libDir)) if (f.endsWith('.js')) files.push(path.join(libDir, f))
files.push(SERVER + '/index.js')

let total = 0
for (const f of files) {
  const d = scan(f)
  if (d.length) {
    total += d.length
    console.log('  ✗ ' + path.relative(SERVER, f) + ' 重复定义: ' + d.map(([n, c]) => n + '×' + c).join(', '))
  }
}
console.log(total ? '  共 ' + total + ' 组重复，需要处理' : '  ✓ 没有其它重复函数定义')
