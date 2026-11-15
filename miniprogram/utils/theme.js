// 主题：跟随系统 / 浅色 / 深色
//
// 微信不提供用 JS 改 prefers-color-scheme 的能力，所以手动切换的做法是：
// 给每个页面的根节点挂一个主题类（theme-auto / theme-light / theme-dark），
// 把颜色变量定义在这些类上，子节点全部通过继承拿到对应颜色。
//
// 用法：
//   const theme = require('../../utils/theme')
//   Page({ data: { themeClass: theme.cls() }, onShow() { theme.sync(this) } })
//   wxml 根节点：<view class="page {{themeClass}}">
const STORAGE_KEY = 'ui-theme'
const MODES = ['auto', 'light', 'dark']

let listeners = []

function normalize(mode) {
  return MODES.includes(mode) ? mode : 'auto'
}

/** 当前模式：auto / light / dark */
function get() {
  try {
    return normalize(wx.getStorageSync(STORAGE_KEY))
  } catch (e) {
    return 'auto'
  }
}

/** 模式对应的根节点类名 */
function cls(mode) {
  return 'theme-' + (mode || get())
}

/** 设置模式，返回新的类名；会通知订阅者（比如自定义 tabBar） */
function set(mode) {
  const next = normalize(mode)
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (e) {}
  const klass = cls(next)
  listeners.slice().forEach(fn => {
    try { fn(next, klass) } catch (e) {}
  })
  return klass
}

/** 订阅模式变化，返回取消订阅函数 */
function subscribe(fn) {
  listeners.push(fn)
  return function () {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/** 把当前主题同步到页面 data（在各页 onShow 里调用） */
function sync(page) {
  if (!page || typeof page.setData !== 'function') return
  const klass = cls()
  if (page.data && page.data.themeClass === klass) return
  page.setData({ themeClass: klass })
}

function nameOf(mode) {
  return { auto: '跟随系统', light: '浅色', dark: '深色' }[normalize(mode)] || '跟随系统'
}

module.exports = { MODES, get, set, cls, subscribe, sync, nameOf }
