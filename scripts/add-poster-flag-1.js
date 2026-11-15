// 1) 服务端：新增「友圈海报」开关，momentPoster 归它管
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const log = []

// ---------- features.js ----------
{
  const p = SERVER + '/lib/features.js'
  let t = fs.readFileSync(p, 'utf8')
  if (!t.includes("key: 'poster'")) {
    // 插到 rank 之前（跟在 moments 后面）
    const anchor = `  {
    key: 'fitness',`
    const block = `  {
    key: 'poster',
    name: '友圈海报',
    desc: '动态详情里生成分享海报（带小程序码，可保存到相册）',
    covers: 'momentPoster'
  },
`
    if (!t.includes(anchor)) throw new Error('找不到 fitness 定义')
    t = t.replace(anchor, block + anchor)
    fs.writeFileSync(p, t)
    log.push('features.js 新增 poster 开关')
  } else {
    log.push('· features.js 已有 poster')
  }
}

// ---------- index.js：momentPoster 改归 poster ----------
{
  const p = SERVER + '/index.js'
  let t = fs.readFileSync(p, 'utf8')
  if (t.includes("momentPoster: 'moments'")) {
    t = t.replace("momentPoster: 'moments',", "momentPoster: 'poster',")
    fs.writeFileSync(p, t)
    log.push('index.js momentPoster → poster 开关')
  } else {
    log.push('· momentPoster 已不在 moments 下')
  }
}

console.log(log.map(x => '  ' + x).join('\n'))

// 语法检查
for (const f of ['lib/features.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
console.log('✓ 语法通过')
