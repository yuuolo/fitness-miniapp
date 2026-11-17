// 统一的会员搜索：输入即预搜（1 个字起）、300ms 防抖、空关键字给默认列表
const api = require('./api')

const DEFAULT_LIMIT = 20
const DEBOUNCE = 300

function normalize(list, limit) {
  return (list || []).slice(0, limit || DEFAULT_LIMIT).map(m => ({
    _id: m._id,
    name: m.nickName || m.phone || '未命名会员',
    nickName: m.nickName || '',
    phone: m.phone || '',
    role: m.role || ''
  }))
}

function searchOnce(keyword, limit) {
  const kw = String(keyword || '').trim()
  return api.call('searchMembers', { keyword: kw }, { silent: true })
    .then(list => normalize(list, limit))
    .catch(() => [])
}

/**
 * 混入到 Page 里，统一三个地方的会员搜索行为：
 *   - 员工端会员列表（limit 50）
 *   - 竞赛录入选会员（limit 20）
 *   - 友圈代发选会员（limit 20）
 *
 * 页面 data 需要：keyword, members, memberLoading, memberEmpty
 * 页面可以设置 this.memberLimit 调整条数
 */
const mixin = {
  // 输入即搜（1 个字就触发），防抖 300ms
  memberInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this.memberSearchDebounced()
  },

  memberConfirm() {
    this.memberSearchNow()
  },

  memberSearchNow() {
    if (this._memberTimer) {
      clearTimeout(this._memberTimer)
      this._memberTimer = null
    }
    return this.fetchMembers()
  },

  memberSearchDebounced() {
    if (this._memberTimer) clearTimeout(this._memberTimer)
    this._memberTimer = setTimeout(() => {
      this._memberTimer = null
      this.fetchMembers()
    }, DEBOUNCE)
  },

  fetchMembers() {
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
  },

  clearMemberSearch() {
    if (this._memberTimer) {
      clearTimeout(this._memberTimer)
      this._memberTimer = null
    }
    this.setData({ keyword: '' })
    return this.fetchMembers()
  },

  stopMemberSearch() {
    if (this._memberTimer) {
      clearTimeout(this._memberTimer)
      this._memberTimer = null
    }
  }
}

module.exports = { mixin, searchOnce, normalize, DEFAULT_LIMIT, DEBOUNCE }
