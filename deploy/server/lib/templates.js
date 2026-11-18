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

  // ---- 内容更新通知（一次性订阅）----
  // 学员作品发布通知  thing1 练习名称 / thing2 作品名称 / thing3 学员昵称
  momentsNew: {
    id: id('MOMENTS_NEW') || 'tQLp7ap5btQM8Xnnql2Rg3_C1ygO7m1HwzzjV88EnYI',
    page: 'pages/moments/moments',
    fields: v => ({ thing1: v.channel, thing2: v.what, thing3: v.who })
  },
  // 赛事报名通知  thing1 赛事名称 / date2 开赛时间 / thing3 参赛项目 / phrase4 报名状态 / thing5 温馨提示
  competitionNew: {
    id: id('COMPETITION_NEW') || 'SwVg2eYVzJojs8NpRfOl56VxS4p7dPrMlyCzWHE7RnY',
    page: 'pages/competitions/competitions',
    fields: v => ({ thing1: v.title, date2: v.startAt, thing3: v.lift, phrase4: v.state, thing5: v.tip })
  },
  // 运动排行榜更新通知  thing1 榜单名称 / time2 更新时间 / thing3 温馨提示
  rankUpdate: {
    id: id('RANK_UPDATE') || 'dTbxPUeq5j3ATK_aseJzJOIZGSMWKKGTfDdoZ5g53ls',
    page: 'pages/rank/rank',
    fields: v => ({ thing1: v.board, time2: v.time, thing3: v.tip })
  },


  // ---- 会员挑战（订阅消息，一次性）----
  // 模板已在后台选用（2026-11-18）：
  //   比赛邀请通知  name1 邀请人 / date2 比赛时间 / thing4 比赛名称 / thing5 参赛球队 / thing6 比赛场地
  //   挑战开始提醒  thing1 挑战名称 / time2 挑战时间 / thing3 温馨提示
  //   对战结果通知  thing1 活动名称 / time2 开始时间 / time3 结束时间 / short_thing4 对战结果 / thing5 温馨提示
  challengeInvite: {
    id: id('CHALLENGE_INVITE') || '-UIVlMMxucmR3oTwIin1ROOSq9U9kCyp0mmFA1nzfY4',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      name1: v.inviter,
      date2: v.time,
      thing4: v.title,
      thing5: v.vs,
      thing6: v.place
    })
  },
  challengeStart: {
    id: id('CHALLENGE_START') || 'uD-Pu7n61BDSLDAmX45Jitf6Kwl4oisVtNSxVSVWTI4',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      thing1: v.title,
      time2: v.time,
      thing3: v.tip
    })
  },
  challengeResult: {
    id: id('CHALLENGE_RESULT') || 'ddrEoH_Zs3kHShU6NcMrkxPaijA9XMJ14IUi2ODEYwk',
    page: 'pages/challenges/detail/detail',
    fields: v => ({
      thing1: v.title,
      time2: v.startAt,
      time3: v.endAt,
      short_thing4: v.result,
      thing5: v.tip
    })
  },

  miniprogramState: state,
  shopAddress: SHOP_ADDRESS,



}
