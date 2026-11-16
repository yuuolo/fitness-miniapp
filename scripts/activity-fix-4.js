// 员工端体测页：运动表单按类型动态显示字段
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

function edit(rel, fn) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    console.log('  ✓ ' + rel)
  } else {
    console.log('  [!] 无变化 ' + rel)
  }
}

// ---------- wxml ----------
edit('pages/staff/fitness/fitness.wxml', t => {
  const oldBlock = `  <view class="section-title">录入运动数据</view>
  <view class="card">
    <view class="form-row">
      <text class="label">类型</text>
      <picker range="{{actionTypes}}" range-key="name" value="{{typeIndex}}" bindchange="onType">
        <view class="picker-text">{{actionTypes[typeIndex].name}} ›</view>
      </picker>
    </view>
    <view class="form-row"><text class="label">步数</text><input type="number" value="{{activity.steps}}" data-field="steps" bindinput="onActivityInput" placeholder="选填" /></view>
    <view class="form-row"><text class="label">时长(分钟)</text><input type="number" value="{{activity.duration}}" data-field="duration" bindinput="onActivityInput" placeholder="选填" /></view>
    <view class="form-row"><text class="label">消耗(千卡)</text><input type="number" value="{{activity.calories}}" data-field="calories" bindinput="onActivityInput" placeholder="选填" /></view>
    <view class="form-row"><text class="label">平均心率</text><input type="number" value="{{activity.avgHr}}" data-field="avgHr" bindinput="onActivityInput" placeholder="选填" /></view>
    <button class="btn block mt" bindtap="submitActivity">保存运动数据</button>
  </view>`

  const newBlock = `  <view class="section-title between">
    <text>记录运动</text>
    <text class="muted" wx:if="{{actDate}}">{{actDate}}</text>
  </view>
  <view class="card">
    <view class="muted" style="margin-bottom:12rpx">
      记一次这个会员当天做的运动。不同类型的运动要填的东西不一样：
      步行填步数，骑行/跑步/游泳填距离和时长，力量训练和团课填时长。
    </view>

    <view class="form-row">
      <text class="label">运动类型</text>
      <picker range="{{actionTypes}}" range-key="name" value="{{typeIndex}}" bindchange="onType">
        <view class="picker-text">{{actionTypes[typeIndex].name}} ›</view>
      </picker>
    </view>
    <view wx:if="{{currentType.desc}}" class="muted" style="margin:-4rpx 0 8rpx 0">{{currentType.desc}}</view>

    <view wx:for="{{currentFields}}" wx:key="key" class="form-row">
      <text class="label">{{item.label}}<text wx:if="{{item.required}}" class="req">*</text><text class="unit">（{{item.unit}}）</text></text>
      <input type="{{item.integer ? 'number' : 'digit'}}" value="{{activity[item.key]}}" data-field="{{item.key}}" bindinput="onActivityInput" placeholder="{{item.placeholder}}" />
    </view>

    <button class="btn block mt" bindtap="submitActivity">保存这条运动记录</button>
    <view class="muted mt">{{hintText}}</view>
  </view>`

  if (t.includes('currentFields')) return t
  if (!t.includes(oldBlock)) throw new Error('未找到原运动表单')
  return t.replace(oldBlock, newBlock)
})

// ---------- js ----------
edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('currentFields')) return t

  // data 增加字段
  t = t.replace(
    '    activity: EMPTY_ACTIVITY',
    `    activity: EMPTY_ACTIVITY,
    currentType: null,
    currentFields: [],
    hintText: '',
    actDate: ''`
  )

  // load 里根据返回的 actionTypes 初始化字段
  t = t.replace(
    '        bestList: (f.lifts || []).map(l => {',
    `        currentType: cur,
        currentFields: cur.fields,
        hintText: hintOf(cur),
        actDate: '今天 ' + (f.today || ''),
        bestList: (f.lifts || []).map(l => {`
  )

  // 在 load 开头算 cur（actionTypes 可能来自服务端，退化成默认 7 类）
  t = t.replace(
    `  load() {
    return api.call('memberFitness', { openid: this.data.id }).then(f => {`,
    `  load() {
    return api.call('memberFitness', { openid: this.data.id }).then(f => {
      const types = (f && f.actionTypes && f.actionTypes.length) ? f.actionTypes : []
      const typeIndex = Math.min(this.data.typeIndex, Math.max(0, types.length - 1))
      const cur = types[typeIndex] || { name: '', desc: '', fields: [], strict: false, required: [] }
      this.actionTypes = types`
  )

  // onType：切换类型时清空不适用的字段
  t = t.replace(
    `  onType(e) {`,
    `  onType(e) {`
  )

  // 加 hintOf 与切换处理（放到文件末尾前）
  return t
})

// ---------- 追加 onType 逻辑与 hintOf ----------
{
  const p = MP + '/pages/staff/fitness/fitness.js'
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')

  // 老 onType 实现替换（切类型时重置表单字段）
  t = t.replace(
    /  onType\(e\) \{[\s\S]*?\n  \},/,
    `  onType(e) {
    const typeIndex = Number(e.detail.value)
    const types = this.actionTypes || this.data.actionTypes || []
    const cur = types[typeIndex]
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
  },`
  )

  // hintOf 放在 Page({ 之前
  if (!t.includes('function hintOf(')) {
    t = t.replace('Page({', `// 按运动类型给出填写提示
function hintOf(type) {
  if (!type || !type.fields) return ''
  const names = type.fields.map(f => f.label + '(' + f.unit + ')')
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

Page({`)
  }

  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  require('child_process').execFileSync(process.execPath, ['--check', p])
  console.log('  ✓ pages/staff/fitness/fitness.js 语法通过')
}
