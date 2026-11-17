// 小程序：①搜索即时预搜 ②友圈搜索+只看视频 ③力量成绩可拍视频 ④视频统一走管理限制
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

// ---------- 1. 员工端会员列表：输入 1 个字就预搜（防抖 300ms） ----------
edit('pages/staff/members/members.js', t => {
  if (t.includes('onInputDebounced')) return t
  t = t.replace(
    `  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },`,
    `  // 输入就开始预搜（1 个字符起），300ms 防抖，避免每敲一下都请求
  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.search(), 300)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },`
  )
  return t
}, '会员列表预搜')

// 员工端其它搜索框（如有 onConfirm 才搜）也加预搜：竞赛录入的会员选择、动态代发的会员选择
edit('pages/moments/post/post.js', t => {
  if (t.includes('loadMembersDebounced')) return t
  return t
}, '（跳过）')

// ---------- 2. 友圈：搜索栏 + 只看视频 ----------
edit('pages/moments/moments.js', t => {
  if (t.includes('onSearchInput')) return t
  // data 增加搜索状态
  t = t.replace(
    `  data: { list: [], loaded: false, hasMore: true, loading: false, disabled: false },`,
    `  data: {
    list: [], loaded: false, hasMore: true, loading: false, disabled: false,
    // 搜索：1 个字起就预搜；可以只看视频
    keyword: '', onlyVideo: false
  },`
  )
  // reload/loadMore 带上搜索条件
  t = t.replace(
    `  reload() {`,
    `  // 输入即预搜（300ms 防抖）
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.reload(), 300)
  },

  onSearchConfirm() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.reload()
  },

  clearSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.setData({ keyword: '', onlyVideo: false })
    this.reload()
  },

  toggleVideoOnly() {
    this.setData({ onlyVideo: !this.data.onlyVideo })
    this.reload()
  },

  reload() {`
  )
  return t
}, '友圈搜索状态与方法')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
