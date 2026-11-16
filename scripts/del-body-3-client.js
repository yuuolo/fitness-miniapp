// 2) 小程序：历史体测可删除 + OCR 后自动保存报告图
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

// ---------- A. 历史列表加删除按钮 ----------
edit('pages/staff/fitness/fitness.wxml', t => {
  if (t.includes('deleteBody')) return t
  const oldRow = `    <view wx:for="{{f.bodyHistory}}" wx:key="_id" class="list-item">
      <view class="grow">
        <view>{{item.date}} <text class="tag">{{item.bmi}} BMI</text></view>
        <view class="muted">评分 {{item.score == null ? '-' : item.score}}{{item.deviceScore ? ' · 设备 ' + item.deviceScore + ' 分' : ''}}</view>
      </view>
      <view class="muted">{{item.weight}} kg · {{item.bodyFat}}%</view>
    </view>`

  const newRow = `    <view wx:for="{{f.bodyHistory}}" wx:key="_id" class="list-item">
      <view class="grow">
        <view>{{item.date}} <text class="tag">{{item.bmi}} BMI</text></view>
        <view class="muted">评分 {{item.score == null ? '-' : item.score}}{{item.deviceScore ? ' · 设备 ' + item.deviceScore + ' 分' : ''}}</view>
      </view>
      <view class="muted">{{item.weight}} kg · {{item.bodyFat}}%</view>
      <button class="btn gray sm ml" data-id="{{item._id}}" data-date="{{item.date}}" catchtap="deleteBody">删除</button>
    </view>`

  if (!t.includes(oldRow)) throw new Error('未找到历史列表行')
  return t.replace(oldRow, newRow)
}, '历史列表加删除按钮')

edit('pages/staff/fitness/fitness.wxss', t => {
  if (t.includes('.btn.sm')) return t
  return t + `
/* 历史记录里的小号删除按钮 */
.btn.sm {
  padding: 0 20rpx;
  height: 52rpx;
  line-height: 52rpx;
  font-size: 24rpx;
  border-radius: var(--r-pill);
  margin-left: 16rpx;
}
`
}, '加小号按钮样式')

edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('deleteBody(')) return t
  return t.replace(
    `  // 按运动类型给出填写提示`,
    `  // 删除一条历史体测（误传时用）
  deleteBody(e) {
    const id = e.currentTarget.dataset.id
    const date = e.currentTarget.dataset.date || ''
    if (!id) return
    wx.showModal({
      title: '删除这条体测记录？',
      content: (date ? date + ' 的记录' : '这条记录') +
        '删除后不能恢复；会员档案里的「最新身体数据」会自动换成剩下最新的一条。',
      confirmText: '删除',
      confirmColor: '#e9603a',
      success: r => {
        if (!r.confirm) return
        api.call('deleteBodyRecord', { id }, { loading: '删除中' }).then(res => {
          wx.showToast({ title: '已删除' })
          this.load()
        }, () => {})
      }
    })
  },

  // 按运动类型给出填写提示`
  )
}, 'js 加删除处理')

// ---------- B. OCR 后自动保存报告图 ----------
edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('reportImage: fileID')) return t
  return t.replace(
    `        api.upload(file.tempFilePath, 'jpg').then(fileID => {
          wx.showLoading({ title: '识别中', mask: true })
          return api.call('ocrBodyReport', { fileID }, { silent: true })
        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
        }).catch(err => {`,
    `        api.upload(file.tempFilePath, 'jpg').then(fileID => {
          // 识别用的这张图，直接存成「体测报告照片」，不用再单独传一次
          this.setData({ 'body.reportImage': fileID })
          wx.showLoading({ title: '识别中', mask: true })
          return api.call('ocrBodyReport', { fileID }, { silent: true })
        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
          const tip = '已识别，报告照片已保存'
          this.setData({
            recognizeMsg: this.data.recognizeMsg ? this.data.recognizeMsg + '；' + tip : tip
          })
        }).catch(err => {`
  )
}, 'OCR 后自动保存报告图')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/staff/fitness/fitness.js'])
console.log('  ✓ 语法通过')
