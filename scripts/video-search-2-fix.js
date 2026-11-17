// 重写 momentList（上一版插入时被引号截断了）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/moment.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const start = t.indexOf('async function momentList({ me, data }) {')
if (start < 0) {
  console.log('⚠ 找不到 momentList')
  process.exit(1)
}
// 找函数结尾：从 momentDetail 的位置往前
const nextFn = t.indexOf('async function momentDetail', start)
if (nextFn < 0) {
  console.log('⚠ 找不到 momentDetail')
  process.exit(1)
}

const L = [
  'async function momentList({ me, data }) {',
  "  need(me, 'member')",
  '  const before = Number(data.before) || 0',
  '  // 搜索：1 个字起就能搜（匹配内容或作者名）；只看视频',
  "  const keyword = String(data.keyword || '').trim().slice(0, 30)",
  "  const onlyVideo = data.onlyVideo === true || data.onlyVideo === '1'",
  '  const params = [before, PAGE_SIZE]',
  '  let where = "status = \'normal\' and ($1::bigint = 0 or created_at < $1::bigint)"',
  '  if (keyword) {',
  "    params.push('%' + keyword + '%')",
  "    where += ' and (content ilike $' + params.length + ' or author_name ilike $' + params.length + ')'",
  '  }',
  "  if (onlyVideo) where += \" and type = 'video'\"",
  "  const sql = 'select * from moments where ' + where + ' order by created_at desc limit $2'",
  '  const list = (await query(sql, params)).rows.map(momentRow)',
  '  const cfg = await limits.get()',
  '  return {',
  '    // 列表里每条最多显示 feedThumbs 个，剩下的在详情页看',
  '    list: list.map(m => {',
  '      const view = momentView(m, me)',
  '      const all = view.media || []',
  '      if (all.length > cfg.feedThumbs) {',
  '        view.media = all.slice(0, cfg.feedThumbs)',
  '        view.mediaCount = all.length',
  '        view.hiddenMedia = all.length - cfg.feedThumbs',
  '      }',
  '      return view',
  '    }),',
  '    hasMore: list.length === PAGE_SIZE,',
  '    feedThumbs: cfg.feedThumbs,',
  "    keyword: String(data.keyword || '').trim(),",
  "    onlyVideo: data.onlyVideo === true || data.onlyVideo === '1'",
  '  }',
  '}',
  ''
].join('\n')

t = t.slice(0, start) + L + t.slice(nextFn)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ momentList 已重写')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
