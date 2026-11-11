// 配置读取：仓库里的默认值全部留空，个人环境写在 config.local.js（已被 .gitignore 忽略）
// 云开发环境 ID：在微信开发者工具「云开发」控制台的「设置」中查看，留空则使用默认环境
// 订阅消息模板 ID：与 cloudfunctions/api/templates.js 中的 id 保持一致，留空则不弹授权
let local = {}
try {
  local = require('./config.local')
} catch (e) {
  // 没有本地配置时使用默认值
}

const t = local.templates || {}

module.exports = {
  envId: local.envId || '',
  templates: {
    bookingSuccess: t.bookingSuccess || '',
    classReminder: t.classReminder || '',
    cardExpire: t.cardExpire || ''
  }
}
