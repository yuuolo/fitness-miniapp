// 会员也能搜会员（挑战选对手），但不暴露手机号
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
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

// ---------- 1. challenge.js：新增 challengeOpponents ----------
edit('lib/challenge.js', t => {
  if (t.includes('async function challengeOpponents')) return t
  t = t.replace(
    `// 可选裁判：只有教练（admin 也能判，但列表只给教练，符合「主裁判只能是教练」）`,
    `// 可挑战的会员列表：普通会员也能调用（挑战选对手用）
// 注意：searchMembers 是教练权限的（员工端查会员用），会员挑战不能用它，
// 所以这里单独开一个只返回公开信息的列表（不含手机号）
async function challengeOpponents({ me, data }) {
  need(me, 'member')
  const kw = String((data && data.keyword) || '').trim()
  const limit = Math.min(Math.max(Number(data && data.limit) || 20, 1), 50)

  if (!kw) {
    const rows = (await query(
      \`select openid, nick_name, avatar, role from members
        where openid <> $1 order by created_at desc limit $2\`,
      [me._id, limit]
    )).rows
    return rows.map(row => ({
      _id: row.openid,
      name: row.nick_name || '未命名会员',
      nickName: row.nick_name || '',
      avatar: row.avatar || '',
      role: row.role || 'member'
    }))
  }

  // 数字当手机号搜（只用来匹配，不返回手机号），其他按昵称搜
  const pattern = '%' + kw.replace(/[%_\\\\]/g, ch => '\\\\' + ch) + '%'
  const column = /^\\d+$/.test(kw) ? 'phone' : 'nick_name'
  const rows = (await query(
    \`select openid, nick_name, avatar, role from members
      where \${column} ilike $1 and openid <> $2 order by created_at desc limit $3\`,
    [pattern, me._id, limit]
  )).rows
  return rows.map(row => ({
    _id: row.openid,
    name: row.nick_name || '未命名会员',
    nickName: row.nick_name || '',
    avatar: row.avatar || '',
    role: row.role || 'member'
  }))
}

// 可选裁判：只有教练（admin 也能判，但列表只给教练，符合「主裁判只能是教练」）`
  )
  t = t.replace(
    `  challengeBoard,
  notifyTemplates
}`,
    `  challengeBoard,
  challengeOpponents,
  notifyTemplates
}`
  )
  return t
}, 'challenge.js：challengeOpponents（会员可查）')

// ---------- 2. index.js 注册 ----------
edit('index.js', t => {
  if (t.includes('challengeOpponents:')) return t
  return t.replace(
    `  createChallenge: 'rank',`,
    `  createChallenge: 'rank',
  challengeOpponents: 'rank',`
  )
}, 'index.js：注册 challengeOpponents')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/challenge.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
console.log('  ✓ 语法通过')
