// 统一 member-search mixin：支持页面自定义 mapMembers
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/member-search.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  fetchMembers() {
    const limit = this.memberLimit || DEFAULT_LIMIT
    this.setData({ memberLoading: true })
    return searchOnce(this.data.keyword, limit).then(list => {
      const kw = String(this.data.keyword || '').trim()
      this.setData({
        members: list,
        memberLoading: false,
        // 有关键字却搜不到 → 页面内提示，不弹 toast
        memberEmpty: !list.length && !!kw
      })
      return list
    })
  },`

const to = `  fetchMembers() {
    const limit = this.memberLimit || DEFAULT_LIMIT
    const kw = String(this.data.keyword || '').trim()
    this.setData({ memberLoading: true })
    return api.call('searchMembers', { keyword: kw }, { silent: true })
      .then(list => {
        // 页面可以自定义映射（比如带角色名、入职时间）
        const mapped = this.mapMembers ? this.mapMembers(list) : normalize(list, limit)
        this.setData({
          members: mapped,
          memberLoading: false,
          // 有关键字却搜不到 → 页面内提示，不弹 toast
          memberEmpty: !mapped.length && !!kw
        })
        return mapped
      }, () => {
        this.setData({ memberLoading: false })
        return []
      })
  },`

if (!t.includes(from)) {
  console.log('⚠ 未匹配 fetchMembers')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ mixin 支持 mapMembers')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
