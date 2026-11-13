// 订阅消息模板：模板 ID 由环境变量提供（小程序后台「功能 → 订阅消息」选用）
// 留空则不发送该类消息，与云开发版本行为一致。
const state = process.env.WX_MP_STATE || 'trial'
const id = name => process.env['WX_TPL_' + name] || ''

module.exports = {
  miniprogramState: state,

  bookingSuccess: {
    id: id('BOOKING_SUCCESS'),
    page: 'pages/bookings/bookings',
    fields: v => ({ thing1: v.title, time2: v.time, thing3: v.place })
  },

  classReminder: {
    id: id('CLASS_REMINDER'),
    page: 'pages/bookings/bookings',
    fields: v => ({ thing1: v.title, time2: v.time, thing3: v.place })
  },

  cardExpire: {
    id: id('CARD_EXPIRE'),
    page: 'pages/cards/cards',
    fields: v => ({ thing1: v.cardName, date2: v.expireDate, thing3: v.tip })
  }
}
