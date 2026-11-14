// 排行榜项目：可以增删的「比什么」
//
// 每一项有自己的计算方式（metric）：
//   oneRM      用 Epley 公式把「重量 × 次数」估算成单次最大重量
//   maxWeight  直接比单组最大重量
//   reps       比单组次数（自重动作，如引体向上）
//   volume     比单组容量（重量 × 次数）
const crypto = require('crypto')
const { query } = require('./db')
const { fail, need } = require('./common')

const METRICS = {
  oneRM: { name: '估算 1RM', unit: 'kg' },
  maxWeight: { name: '最大重量', unit: 'kg' },
  reps: { name: '单组次数', unit: '次' },
  volume: { name: '单组容量', unit: 'kg' }
}

const DEFAULT_ITEMS = [
  { key: 'bench', name: '卧推', metric: 'oneRM', unit: 'kg', sort: 10 },
  { key: 'squat', name: '深蹲', metric: 'oneRM', unit: 'kg', sort: 20 },
  { key: 'deadlift', name: '硬拉', metric: 'oneRM', unit: 'kg', sort: 30 },
  { key: 'ohp', name: '站姿肩推', metric: 'oneRM', unit: 'kg', sort: 40 },
  { key: 'pullup', name: '引体向上', metric: 'reps', unit: '次', sort: 50 }
]

function row(r) {
  if (!r) return null
  return {
    key: r.key,
    name: r.name,
    metric: r.metric,
    metricName: (METRICS[r.metric] || {}).name || r.metric,
    unit: r.unit,
    enabled: !!r.enabled,
    sort: r.sort,
    createdAt: r.created_at || 0
  }
}

function round(n, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(n * p) / p
}

/** 按项目的计算方式，把「重量 × 次数」换算成排行用的数值 */
function computeValue(metric, weight, reps) {
  const w = Number(weight) || 0
  const r = Number(reps) || 0
  if (metric === 'maxWeight') return round(w, 1)
  if (metric === 'reps') return r
  if (metric === 'volume') return round(w * r, 1)
  // oneRM：Epley
  if (r <= 1) return round(w, 1)
  return round(w * (1 + r / 30), 1)
}

/** 确保默认项存在（启动时执行一次，幂等） */
async function ensureSeed() {
  for (const item of DEFAULT_ITEMS) {
    await query(
      `insert into lift_items (key, name, metric, unit, enabled, sort, created_at)
       values ($1, $2, $3, $4, true, $5, $6)
       on conflict (key) do nothing`,
      [item.key, item.name, item.metric, item.unit, item.sort, Date.now()]
    )
  }
}

/**
 * 列出排行榜项目。
 * @param {{includeDisabled?: boolean}} options includeDisabled=true 时包含已隐藏的项（员工管理用）
 */
async function list(options) {
  const includeDisabled = !!(options && options.includeDisabled)
  const rows = (await query(
    `select * from lift_items ${includeDisabled ? '' : 'where enabled = true'} order by sort asc, created_at asc`
  )).rows
  return rows.map(row)
}

async function getItem(key) {
  const res = await query('select * from lift_items where key = $1', [key])
  return row(res.rows[0])
}

/** 只保留启用项的名字映射，供成绩录入校验与展示 */
async function enabledMap() {
  const items = await list()
  const map = {}
  for (const item of items) map[item.key] = item
  return map
}

/**
 * 新增或修改一个排行榜项目（管理员）。
 * key 传空时自动生成；已有 key 只更新名称/计算方式/排序。
 */
async function save({ me, data }) {
  need(me, 'admin')
  const name = String(data.name || '').trim()
  if (!name || name.length > 12) fail('项目名称需为 1–12 个字')
  const metric = METRICS[data.metric] ? data.metric : 'oneRM'
  const sort = Number.isFinite(Number(data.sort)) ? Number(data.sort) : 999
  let key = String(data.key || '').trim()

  if (key) {
    const existing = await getItem(key)
    if (!existing) fail('项目不存在')
    await query('update lift_items set name = $2, metric = $3, unit = $4, sort = $5 where key = $1',
      [key, name, metric, METRICS[metric].unit, sort])
    return getItem(key)
  }

  // 新增：生成一个不会撞的 key
  do {
    key = 'lift_' + crypto.randomBytes(3).toString('hex')
  } while (await getItem(key))

  await query(
    `insert into lift_items (key, name, metric, unit, enabled, sort, created_at)
     values ($1, $2, $3, $4, true, $5, $6)`,
    [key, name, metric, METRICS[metric].unit, sort, Date.now()]
  )
  return getItem(key)
}

/** 显示 / 隐藏一个项目（隐藏后排行榜不再出现，但历史成绩保留） */
async function setEnabled({ me, data }) {
  need(me, 'admin')
  const item = await getItem(data.key)
  if (!item) fail('项目不存在')
  const enabled = !!data.enabled
  await query('update lift_items set enabled = $2 where key = $1', [item.key, enabled])
  return Object.assign(item, { enabled })
}

// 身体评分（SBD 合计）用的标准三项：不能删除，可以隐藏
const SBD_KEYS = ['bench', 'squat', 'deadlift']

/**
 * 删除项目。只有从未产生过成绩、也没有竞赛引用时才允许真删；
 * 否则提示改为「隐藏」，避免历史数据变成孤儿。
 * 标准三项（卧推/深蹲/硬拉）永远不允许删除，因为身体评分依赖它们。
 */
async function remove({ me, data }) {
  need(me, 'admin')
  const item = await getItem(data.key)
  if (!item) fail('项目不存在')

  if (SBD_KEYS.includes(item.key)) {
    fail('卧推/深蹲/硬拉是身体评分用的标准三项，不能删除；用不上的话可以隐藏')
  }

  const used = (await query('select count(*)::int as n from strength_records where lift = $1', [item.key])).rows[0].n
  const inComp = (await query('select count(*)::int as n from competitions where lift_key = $1', [item.key])).rows[0].n
  if (used > 0 || inComp > 0) {
    fail('这个项目已经有成绩或竞赛在用，不能删除；可以改成「隐藏」')
  }
  await query('delete from lift_items where key = $1', [item.key])
  return { deleted: true, key: item.key }
}

module.exports = {
  METRICS,
  DEFAULT_ITEMS,
  computeValue,
  ensureSeed,
  list,
  getItem,
  enabledMap,
  save,
  setEnabled,
  remove
}
