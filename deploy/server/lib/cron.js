// 定时任务：目前只剩「每天备份一次数据库」
//
// 原来还有三个任务（下课未签到记缺席、课前提醒、会员卡到期提醒），
// 随团课/私教预约、会员卡两个功能一起删除了。

const backup = require('./backup')

async function runCron() {
  const result = {}
  // 每天备份一次（失败不影响业务）
  try {
    const one = await backup.runDaily()
    if (one) result.backup = one.file
  } catch (e) {
    console.error('每日备份失败：', e.message)
  }
  return result
}

module.exports = { runCron }
