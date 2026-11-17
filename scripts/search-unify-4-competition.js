// 竞赛录入选会员：改用统一搜索（输入即搜、1 个字起、默认列表）
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

// ---------- js ----------
edit('pages/staff/competition-entry/competition-entry.js', t => {
  // require
  t = t.replace(
    `const api = require('../../../utils/api')`,
    `const api = require('../../../utils/api')
const memberSearch = require('../../../utils/member-search')`
  )
  // data 增加统一搜索字段
  t = t.replace(
    `  data: {`,
    `  data: {
    keyword: '',
    members: [],
    memberLoading: false,
    memberEmpty: false,`
  )
  // onLoad 里加载默认会员列表
  t = t.replace(
    `    api.call('competitionDetail', { id }).then(r => {`,
    `    this.memberLimit = 20
    this.fetchMembers()
    api.call('competitionDetail', { id }).then(r => {`
  )
  // 替换旧的 onKeyword/search
  const from = `  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
  },

  search() {
    const kw = String(this.data.keyword || '').trim()
    if (!kw) return
    api.call('searchMembers', { keyword: kw }, { silent: true }).then(list => {
      this.setData({ members: list.slice(0, 20) })
      if (!list.length) wx.showToast({ title: '没找到会员', icon: 'none' })
    }, err => wx.showToast({ title: err.message || '搜索失败', icon: 'none' }))
  },`
  const to = `  // 与会员列表、友圈代发共用同一套搜索：输入即搜（1 个字起）
  onKeyword(e) {
    this.memberInput(e)
  },

  onSearchTap() {
    this.memberSearchNow()
  },

  clearKeyword() {
    this.clearMemberSearch()
  },

  // 重新选一个人
  repick() {
    this.setData({ picked: null })
  },

  onUnload() {
    this.stopMemberSearch()
  },`
  if (!t.includes(from)) {
    console.log('  [!] 未匹配旧搜索方法')
    return t
  }
  t = t.replace(from, to)

  // 用 mixin 包装 Page
  t = t.replace(/^Page\(\{/m, 'Page(Object.assign({}, memberSearch.mixin, {')
  t = t.replace(/\n\}\)\n?$/, '\n}))\n')
  return t
}, '竞赛录入用统一搜索')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/competition-entry/competition-entry.js'])
console.log('  ✓ 语法通过')
