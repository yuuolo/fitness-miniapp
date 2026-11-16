// 2) 身体数据历史：点一条可以看对应的报告图
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

// ---------- A. 员工端体测页 ----------
edit('pages/staff/fitness/fitness.wxml', t => {
  if (t.includes('previewBodyImage')) return t
  const old = `    <view wx:for="{{f.bodyHistory}}" wx:key="_id" class="list-item">
      <view class="grow">
        <view>{{item.date}} <text class="tag">{{item.bmi}} BMI</text></view>
        <view class="muted">评分 {{item.score == null ? '-' : item.score}}{{item.deviceScore ? ' · 设备 ' + item.deviceScore + ' 分' : ''}}</view>
      </view>
      <view class="muted">{{item.weight}} kg · {{item.bodyFat}}%</view>
      <button class="btn gray sm ml" data-id="{{item._id}}" data-date="{{item.date}}" catchtap="deleteBody">删除</button>
    </view>`
  const neu = `    <view wx:for="{{f.bodyHistory}}" wx:key="_id" class="list-item"
      data-src="{{item.reportImage}}" data-date="{{item.date}}" bindtap="previewBodyImage">
      <view class="grow">
        <view>{{item.date}} <text class="tag">{{item.bmi}} BMI</text><text wx:if="{{item.reportImage}}" class="tag orange">有报告图</text></view>
        <view class="muted">评分 {{item.score == null ? '-' : item.score}}{{item.deviceScore ? ' · 设备 ' + item.deviceScore + ' 分' : ''}}</view>
      </view>
      <view class="muted">{{item.weight}} kg · {{item.bodyFat}}%</view>
      <button class="btn gray sm ml" data-id="{{item._id}}" data-date="{{item.date}}" catchtap="deleteBody">删除</button>
    </view>
    <view class="muted mt-sm">点某一条可以看当时保存的体测报告图</view>`
  if (!t.includes(old)) throw new Error('未找到身体数据历史行')
  return t.replace(old, neu)
}, '员工端历史行可点开报告图')

edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('previewBodyImage(')) return t
  return t.replace(
    `  // 报告图：点击全屏查看（和看相册里的图一样）`,
    `  // 点历史记录：看当时保存的体测报告图
  previewBodyImage(e) {
    const src = e.currentTarget.dataset.src
    const date = e.currentTarget.dataset.date || ''
    if (!src) {
      wx.showToast({ title: (date ? date + ' ' : '') + '这条没有报告图', icon: 'none' })
      return
    }
    wx.previewImage({ current: src, urls: [src] })
  },

  // 报告图：点击全屏查看（和看相册里的图一样）`
  )
}, '员工端历史预览方法')

// ---------- B. 会员公开资料页 ----------
edit('pages/member/member.js', t => {
  if (t.includes('reportImage: b.reportImage')) return t
  return t.replace(
    `          score: b.score == null ? '-' : b.score
        })),`,
    `          score: b.score == null ? '-' : b.score,
          reportImage: b.reportImage || ''
        })),`
  )
}, '资料页历史带报告图字段')

edit('pages/member/member.wxml', t => {
  if (t.includes('previewReport')) return t
  const old = `        <view wx:for="{{bodyList}}" wx:key="id" wx:if="{{showAllHistory || index < 5}}" class="list-item">
          <view class="grow">
            <view class="title-sm">{{item.date}}</view>
            <view class="muted">体重 {{item.weight}}kg · 体脂 {{item.bodyFat}}% · 肌肉 {{item.muscle}}kg</view>
          </view>
          <text class="tag orange">{{item.score}} 分</text>
        </view>`
  const neu = `        <view wx:for="{{bodyList}}" wx:key="id" wx:if="{{showAllHistory || index < 5}}" class="list-item"
          data-src="{{item.reportImage}}" bindtap="previewReport">
          <view class="grow">
            <view class="title-sm">{{item.date}}<text wx:if="{{item.reportImage}}" class="tag orange">报告图</text></view>
            <view class="muted">体重 {{item.weight}}kg · 体脂 {{item.bodyFat}}% · 肌肉 {{item.muscle}}kg</view>
          </view>
          <text class="tag orange">{{item.score}} 分</text>
        </view>`
  if (!t.includes(old)) throw new Error('未找到资料页历史行')
  return t.replace(old, neu)
}, '资料页历史可点开报告图')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/fitness/fitness.js', 'pages/member/member.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
