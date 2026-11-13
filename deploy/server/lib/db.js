// PostgreSQL 连接、事务、幂等建表
const fs = require('fs')
const path = require('path')
const { Pool, types } = require('pg')

// bigint / numeric 默认按字符串返回，前端期望数字，这里统一转换
types.setTypeParser(20, v => (v === null ? null : Number(v)))
types.setTypeParser(1700, v => (v === null ? null : Number(v)))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30e3
})
pool.on('error', err => console.error('pg pool error', err))

async function query(sql, params) {
  return pool.query(sql, params)
}

async function one(sql, params) {
  const { rows } = await pool.query(sql, params)
  return rows[0] || null
}

// 在一个可串行化安全的事务里执行；回调里的 client 必须用于所有 SQL
async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    try {
      await client.query('rollback')
    } catch (e2) {
      console.error('rollback failed', e2)
    }
    throw e
  } finally {
    client.release()
  }
}

async function ensureSchema() {
  const file = path.join(__dirname, '..', 'schema.sql')
  const sql = fs.readFileSync(file, 'utf8')
  await pool.query(sql)
  console.log('schema ensured')
}

module.exports = { pool, query, one, tx, ensureSchema }
