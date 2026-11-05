const api = require('../../utils/api')
const fmt = require('../../utils/format')
const sub = require('../../utils/subscribe')
const config = require('../../config')

Page({
  data: { cards: [], types: [], loaded: false, canRemind: sub.enabled('cardExpire') },

  // 每次授权只能收到一条消息，所以放一个按钮让会员随时开启
  remind() {
    sub.subscribe(['cardExpire']).then(res => {
      wx.showToast({ title: res[config.templates.cardExpire] === 'accept' ? '到期前 3 天会提醒你' : '未开启提醒', icon: 'none' })
    })
  },

  onShow() {
    api.call('myCards').then(res => {
      this.setData({
        loaded: true,
        cards: res.cards.map(fmt.decorateCard),
        types: res.types.map(t => Object.assign(t, {
          kindName: fmt.CARD_KINDS[t.kind],
          priceText: fmt.yuan(t.price),
          rule: t.kind === 'period' ? t.days + ' 天不限次' : t.times + ' 次 · ' + t.days + ' 天有效'
        }))
      })
    })
  }
})
