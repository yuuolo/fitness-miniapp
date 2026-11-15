// 数据库备份：把每张表导成 NDJSON + gzip，写进挂载的 backups 目录
//
// 为什么不用 pg_dump：server 容器里没有 pg 客户端，也没有 sudo 在宿主机装 cron。
// 这里用应用自己的定时任务（cron.js 每 15 分钟跑一次）判断是否需要备份，
// 一天最多一次，保留最近 14 份。
//
// 备份文件是「一行一条记录」的 JSON：
//   {"table":"members","row":{...}}
//   {"table":"media","row":{"id":"...","bytes":"<base64>"}}
// 恢复用 scripts/restore-app-backup.js。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { query } = require('./db')

const DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')
const KEEP = Number(process.env.BACKUP_KEEP || 14)

// 备份顺序无关紧要，但恢复时先插没有外键依赖的表更稳
const TABLES = [
  'members', 'card_types', 'member_cards', 'card_logs', 'offline_payments',
  'schedules', 'bookings', 'venues', 'venue_slots', 'entry_logs',
  'body_records', 'strength_records', 'activity_records',
  'moments', 'competitions', 'competition_entries', 'lift_items',
  'media', 'config'
]

function stamp(d) {
  const t = d || new Date()
  const p = n => String(n).padStart(2, '0')
  return t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + '-' +
    p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds())
}

/** 当前所有存在的表（防止 schema 差异导致备份失败） */
async function existingTables() {
  const { rows } = await query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename"
  )
  const have = new Set(rows.map(r => r.tablename))
  return TABLES.filter(t => have.has(t))
}

/**
 * 导出一次
 * @returns {Promise<{file: string, bytes: number, tables: object}>}
 */
async function dump() {
  fs.mkdirSync(DIR, { recursive: true })
  const tables = await existingTables()
  const name = 'app-' + stamp() + '.jsonl.gz'
  const file = path.join(DIR, name)

  const out = fs.createWriteStream(file)
  const gzip = zlib.createGzip({ level: 6 })
  gzip.pipe(out)

  const counts = {}
  for (const table of tables) {
    let rows = []
    try {
      rows = (await query('select * from ' + table)).rows
    } catch (e) {
      console.error('backup: 读取 ' + table + ' 失败：' + e.message)
      continue
    }
    counts[table] = rows.length
    for (const row of rows) {
      // Buffer 转 base64 才能进 JSON（media 表存图片二进制）
      const clean = {}
      for (const [k, v] of Object.entries(row)) {
        clean[k] = Buffer.isBuffer(v) ? v.toString('base64') : v
      }
      gzip.write(JSON.stringify({ table, row: clean }) + '\n')
    }
  }

  gzip.end()
  await new Promise((resolve, reject) => {
    out.on('finish', resolve)
    out.on('error', reject)
    gzip.on('error', reject)
  })

  const bytes = fs.statSync(file).size
  prune()
  return { file: name, bytes, tables: counts }
}

/** 只保留最近 KEEP 份 */
function prune() {
  try {
    const files = fs.readdirSync(DIR)
      .filter(f => /^app-\d{8}-\d{6}\.jsonl\.gz$/.test(f))
      .sort()
    while (files.length > KEEP) {
      const old = files.shift()
      fs.unlinkSync(path.join(DIR, old))
    }
  } catch (e) {
    console.error('backup: 清理旧备份失败：' + e.message)
  }
}

/** 最近一次备份的信息 */
function latest() {
  try {
    const files = fs.readdirSync(DIR)
      .filter(f => /^app-\d{8}-\d{6}\.jsonl\.gz$/.test(f))
      .sort()
    if (!files.length) return null
    const f = files[files.length - 1]
    const st = fs.statSync(path.join(DIR, f))
    return { file: f, bytes: st.size, at: st.mtimeMs }
  } catch (e) {
    return null
  }
}

/**
 * 每天最多跑一次（由 cron.js 每 15 分钟调一次）
 * @returns {Promise<object|null>} 真的备份了才返回结果
 */
async function runDaily() {
  const last = latest()
  const day = 24 * 60 * 60 * 1000
  if (last && Date.now() - last.at < day) return null
  const result = await dump()
  console.log('每日备份完成：' + result.file + '（' + result.bytes + ' 字节）')
  return result
}

module.exports = { dump, prune, latest, runDaily, DIR, TABLES }
