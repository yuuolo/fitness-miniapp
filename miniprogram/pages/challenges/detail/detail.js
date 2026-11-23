// 挑战详情：双方信息 + 视频 + 裁判判定与理由 + 各角色可做的操作
const api = require('../../../utils/api')
const sfx = require('../../../utils/sfx')
const subscribe = require('../../../utils/subscribe')

function countdown(ts) {
  const left = Number(ts) - Date.now()
  if (!ts || left <= 0) return ''
  const m = Math.floor(left / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? h + ' 小时 ' + (m % 60) + ' 分' : Math.max(1, m) + ' 分钟'
}

Page({
  data: {
    id: '',
    c: null,
    sides: [],
    loaded: false,
    countdownText: '',
    // 裁判判定面板
    judgeOpen: false,
    judgeResult: '',
    judgeNote: '',
    cheatOpenid: '',
    results: [
      { key: 'win_challenger', name: '发起方胜' },
      { key: 'win_opponent', name: '应战方胜' },
      { key: 'draw', name: '平局' }
    ],
    // 重新选裁判
    referees: [],
    refereeOpen: false,
    // 评论
    commentText: '',
    sending: false
  },

  onLoad(query) {
    const id = (query || {}).id || ''
    this.setData({ id })
    this.load()
    this.timer = setInterval(() => this.refresh(), 30000)
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  refresh() {
    if (!this.data.c) return
    this.setData({ countdownText: countdown(this.data.c.deadline) })
  },

  load() {
    return api.call('challengeDetail', { id: this.data.id }, { silent: true }).then(c => {
      this.setData({
        c,
        sides: this.buildSides(c),
        loaded: true,
        countdownText: countdown(c.deadline)
      })
      wx.setNavigationBarTitle({ title: c.liftName + ' · 挑战' })
    }, err => {
      this.setData({ loaded: true })
      wx.showModal({ title: '加载失败', content: err.message || '挑战不存在', showCancel: false })
    })
  },

  // ---------- 应战 / 拒绝 / 否决裁判 ----------
  respond(e) {
    const decision = e.currentTarget.dataset.decision
    const vetoReferee = e.currentTarget.dataset.veto === '1'
    const text = decision === 'decline' ? '确定拒绝这场挑战？'
      : (vetoReferee ? '应战并否决赛判？发起人会重新选裁判。' : '确定应战？记得 2 小时内上传视频。')
    wx.showModal({
      title: decision === 'decline' ? '拒绝挑战' : '应战',
      content: text,
      success: r => {
        if (!r.confirm) return
        subscribe.requestSync(['invite', 'start', 'result'])
          .then(() => api.call('respondChallenge', { id: this.data.id, decision, vetoReferee }, { loading: '处理中' }))
          .then(() => { sfx.playSave(); this.load() })
          .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      }
    })
  },

  // ---------- 裁判接单 / 拒绝 ----------
  refereeAct(e) {
    const decision = e.currentTarget.dataset.decision
    subscribe.requestSync(['invite', 'start', 'result'])
      .then(() => api.call('refereeRespond', { id: this.data.id, decision }, { loading: '处理中' }))
      .then(() => this.load())
      .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  // ---------- 发起人重选裁判 ----------
  toggleRefereePicker() {
    const open = !this.data.refereeOpen
    this.setData({ refereeOpen: open })
    if (open && !this.data.referees.length) {
      api.call('refereeOptions', {}, { silent: true }).then(list => this.setData({ referees: list || [] }), () => {})
    }
  },
  pickReferee(e) {
    const r = this.data.referees[Number(e.currentTarget.dataset.index)]
    if (!r) return
    api.call('pickReferee', { id: this.data.id, referee: r._id }, { loading: '处理中' })
      .then(() => this.setData({ refereeOpen: false }), () => {}).then(() => this.load())
  },

  // 把「双方视频」整理成两列（发起方 / 应战方），供页面渲染
  buildSides(c) {
    if (!c) return []
    const limit = c.videoLimit || 9
    const open = ['accepted', 'waiting_referee', 'ready'].indexOf(c.status) >= 0
    const all = c.videos || []
    const isRef = !!c.isReferee || !!c.canProxyVideo

    const mk = person => {
      const videos = all.filter(v => v.openid === person.openid).map(v => Object.assign({}, v, {
        // 本人可删自己的，裁判可删任意（已判定后只有管理员能删，服务端会再校验）
        canDelete: !!(person.isMe || isRef),
        uploadedByName: v.uploadedBy === c.referee.openid
          ? '裁判代传'
          : (v.uploadedBy === person.openid ? '本人上传' : '')
      }))
      const isMeSide = !!person.isMe
      return {
        openid: person.openid,
        name: person.name,
        isMe: isMeSide,
        videos,
        count: videos.length,
        canUpload: open && (isMeSide || isRef) && videos.length < limit,
        // 裁判给双方代传时按钮写成「代传视频」
        proxy: isRef && !isMeSide
      }
    }
    return [mk(c.challenger), mk(c.opponent)]
  },

  // ---------- 上传视频（可多段，每方最多 9 段；裁判可代传） ----------
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

  // 读取上传限制（只拉一次）
  checkUploadLimits() {
    if (this._limits) return Promise.resolve(this._limits)
    return api.call('uploadLimits', {}, { silent: true }).then(v => {
      this._limits = v || {}
      return this._limits
    }, () => ({}))
  },

  // 上传前检查体积/时长，避免白传几十兆再失败
  precheckVideo(file) {
    return this.checkUploadLimits().then(limits => {
      const maxRaw = Number(limits.maxRawVideoMB) || 0
      const sizeMB = file.size ? file.size / 1024 / 1024 : 0
      if (maxRaw > 0 && sizeMB > maxRaw) {
        return {
          ok: false,
          msg: '这个视频 ' + sizeMB.toFixed(1) + ' MB，超过单次上传上限 ' + maxRaw +
            ' MB。请在相册里裁剪短一点，或换成清晰度更低的版本再传。'
        }
      }
      const maxDuration = Number(limits.maxDuration) || 0
      if (maxDuration > 0 && file.duration && file.duration > maxDuration + 1) {
        // 超时长服务端会自动裁切，只提示不阻止
        wx.showToast({ title: '超时长会自动裁到 ' + maxDuration + ' 秒', icon: 'none' })
      }
      return { ok: true }
    })
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
    this.precheckVideo(file).then(chk => {
      if (chk && chk.ok === false) {
        wx.hideLoading()
        wx.showModal({ title: '视频太大', content: chk.msg, showCancel: false })
        return
      }
      this.doUploadOne(file, sideOpenid, files, index)
    })
  },

  // 单个文件上传（失败重试一次）
  doUploadOne(file, sideOpenid, files, index, isRetry) {
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
      // 每个文件最多自动重试一次（网络抖动很常见）
      if (!isRetry) {
        wx.showToast({ title: '网络不稳，重试中…', icon: 'none' })
        return this.doUploadOne(file, sideOpenid, files, index, true)
      }
      wx.hideLoading()
      wx.showModal({
        title: '视频上传失败',
        content: (err.message || '请稍后重试') +
          (files.length > 1 ? '（已成功 ' + index + '/' + files.length + ' 段）' : ''),
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

  // ---------- 裁判判定 ----------
  openJudge() {
    const c = this.data.c
    this.setData({
      judgeOpen: !this.data.judgeOpen,
      judgeResult: c.judgeResult || '',
      judgeNote: c.judgeNote || '',
      cheatOpenid: ''
    })
  },
  pickResult(e) {
    this.setData({ judgeResult: e.currentTarget.dataset.key })
  },
  onNote(e) {
    this.setData({ judgeNote: e.detail.value })
  },
  pickCheat(e) {
    const openid = e.currentTarget.dataset.openid
    this.setData({ cheatOpenid: this.data.cheatOpenid === openid ? '' : openid })
  },
  submitJudge() {
    const { judgeResult, judgeNote, cheatOpenid } = this.data
    if (!judgeResult) return wx.showToast({ title: '先选判定结果', icon: 'none' })
    const c = this.data.c
    const cheatName = cheatOpenid === c.challenger.openid ? c.challenger.name : c.opponent.name
    wx.showModal({
      title: '确认判定',
      content: (cheatOpenid ? '将标记「' + cheatName + '」视频作弊（判负 + 禁赛），' : '') +
        '判定后 3 小时内可改判。',
      success: r => {
        if (!r.confirm) return
        api.call('judgeChallenge', {
          id: this.data.id, result: judgeResult, note: judgeNote, cheatOpenid
        }, { loading: '提交中' }).then(() => {
          sfx.playSave()
          this.setData({ judgeOpen: false })
          wx.showToast({ title: '已判定' })
          this.load()
        }).catch(err => wx.showModal({ title: '判定失败', content: err.message || '', showCancel: false }))
      }
    })
  },

  // ---------- 评论 ----------
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  sendComment() {
    const content = String(this.data.commentText || '').trim()
    if (!content || this.data.sending) return
    this.setData({ sending: true })
    api.call('commentChallenge', { id: this.data.id, content }, { silent: true }).then(() => {
      this.setData({ commentText: '', sending: false })
      this.load()
    }, err => {
      this.setData({ sending: false })
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    })
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    api.call('likeChallengeComment', { id }, { silent: true }).then(list => {
      const c = Object.assign({}, this.data.c, {
        comments: list,
        commentCount: (list || []).length
      })
      this.setData({ c })
    }, err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论？',
      success: r => {
        if (!r.confirm) return
        api.call('deleteChallengeComment', { id }, { silent: true }).then(list => {
          const c = Object.assign({}, this.data.c, {
            comments: list,
            commentCount: (list || []).length
          })
          this.setData({ c })
        }, err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  },

  // ---------- 分享 ----------
  onShareAppMessage() {
    const c = this.data.c
    return {
      title: c ? c.challenger.name + ' VS ' + c.opponent.name + ' · ' + c.liftName + '挑战' : '会员挑战',
      path: '/pages/challenges/detail/detail?id=' + this.data.id
    }
  }
})
