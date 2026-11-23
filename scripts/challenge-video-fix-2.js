// 详情页：多视频上传（≤9）+ 裁判代传 + 删除视频
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

// ---------- 1. detail.js：替换上传逻辑 ----------
edit('pages/challenges/detail/detail.js', t => {
  const start = t.indexOf('  // ---------- 上传视频（走 /api/video，自动裁切） ----------')
  const end = t.indexOf('  // ---------- 裁判判定 ----------')
  if (start < 0 || end < 0) {
    console.log('  [!] 找不到上传区块')
    return t
  }
  const block = `  // ---------- 上传视频（可多段，每方最多 9 段；裁判可代传） ----------
  // data-forOpenid 传了就是裁判代传：值是该方 openid
  uploadVideo(e) {
    const c = this.data.c
    if (!c) return
    const forOpenid = (e && e.currentTarget && e.currentTarget.dataset.forOpenid) || ''
    const sideOpenid = forOpenid || this.mySideOpenid()
    if (!sideOpenid) return
    const existing = (c.videos || []).filter(v => v.openid === sideOpenid).length
    const left = Math.max(0, (c.videoLimit || 9) - existing)
    if (!left) {
      wx.showModal({ title: '已达上限', content: '每方最多 ' + (c.videoLimit || 9) + ' 段视频，先删掉一些再传。', showCancel: false })
      return
    }
    wx.chooseMedia({
      count: left,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      camera: 'back',
      success: res => {
        const files = res.tempFiles || []
        if (!files.length) return
        this.uploadQueue(files, sideOpenid, 0)
      }
    })
  },

  // 我自己是发起方还是应战方
  mySideOpenid() {
    const c = this.data.c
    if (!c) return ''
    if (c.challenger.isMe) return c.challenger.openid
    if (c.opponent.isMe) return c.opponent.openid
    return ''
  },

  // 按顺序逐个上传（微信 uploadFile 同时只能一个，避免抢带宽）
  uploadQueue(files, sideOpenid, index) {
    if (index >= files.length) {
      wx.hideLoading()
      sfx.playSave()
      wx.showToast({ title: '已上传 ' + files.length + ' 段视频' })
      this.load()
      return
    }
    const file = files[index]
    wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + files.length, mask: true })
    const payload = { id: this.data.id, videoUrl: '' }
    if (sideOpenid) payload.forOpenid = sideOpenid
    api.uploadVideo(file.tempFilePath).then(v => {
      payload.videoUrl = v.fileID
      return api.call('submitChallengeVideo', payload, { silent: true }).then(() => {
        if (v.trimmed) {
          wx.showToast({ title: '第 ' + (index + 1) + ' 段按设定裁到 ' + v.keptSeconds + ' 秒', icon: 'none' })
        }
        this.uploadQueue(files, sideOpenid, index + 1)
      })
    }).catch(err => {
      wx.hideLoading()
      wx.showModal({
        title: '视频提交失败',
        content: (err.message || '请稍后重试') + (index + 1 < files.length ? '（已成功 ' + index + ' 段）' : ''),
        showCancel: false
      })
      if (index > 0) this.load()
    })
  },

  // 删除一段视频（本人可删自己的，裁判可删任意）
  deleteVideo(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除视频',
      content: '确定删除这段视频？',
      success: r => {
        if (!r.confirm) return
        api.call('deleteChallengeVideo', { id }, { loading: '删除中' })
          .then(() => this.load())
          .catch(err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  },

  playVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const c = this.data.c
    const list = (c && c.videos) || []
    const sources = list.map(v => ({ url: v.videoUrl, type: 'video' }))
    const idx = Math.max(0, list.findIndex(v => v.videoUrl === url))
    wx.previewMedia({ sources: sources.length ? sources : [{ url, type: 'video' }], current: idx })
  },

`
  return t.slice(0, start) + block + t.slice(end)
}, 'detail.js：多视频上传 + 裁判代传 + 删除')

// ---------- 2. detail.wxml：视频区重做 ----------
edit('pages/challenges/detail/detail.wxml', t => {
  const start = t.indexOf('    <!-- 双方视频 -->')
  const end = t.indexOf('    <!-- 待我处理 -->')
  if (start < 0 || end < 0) {
    console.log('  [!] 找不到视频区块')
    return t
  }
  const block = `    <!-- 双方视频（每方最多 9 段） -->
    <view class="section-title">挑战视频</view>
    <view class="card">
      <block wx:for="{{sides}}" wx:key="openid">
        <view class="video-block">
          <view class="between video-head">
            <view class="row" style="gap:10rpx;align-items:center">
              <text class="video-side-name">{{item.name}}</text>
              <text class="muted">{{item.count}}/{{c.videoLimit}} 段</text>
            </view>
            <text wx:if="{{item.canUpload}}" class="video-add" data-for-openid="{{item.proxy ? item.openid : ''}}"
              bindtap="uploadVideo">{{item.proxy ? '代传视频' : '＋ 上传'}}</text>
          </view>

          <view wx:if="{{!item.videos.length}}" class="muted video-empty">还没有上传</view>
          <view wx:else class="video-grid">
            <view wx:for="{{item.videos}}" wx:for-item="v" wx:key="_id" class="video-cell {{v.cheatFlag ? 'cheat' : ''}}">
              <view class="video-box" data-url="{{v.videoUrl}}" bindtap="playVideo">
                <text class="video-play">▶</text>
                <text wx:if="{{v.cheatFlag}}" class="cheat-tag">作弊</text>
              </view>
              <view class="between video-meta">
                <text class="muted">{{v.uploadedByName || ''}}</text>
                <text wx:if="{{v.canDelete}}" class="op-del" data-id="{{v._id}}" catchtap="deleteVideo">删除</text>
              </view>
            </view>
          </view>
        </view>
      </block>

      <view wx:if="{{c.canSubmitVideo || c.canProxyVideo}}" class="muted mt">
        每方最多 {{c.videoLimit}} 段视频，视频限制按管理页设定，超时长会自动裁切。
      </view>
    </view>

`
  return t.slice(0, start) + block + t.slice(end)
}, 'detail.wxml：视频列表 + 代传')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/challenges/detail/detail.js'])
console.log('  ✓ 语法通过')
