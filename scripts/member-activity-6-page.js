// 新建会员端「记录运动」页面
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const dir = MP + '/pages/activity'
fs.mkdirSync(dir, { recursive: true })

// ---------- 1. JS ----------
const js = `// 会员自己记录运动：选类型 → 按类型填字段 → 保存；下面是最近的记录
const api = require('../../utils/api')
const sfx = require('../../utils/sfx')

// 按运动类型给出填写提示
function hintOf(type) {
  if (!type || !type.fields) return ''
  if (type.strict) {
    const req = type.fields.find(f => f.required)
    return '必填：' + (req ? req.label : '') + '；其他选填'
  }
  const reqs = (type.required || []).map(k => {
    const f = type.fields.find(x => x.key === k)
    return f ? f.label : k
  })
  return '至少填一项：' + reqs.join(' / ') + '；其他选填'
}

const NAMES = {
  walk: '步行', run: '跑步', cycling: '骑行', swim: '游泳',
  strength: '力量训练', class: '团课', other: '其他'
}

Page({
  data: {
    loaded: false,
    actionTypes: [],
    typeIndex: 0,
    currentType: null,
    currentFields: [],
    activity: {},
    hintText: '',
    date: '',
    list: [],
    saving: false
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('myFitness', {}, { silent: true }).then(f => {
      const types = (f && f.actionTypes) || []
      const typeIndex = Math.min(this.data.typeIndex, Math.max(0, types.length - 1))
      const cur = types[typeIndex] || null
      const activity = Object.assign({}, this.data.activity)
      if (cur && !Object.keys(activity).length) {
        cur.fields.forEach(ff => { activity[ff.key] = '' })
      }
      const list = ((f && f.activity) || []).map(a => {
        const parts = []
        if (Number(a.distance) > 0) parts.push(a.distance + ' 公里')
        if (Number(a.duration) > 0) parts.push(a.duration + ' 分钟')
        if (Number(a.steps) > 0) parts.push(a.steps + ' 步')
        if (Number(a.calories) > 0) parts.push(a.calories + ' 千卡')
        return {
          id: a._id,
          date: a.date,
          typeName: NAMES[a.type] || a.type,
          detail: parts.join(' · ') || '已记录',
          avgHr: a.avgHr || 0,
          source: a.source || ''
        }
      })
      this.setData({
        loaded: true,
        actionTypes: types,
        typeIndex,
        currentType: cur,
        currentFields: (cur && cur.fields) || [],
        hintText: hintOf(cur),
        activity,
        date: this.data.date || (f && f.latestBody && f.latestBody.date) || '',
        list
      })
    }, () => this.setData({ loaded: true }))
  },

  onType(e) {
    const typeIndex = Number(e.detail.value)
    const cur = this.data.actionTypes[typeIndex]
    if (!cur) return
    const activity = {}
    cur.fields.forEach(f => { activity[f.key] = '' })
    this.setData({
      typeIndex,
      currentType: cur,
      currentFields: cur.fields,
      hintText: hintOf(cur),
      activity
    })
  },

  onInput(e) {
    const key = e.currentTarget.dataset.field
    this.setData({ ['activity.' + key]: e.detail.value })
  },

  onDate(e) {
    this.setData({ date: e.detail.value })
  },

  submit() {
    const cur = this.data.currentType
    if (!cur || !cur.fields) return wx.showToast({ title: '请先选择运动类型', icon: 'none' })
    if (this.data.saving) return
    const a = this.data.activity

    const filled = (cur.required || []).filter(k => Number(a[k]) > 0)
    if (!filled.length) {
      if (cur.strict) {
        const req = cur.fields.find(f => f.required)
        return wx.showToast({ title: '请填写' + (req ? req.label : '必填项'), icon: 'none' })
      }
      const names = (cur.required || []).map(k => {
        const f = cur.fields.find(x => x.key === k)
        return f ? f.label : k
      })
      return wx.showToast({ title: '请至少填写' + names.join('/') + '中的一项', icon: 'none' })
    }

    const payload = { type: cur.key, source: 'self' }
    if (this.data.date) payload.date = this.data.date
    cur.fields.forEach(f => {
      if (String(a[f.key] || '') !== '') payload[f.key] = a[f.key]
    })

    this.setData({ saving: true })
    api.call('saveActivity', payload, { silent: true }).then(() => {
      wx.hideLoading()
      sfx.playSave()
      wx.showToast({ title: '已记录' })
      const activity = {}
      cur.fields.forEach(f => { activity[f.key] = '' })
      this.setData({ saving: false, activity })
      this.load()
    }).catch(err => {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showModal({ title: '保存失败', content: err.message || '请稍后重试', showCancel: false })
    })
    wx.showLoading({ title: '保存中', mask: true })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    wx.showModal({
      title: '删除这条记录',
      content: '确定删除「' + name + '」吗？',
      confirmText: '删除',
      confirmColor: '#e9603a',
      success: r => {
        if (!r.confirm) return
        api.call('deleteActivity', { id }, { silent: true }).then(() => {
          sfx.playDelete()
          wx.showToast({ title: '已删除', icon: 'none' })
          this.load()
        }, err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  }
})
`

