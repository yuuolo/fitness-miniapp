// 小程序：力量成绩可删（管理员）+ 会员自己录运动的新页面
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

// ---------- 1. 员工端：力量成绩历史加删除按钮（仅管理员） ----------
edit('pages/staff/fitness/fitness.wxml', t => {
  const from = `      <view wx:for="{{strengthList}}" wx:key="id" class="list-item">
        <view class="grow">
          <view>{{item.liftName}} <text class="muted">{{item.date}}</text></view>
          <view class="muted">{{item.weight}} kg × {{item.reps}} 次 → 约 {{item.oneRM}} kg</view>
        </view>
        <text wx:if="{{item.isBest}}" class="tag orange">最好</text>
      </view>`
  const to = `      <view wx:for="{{strengthList}}" wx:key="id" class="list-item">
        <view class="grow">
          <view>{{item.liftName}} <text class="muted">{{item.date}}</text></view>
          <view class="muted">{{item.weight}} kg × {{item.reps}} 次 → 约 {{item.oneRM}} kg</view>
        </view>
        <text wx:if="{{item.isBest}}" class="tag orange">最好</text>
        <button wx:if="{{f.canManageStrength}}" class="btn gray sm ml" data-id="{{item.id}}"
          data-name="{{item.liftName}}" data-info="{{item.weight}} 公斤 × {{item.reps}} 次"
          catchtap="deleteStrength">删除</button>
      </view>
      <view wx:if="{{f.canManageStrength && strengthList.length}}" class="muted mt-sm">
        录错了可以直接删掉，最好成绩和评分会自动重算
      </view>`
  if (!t.includes(from)) throw new Error('找不到力量历史行')
  return t.replace(from, to)
}, '力量历史加删除按钮')

edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('deleteStrength(')) return t
  return t.replace(
    `  deleteBody(e) {`,
    `  // 删除一条力量成绩（管理员）：录错时用，删完自动重算最好成绩与评分
  deleteStrength(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '这条成绩'
    const info = e.currentTarget.dataset.info || ''
    wx.showModal({
      title: '删除力量成绩',
      content: '确定删除「' + name + ' ' + info + '」吗？删除后最好成绩和身体评分会自动重算。',
      confirmText: '删除',
      confirmColor: '#e9603a',
      success: r => {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        api.call('deleteStrength', { id }, { silent: true }).then(res => {
          wx.hideLoading()
          sfx.playDelete()
          wx.showToast({ title: '已删除', icon: 'none' })
          if (res && res.sbdTotal !== undefined) {
            wx.showModal({
              title: '已重算',
              content: '三项合计现在是 ' + res.sbdTotal + ' kg，身体评分 ' +
                (res.bodyScore == null ? '-' : res.bodyScore) + ' 分。',
              showCancel: false
            })
          }
          this.load()
        }).catch(err => {
          wx.hideLoading()
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        })
      }
    })
  },

  deleteBody(e) {`
  )
}, '力量删除方法')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/fitness/fitness.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
