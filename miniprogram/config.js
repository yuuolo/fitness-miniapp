// 配置读取：仓库里的默认值全部留空，个人环境写在 config.local.js（已被 .gitignore 忽略）
// 后端已迁到自建服务器，接口地址固定在 miniprogram/utils/api.js 的 BASE（https://gym.novrein.com）
// 订阅消息模板 ID：与服务器 /opt/gym/.env 里的 WX_TPL_* 保持一致，留空则不弹授权
let local = {}
try {
  local = require('./config.local')
} catch (e) {
  // 没有本地配置时使用默认值
}

const t = local.templates || {}

module.exports = {
  templates: {
    bookingSuccess: t.bookingSuccess || '',
    classReminder: t.classReminder || '',
    cardExpire: t.cardExpire || ''
  }
}
