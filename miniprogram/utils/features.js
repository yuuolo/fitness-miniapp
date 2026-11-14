// 功能开关（客户端状态）
// 服务端 /api/admin/features 里的开关决定小程序隐藏哪些入口与 tab。
// 页面在 onShow 里 await ensure()，然后按 enabled(key) 决定是否显示内容。
const api = require('./api')

const DEFAULTS = {
  cards: true,    // 会员卡
  classes: true,  // 团课与私教
  venues: true,   // 娱乐项目
  moments: true,  // 健身友圈
  fitness: true,  // 健身数据
  rank: true      // 排行榜
}

const LABELS = {
  cards: '会员卡',
  classes: '团课与私教',
  venues: '娱乐项目',
  moments: '健身友圈',
  fitness: '健身数据',
  rank: '排行榜'
}

let state = Object.assign({}, DEFAULTS)
let loaded = false
let pending = null
const listeners = []

function get() {
  return Object.assign({}, state)
}

function enabled(key) {
  return state[key] !== false
}

/** 标签文案，用于「XX 功能暂未开放」提示 */
function label(key) {
  return LABELS[key] || key
}

/** 用服务端返回的状态覆盖本地状态，并通知订阅者 */
function set(next) {
  if (!next) return
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof next[key] === 'boolean') state[key] = next[key]
  }
  loaded = true
  listeners.slice().forEach(fn => {
    try { fn(get()) } catch (e) { /* 单个订阅者出错不影响其他 */ }
  })
}

/** 订阅开关变化（自定义 tabBar 用），返回取消订阅函数 */
function subscribe(fn) {
  listeners.push(fn)
  return function () {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/**
 * 确保拿到最新开关。首次调用发一次请求，之后直接用缓存；
 * 传 true 强制刷新（下拉刷新等场景）。
 */
function ensure(force) {
  if (loaded && !force) return Promise.resolve(get())
  if (pending) return pending
  pending = api.call('featureFlags', {}, { silent: true }).then(next => {
    set(next)
    pending = null
    return get()
  }, () => {
    // 拿不到就按「全部开启」处理，避免因为一次网络抖动把功能藏起来
    pending = null
    loaded = true
    return get()
  })
  return pending
}

module.exports = { DEFAULTS, get, set, enabled, label, subscribe, ensure }
