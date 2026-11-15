#!/usr/bin/env node
// 从应用备份（app-*.jsonl.gz）恢复数据库
//
// 用法：
//   node scripts/restore-app-backup.js /opt/gym/backups/app-20261115-144825.jsonl.gz
//   node scripts/restore-app-backup.js --list
//
// 注意：会先清空目标库里的对应表再导入，只在确认要回滚时使用。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')

const { pool, query } = require('../lib/db')
const backup = require('../lib/backup')

async function list() {
  const dir = backup.DIR
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /^app-\d{8}-\d{6}\.jsonl\.gz$/.test(f)).sort()
    : []
  if (!files.length) return console.log('没有找到备份文件（目录：' + dir + '）')
  console.log('可用备份（' + dir + '）：')
  files.forEach(f => {
    const st = fs.statSync(path.join(dir, f))
    console.log('  ' + f + '  ' + (st.size / 1024).toFixed(1) + ' KB  ' + new Date(st.mtimeMs).toLocaleString())
  })
}

async function restore(file) {
  if (!fs.existsSync(file)) throw new Error('文件不存在：' + file)

  console.log('开始恢复：' + path.basename(file))
  const rows = {}
  const stream = fs.createReadStream(file).pipe(zlib.createGunzip())
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    let item
    try {
      item = JSON.parse(line)
    } catch (e) {
      continue
    }
    if (!item.table || !item.row) continue
    ;(rows[item.table] = rows[item.table] || []).push(item.row)
  }

  const tables = Object.keys(rows)
  console.log('备份里包含：' + tables.map(t => t + '=' + rows[t].length).join(', '))

  // 先关外键约束，避免插入顺序问题
  await query('set session_replication_role = replica')

  for (const table of tables) {
    const list = rows[table]
    if (!list.length) continue
    await query('truncate table ' + table + ' cascade')
    const cols = Object.keys(list[0])

    for (const row of list) {
      const values = cols.map(c => {
        const v = row[c]
        // media.bytes 存的是 base64，要还原成 Buffer
        if (c === 'bytes' && typeof v === 'string') return Buffer.from(v, 'base64')
        // jsonb 列：对象和数组都要序列化成 JSON 字符串，
        // 否则数组会被 node-postgres 当成 PG 数组字面量（{} 形式），jsonb 解析失败
        if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) {
          return JSON.stringify(v)
        }
        return v
      })
      const holders = cols.map((_, i) => '$' + (i + 1)).join(', ')
      await query(
        'insert into ' + table + ' (' + cols.join(', ') + ') values (' + holders + ') on conflict do nothing',
        values
      )
    }
    console.log('  ' + table + '：恢复 ' + list.length + ' 行')
  }

  await query('set session_replication_role = default')
  console.log('恢复完成')
}

;(async () => {
  const arg = process.argv[2]
  try {
    if (!arg || arg === '--list') await list()
    else await restore(arg)
  } catch (e) {
    console.error('恢复失败：' + e.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
})()