// ---------- 2. WXML ----------
const wxml = `<view class="page">
  <view class="section-title">记录运动</view>
  <view class="card">
    <view class="muted" style="margin-bottom:12rpx">
      自己记一次运动。不同类型要填的东西不一样：步行填步数，跑步/骑行/游泳填距离和时长，力量训练和团课填时长。
    </view>

    <view class="form-row">
      <text class="label">运动类型</text>
      <picker range="{{actionTypes}}" range-key="name" value="{{typeIndex}}" bindchange="onType">
        <view class="picker-text">{{currentType ? currentType.name : '请选择'}} ›</view>
      </picker>
    </view>
    <view wx:if="{{currentType && currentType.desc}}" class="muted" style="margin:-4rpx 0 8rpx 0">{{currentType.desc}}</view>

    <view class="form-row">
      <text class="label">日期</text>
      <picker mode="date" value="{{date}}" bindchange="onDate">
        <view class="picker-text">{{date || '今天'}} ›</view>
      </picker>
    </view>

    <view wx:for="{{currentFields}}" wx:key="key" class="form-row">
      <text class="label">{{item.label}}<text wx:if="{{item.required}}" class="req">*</text><text class="unit">（{{item.unit}}）</text></text>
      <input type="{{item.integer ? 'number' : 'digit'}}" value="{{activity[item.key]}}" data-field="{{item.key}}" bindinput="onInput" placeholder="{{item.placeholder}}" />
    </view>

    <button class="btn block mt" bindtap="submit" disabled="{{saving}}">保存这条运动记录</button>
    <view class="muted mt">{{hintText}}</view>
  </view>

  <view class="section-title between">
    <text>我的运动记录</text>
    <text class="muted" wx:if="{{list.length}}">最近 {{list.length}} 次</text>
  </view>
  <view class="card">
    <view wx:if="{{loaded && !list.length}}" class="muted">还没有记录，上面记一条试试</view>
    <view wx:for="{{list}}" wx:key="id" class="list-item">
      <view class="grow">
        <view>{{item.typeName}} <text class="muted">{{item.date}}</text>
          <text wx:if="{{item.source === 'self'}}" class="tag">自己记</text>
        </view>
        <view class="muted">{{item.detail}}</view>
      </view>
      <text wx:if="{{item.avgHr}}" class="tag">{{item.avgHr}} 次/分</text>
      <button class="btn gray sm ml" data-id="{{item.id}}" data-name="{{item.typeName}} {{item.date}}" catchtap="remove">删除</button>
    </view>
  </view>
</view>
`

// ---------- 3. JSON ----------
const json = JSON.stringify({
  navigationBarTitleText: '记录运动',
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
}, null, 2) + '\n'

// ---------- 4. WXSS ----------
const wxss = `/* 记录运动：表单 + 历史 */
.picker-text { color: var(--text); }
`

fs.writeFileSync(dir + '/activity.js', js)
fs.writeFileSync(dir + '/activity.wxml', wxml)
fs.writeFileSync(dir + '/activity.json', json)
fs.writeFileSync(dir + '/activity.wxss', wxss)
console.log('  ✓ 新建 pages/activity/activity（js/wxml/json/wxss）')

require('child_process').execFileSync(process.execPath, ['--check', dir + '/activity.js'])
console.log('  ✓ 语法通过')
