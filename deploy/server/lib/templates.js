// 订阅消息模板配置
//
// 字段名必须与小程序后台「功能 → 订阅消息」里模板的实际 keyword 完全一致，
// 用 GET https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate 可以查到自己选用的模板与字段名。
// 模板 ID 通过环境变量提供（WX_TPL_*），留空则不发送该类消息。
//
// 本文件对应的三个模板（已在该小程序后台选用）：
//   预约成功通知   thing8 预约业务 / character_string5 预约时段 / thing11 预约人 / thing10 预约地点
//   预约开始提醒   thing6 预约人 / thing1 温馨提醒 / thing2 场地名称 / thing3 场地地址 / time4 开始时间
//   会员即将到期   thing1 用户名 / thing2 温馨提示 / thing6 会员类型 / time3 到期时间
const state = process.env.WX_MP_STATE || 'developer'
const SHOP_ADDRESS = process.env.SHOP_ADDRESS || '前台签到'
const id = name => process.env['WX_TPL_' + name] || ''

module.exports = {
  miniprogramState: state,
  shopAddress: SHOP_ADDRESS,

  // 预约成功（团课、私教、娱乐项目）
  bookingSuccess: {
    id: id('BOOKING_SUCCESS'),
    page: 'pages/bookings/bookings',
    fields: v => ({
      thing8: v.title,
      character_string5: v.time,
      thing11: v.who,
      thing10: v.place
    })
  },

  // 开课前 2 小时提醒
  classReminder: {
    id: id('CLASS_REMINDER'),
    page: 'pages/bookings/bookings',
    fields: v => ({
      thing6: v.who,
      thing1: v.tip || '请提前 10 分钟到场',
      thing2: v.place,
      thing3: v.address || SHOP_ADDRESS,
      time4: v.time
    })
  },

  // 会员卡 3 天内到期提醒
  cardExpire: {
    id: id('CARD_EXPIRE'),
    page: 'pages/cards/cards',
    fields: v => ({
      thing1: v.who,
      thing2: v.tip,
      thing6: v.cardName,
      time3: v.expireDate
    })
  }
}
