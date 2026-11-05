const api = require('../../utils/api')
const fmt = require('../../utils/format')

const REFRESH_SECONDS = 30

Page({
  data: { image: '', error: '', cardName: '', cardInfo: '', countdown: REFRESH_SECONDS },

  onShow() {
    this.refresh()
    this.timer = setInterval(() => this.tick(), 1000)
  },

  onHide() {
    this.stop()
  },

  onUnload() {
    this.stop()
  },

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  tick() {
    const left = this.data.countdown - 1
    if (left <= 0) this.refresh()
    else this.setData({ countdown: left })
  },

  refresh() {
    this.setData({ countdown: REFRESH_SECONDS })
    return api.call('entryCode', {}, { silent: true }).then(res => {
      this.setData({
        image: res.image,
        error: '',
        cardName: res.cardName,
        cardInfo: fmt.decorateCard({ kind: res.kind, remainTimes: res.remainTimes, expireAt: res.expireAt }).summary
      })
    }, err => {
      this.stop()
      this.setData({ image: '', error: err.message })
    })
  }
})
