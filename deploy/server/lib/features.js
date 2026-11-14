// 功能开关：控制会员卡 / 团课 / 娱乐预约 / 友圈 / 健身数据 / 排行榜 是否对外开放
//
// 早期只有一部分功能会用上，开关放在服务器管理页，改完几秒内生效（带 5 秒缓存）。
// 关闭后：
//   - 小程序里对应的入口、tab 会隐藏
//   - 服务端对应 action 会直接返回「功能暂未开放」，避免被旧链接或缓存页面绕过
const { one, query } = require('./db')
const { fail } = require('./common')

const CONFIG_KEY = 'features'
const CACHE_MS = 5000

// 顺序即管理页展示顺序
const FEATURES = [
  {
    key: 'cards',
    name: '会员卡',
    desc: '开卡、调次、停卡、作废；入场码也依赖会员卡',
    covers: 'myCards / openCard / adjustCard / setCardStatus / listCardTypes / entryCode 等'
  },
  {
    key: 'classes',
    name: '团课与私教预约',
    desc: '约课、排课、上课名单、签到与缺席',
    covers: 'listSchedules / bookSchedule / roster / markAttendance / saveSchedule 等'
  },
  {
    key: 'venues',
    name: '娱乐项目预约',
    desc: '攀岩、蹦床、台球等按时段预约与核销',
    covers: 'listVenues / venueSlots / bookVenue / venueBookings 等'
  },
  {
    key: 'moments',
    name: '健身友圈',
    desc: '发动态、点赞、分享海报',
    covers: 'momentList / postMoment / likeMoment / momentPoster 等'
  },
  {
    key: 'fitness',
    name: '健身数据',
    desc: '身体数据、力量成绩、运动记录',
    covers: 'saveBodyRecord / saveStrength / saveActivity / myFitness 等'
  },
  {
    key: 'rank',
    name: '力量排行榜',
    desc: '首页榜单与独立排行页',
    covers: 'leaderboard'
  }
]

const KEYS = FEATURES.map(f => f.key)
const DEFAULT_STATE = KEYS.reduce((acc, key) => { acc[key] = true; return acc }, {})

let cache = null
let cachedAt = 0

function labelOf(key) {
  const hit = FEATURES.find(f => f.key === key)
  return hit ? hit.name : key
}

/** 读取开关（全部为布尔值，缺省视为开启；另带 updatedAt/updatedBy 元信息） */
async function get() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache
  const row = await one('select value from config where key = $1', [CONFIG_KEY])
  const stored = (row && row.value) || {}
  const state = Object.assign({}, DEFAULT_STATE)
  for (const key of KEYS) {
    if (typeof stored[key] === 'boolean') state[key] = stored[key]
  }
  state.updatedAt = typeof stored.updatedAt === 'number' ? stored.updatedAt : 0
  state.updatedBy = typeof stored.updatedBy === 'string' ? stored.updatedBy : ''
  cache = state
  cachedAt = Date.now()
  return state
}

/** 只要 6 个布尔开关（给小程序的 featureFlags action 用） */
async function flags() {
  const state = await get()
  return KEYS.reduce((acc, key) => { acc[key] = state[key] !== false; return acc }, {})
}

/**
 * 保存开关。
 * @param {object} patch 形如 { cards: true, classes: false }
 * @param {string} operator 操作人
 * @returns {Promise<object>} 保存后的完整开关
 */
async function set(patch, operator) {
  const current = await get()
  const next = Object.assign({}, current)
  for (const [key, value] of Object.entries(patch || {})) {
    if (!KEYS.includes(key)) throw new Error('未知的功能开关：' + key)
    if (typeof value !== 'boolean') throw new Error('开关值必须是 true 或 false')
    next[key] = value
  }
  next.updatedAt = Date.now()
  next.updatedBy = operator || 'admin'
  await query(
    `insert into config (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [CONFIG_KEY, JSON.stringify(next)]
  )
  cache = null
  cachedAt = 0
  return get()
}

/** 断言某功能已开启，关闭时抛业务错误（会被映射成 code=400） */
async function assertEnabled(key) {
  const state = await get()
  if (state[key] === false) fail('「' + labelOf(key) + '」功能暂未开放')
}

/** 给管理页 / 小程序用的完整描述 */
async function describe() {
  const state = await get()
  return {
    features: FEATURES.map(f => ({
      key: f.key,
      name: f.name,
      desc: f.desc,
      covers: f.covers,
      enabled: state[f.key] !== false
    })),
    state: KEYS.reduce((acc, key) => { acc[key] = state[key] !== false; return acc }, {}),
    updatedAt: state.updatedAt || 0,
    updatedBy: state.updatedBy || ''
  }
}

module.exports = { FEATURES, KEYS, DEFAULT_STATE, get, flags, set, assertEnabled, describe, labelOf }
