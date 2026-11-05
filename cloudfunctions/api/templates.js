// 订阅消息模板配置
// 在小程序后台「功能 → 订阅消息」选用模板后，把模板 ID 填到 id，
// 并按模板详情里的字段名（如 thing1、time2）修改 fields。id 留空则不发送该类消息。
// 小程序端 miniprogram/config.js 里要填同样的模板 ID，用于向会员申请授权。
module.exports = {
  // 体验版填 trial，正式发布后改成 formal，开发版调试用 developer
  miniprogramState: 'trial',

  // 预约成功（团课、私教、娱乐项目）
  bookingSuccess: {
    id: '',
    page: 'pages/bookings/bookings',
    fields: v => ({ thing1: v.title, time2: v.time, thing3: v.place })
  },

  // 开课前 2 小时提醒
  classReminder: {
    id: '',
    page: 'pages/bookings/bookings',
    fields: v => ({ thing1: v.title, time2: v.time, thing3: v.place })
  },

  // 会员卡 3 天内到期提醒
  cardExpire: {
    id: '',
    page: 'pages/cards/cards',
    fields: v => ({ thing1: v.cardName, date2: v.expireDate, thing3: v.tip })
  }
}
