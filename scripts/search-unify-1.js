// 统一三处会员搜索：员工端会员列表 / 竞赛录入选会员 / 友圈代发选会员
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
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

// ---------- 1. 员工端会员列表：改用统一 mixin ----------
edit('pages/staff/members/members.js', t => {
  t = t.replace(
    `const api = require('../../../utils/api')
const fmt = require('../../../utils/format')`,
    `const api = require('../../../utils/api')
const fmt = require('../../../utils/format')
const memberSearch = require('../../../utils/member-search')`
  )
  // data：补 loading/empty
  t = t.replace(
    `  data: { keyword: '', list: [], loaded: false, manage: '0', admin: '0' },`,
    `  data: {
    keyword: '', list: [], loaded: false, manage: '0', admin: '0',
    members: [], memberLoading: false, memberEmpty: false
  },

  // 统一会员搜索（输入即搜，1 个字起）`
  )
  // onLoad 时设置条数上限
  t = t.replace(
    `  onLoad(query) {
    const q = query || {}
    this.setData({ manage: q.manage || '0', admin: q.admin || '0' })
    this.search()
  },`,
    `  onLoad(query) {
    const q = query || {}
    this.memberLimit = 50
    this.setData({ manage: q.manage || '0', admin: q.admin || '0' })
    this.search('')
  },`
  )
  // 替换 onInput/onConfirm/search
  t = t.replace(
    `  // 输入就开始预搜（1 个字符起），300ms 防抖，避免每敲一下都请求
  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.search(), 300)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  onConfirm() {
    this.search()
  },

  search() {
    return api.call('searchMembers', { keyword: this.data.keyword }).then(list => {
      this.setData({
        loaded: true,
        list: list.map(m => Object.assign(m, { roleName: fmt.ROLE_NAMES[m.role], since: fmt.fullDate(m.createdAt) }))
      })
    }, err => {
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' })
    })
  },`,
    `  // 输入即预搜（1 个字起），与其他会员搜索完全一致
  onInput(e) {
    this.memberInput(e)
    this.search(this.data.keyword)
  },

  onConfirm() {
    this.memberConfirm()
    this.search(this.data.keyword)
  },

  onUnload() {
    this.stopMemberSearch()
  },

  // 真正出列表（保存完整字段）
  search(keyword) {
    return api.call('searchMembers', { keyword: String(keyword || '').trim() }).then(list => {
      this.setData({
        loaded: true,
        list: list.map(m => Object.assign(m, { roleName: fmt.ROLE_NAMES[m.role], since: fmt.fullDate(m.createdAt) }))
      })
    }, err => {
      this.setData({ loaded: true })
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' })
    })
  },`
  )
  // 合并 mixin 方法
  t = t.replace(
    `Page({`,
    `Page(Object.assign({}, memberSearch.mixin, {`
  )
  // 补上结尾括号
  t = t.replace(/\n\}\)\n?$/, '\n}))\n')
  return t
}, '员工端会员列表用统一搜索')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/members/members.js'])
console.log('  ✓ 语法通过')
