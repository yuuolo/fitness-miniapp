const api = require('../../../utils/api')

const W = 750
const H = 1200

// 按字符折行，中文按字宽计算
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let cur = ''
  for (const ch of String(text)) {
    if (ch === '\n') {
      lines.push(cur)
      cur = ''
      continue
    }
    const test = cur + ch
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur)
      cur = ch
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// 等比裁剪铺满，避免图片被拉变形
function drawCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.width
  const ih = img.height
  if (!iw || !ih) return
  const scale = Math.max(dw / iw, dh / ih)
  const sw = dw / scale
  const sh = dh / scale
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh)
}

function loadImage(canvas, src) {
  return new Promise(resolve => {
    if (!src) return resolve(null)
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

Page({
  data: { m: null, loaded: false, error: '', isStaff: false },

  onLoad(query) {
    const q = query || {}
    // 判断能否上传静态小程序码（员工/教练才行）
    api.call('home', {}, { silent: true }).then(res => {
      const role = res.me && res.me.role
      this.setData({ isStaff: !!role && role !== 'member' })
    }, () => {})
    // 扫海报上的小程序码进来：scene 形如 s=xxxxxxxxxx
    if (q.scene) {
      const scene = decodeURIComponent(q.scene)
      const short = scene.replace(/^.*?s=/, '')
      if (!short) {
        this.setData({ loaded: true, error: '小程序码无效' })
        return
      }
      api.call('momentByShort', { short }).then(m => {
        this.id = m._id
        this.setData({ m, loaded: true })
        wx.setNavigationBarTitle({ title: m.authorName + ' 的训练记录' })
        this.resolveVideo(m)
      }, err => this.setData({ loaded: true, error: err.message }))
      return
    }
    this.id = q.id
    this.load()
  },

  load() {
    return api.call('momentDetail', { id: this.id }).then(m => {
      this.setData({ m, loaded: true })
      wx.setNavigationBarTitle({ title: m.authorName + ' 的训练记录' })
      this.resolveVideo(m)
    }, err => this.setData({ loaded: true, error: err.message }))
  },

  // 自建后端返回的就是 https 地址，video 组件可以直接用
  resolveVideo(m) {
    const hasVideo = (m.media || []).some(x => x.type === 'video')
    if (!hasVideo) return
    this.setData({
      m: Object.assign({}, m, {
        media: (m.media || []).map(x => x.type === 'video'
          ? Object.assign({}, x, { url: /^https?:\/\//.test(x.fileID) ? x.fileID : '' })
          : x)
      })
    })
  },

  like() {
    const m = this.data.m
    if (!m) return
    api.call('likeMoment', { id: m._id }, { silent: true }).then(r => {
      this.setData({ m: Object.assign({}, m, { liked: r.liked, likeCount: r.likeCount }) })
    }, () => {})
  },

  remove() {
    wx.showModal({
      title: '删除动态',
      content: '删除后其他会员看不到这条动态，确定吗？',
      confirmColor: '#d93a3a',
      success: r => {
        if (!r.confirm) return
        api.call('deleteMoment', { id: this.data.m._id }, { loading: '删除中' }).then(() => {
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 500)
        })
      }
    })
  },

  previewMedia(e) {
    const i = Number(e.currentTarget.dataset.index)
    const md = (this.data.m.media || [])[i]
    if (!md) return
    if (md.type === 'video') {
      wx.previewMedia({ sources: [{ url: md.url || md.fileID, type: 'video' }] })
      return
    }
    wx.previewImage({
      current: md.fileID,
      urls: this.data.m.media.filter(x => x.type === 'image').map(x => x.fileID)
    })
  },

  // ---------- 生成分享海报 ----------

  downloadFile(fileID) {
    return api.download(fileID)
  },

  getQrPath() {
    return api.call('momentPoster', { id: this.id }, { silent: true })
      .then(r => this.downloadFile(r.fileID))
      .catch(() => '')
  },

  getCoverPath() {
    const m = this.data.m
    const list = m.media || []
    const img = list.find(x => x.type === 'image')
    if (img) return this.downloadFile(img.fileID)
    // 只有视频时用发帖时存的封面图
    const vid = list.find(x => x.type === 'video' && x.thumb)
    if (vid) return this.downloadFile(vid.thumb)
    return Promise.resolve('')
  },

  makePoster() {
    if (this.posterBusy) return
    const m = this.data.m
    if (!m) return
    this.posterBusy = true
    wx.showLoading({ title: '生成中', mask: true })

    Promise.all([this.getQrPath(), this.getCoverPath()]).then(([qrPath, coverPath]) => {
      return new Promise((resolve, reject) => {
        wx.createSelectorQuery().in(this).select('#poster')
          .fields({ node: true, size: true })
          .exec(res => {
            const node = res && res[0] && res[0].node
            if (!node) return reject(new Error('画布未就绪，请重试'))
            resolve({ node, qrPath, coverPath })
          })
      })
    }).then(({ node, qrPath, coverPath }) => this.drawPoster(node, m, qrPath, coverPath))
      .catch(err => {
        wx.hideLoading()
        this.posterBusy = false
        wx.showToast({ title: err.message || '生成失败', icon: 'none' })
      })
  },

  async drawPoster(node, m, qrPath, coverPath) {
    const dpr = (wx.getSystemInfoSync().pixelRatio) || 2
    const maxTextWidth = W - 96

    // 先量一遍文字，按内容算海报高度，避免内容少时中间大片空白
    node.width = W * dpr
    node.height = H * dpr
    let ctx = node.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.font = '30px sans-serif'
    const allLines = m.content ? wrapText(ctx, m.content, maxTextWidth) : []
    const shownLines = allLines.slice(0, 6)

    const cover = await loadImage(node, coverPath)
    const coverH = cover ? 430 : 0

    let need = 244                      // 标题 + 作者 + 分割线
    if (m.coachName) need += 40
    if (shownLines.length) need += shownLines.length * 46 + 40
    if (coverH) need += coverH + 24
    need += 250                         // 底部区
    const ph = Math.max(760, Math.round(need))

    node.width = W * dpr
    node.height = ph * dpr
    ctx = node.getContext('2d')
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, ph)
    ctx.fillStyle = '#ff6a3d'
    ctx.fillRect(0, 0, W, 10)

    ctx.fillStyle = '#1f2329'
    ctx.font = 'bold 40px sans-serif'
    ctx.fillText('健身友圈', 48, 92)

    ctx.font = '30px sans-serif'
    ctx.fillText(m.authorName, 48, 152)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#8a8f99'
    const dateText = m.date || ''
    const dw = ctx.measureText(dateText).width
    ctx.fillText(dateText, W - 48 - dw, 150)

    let y = 196
    if (m.coachName) {
      ctx.font = '24px sans-serif'
      ctx.fillStyle = '#ff6a3d'
      ctx.fillText('教练 ' + m.coachName + ' 代拍', 48, y)
      y += 40
    }

    ctx.strokeStyle = '#f0f1f4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(48, y)
    ctx.lineTo(W - 48, y)
    ctx.stroke()
    y += 48

    if (shownLines.length) {
      ctx.fillStyle = '#1f2329'
      ctx.font = '30px sans-serif'
      shownLines.forEach((ln, i) => ctx.fillText(ln, 48, y + i * 46))
      y += shownLines.length * 46
      if (allLines.length > 6) {
        ctx.fillStyle = '#8a8f99'
        ctx.fillText('…', 48, y + 26)
      }
      y += 40
    }

    if (cover) {
      drawCover(ctx, cover, 48, y, W - 96, coverH)
      y += coverH + 24
    }

    const qr = await loadImage(node, qrPath)
    const footY = ph - 230
    ctx.strokeStyle = '#f0f1f4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(48, footY)
    ctx.lineTo(W - 48, footY)
    ctx.stroke()

    // 有码说扫码，没码说打开小程序，只画一行，不能两个分支都画
    ctx.fillStyle = '#1f2329'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText(qr ? '扫码查看我的训练记录' : '打开小程序查看我的训练记录', 48, footY + 72)

    ctx.fillStyle = '#8a8f99'
    ctx.font = '24px sans-serif'
    ctx.fillText('♥ ' + (m.likeCount || 0) + ' 人点赞', 48, footY + 116)

    const qs = 160
    const qx = W - 48 - qs
    const qy = ph - 48 - qs
    if (qr) {
      ctx.drawImage(qr, qx, qy, qs, qs)
    } else {
      // 个人主体未认证时拿不到小程序码，退化成文字引导
      ctx.strokeStyle = '#e6e9ee'
      ctx.lineWidth = 2
      ctx.strokeRect(qx, qy, qs, qs)
      ctx.fillStyle = '#8a8f99'
      ctx.font = '22px sans-serif'
      ctx.fillText('微信搜一搜', qx + 34, qy + 66)
      ctx.fillText('打开小程序', qx + 34, qy + 102)
    }

    wx.canvasToTempFilePath({
      canvas: node,
      success: res => {
        wx.hideLoading()
        this.saveToAlbum(res.tempFilePath)
      },
      fail: () => {
        wx.hideLoading()
        this.posterBusy = false
        wx.showToast({ title: '导出图片失败', icon: 'none' })
      }
    })
  },

  // 个人主体未认证拿不到动态小程序码，管理员可以传一张静态码兜底
  uploadPosterQr() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: res => {
        const f = (res.tempFiles || [])[0]
        if (!f) return
        wx.showLoading({ title: '上传中', mask: true })
        const ext = (f.tempFilePath.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]
        api.upload(f.tempFilePath, ext).then(fileID => {
          return api.call('setPosterQr', { fileID }, { silent: true }).then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已设置为海报小程序码' })
          }, err => {
            wx.hideLoading()
            wx.showToast({ title: err.message || '设置失败', icon: 'none' })
          })
        }, () => {
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        })
      }
    })
  },

  saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        this.posterBusy = false
        wx.showModal({
          title: '已保存到相册',
          content: '打开朋友圈 → 从相册选这张图发送即可。小程序不能直接替你发朋友圈，只能这样两步。',
          showCancel: false
        })
      },
      fail: err => {
        this.posterBusy = false
        const msg = String((err && err.errMsg) || '')
        if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存海报需要「保存到相册」权限，去设置里打开。',
            confirmText: '去设置',
            success: r => { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  onShareAppMessage() {
    const m = this.data.m
    return {
      title: m ? (m.authorName + '：' + (m.content || '训练记录')) : '健身友圈',
      path: '/pages/moments/detail/detail?id=' + this.id,
      imageUrl: m && m.media && m.media[0] && m.media[0].type === 'image' ? m.media[0].fileID : ''
    }
  },

  onShareTimeline() {
    const m = this.data.m
    return {
      title: m ? (m.authorName + '：' + (m.content || '训练记录')) : '健身友圈',
      query: 'id=' + this.id
    }
  }
})
