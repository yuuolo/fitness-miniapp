const { cloud, db, BizError, getDoc } = require('./common')
const { isInitialized } = require('./system')
const { runCron } = require('./cron')

const handlers = Object.assign(
  {},
  require('./system'),
  require('./member'),
  require('./booking'),
  require('./entry'),
  require('./admin'),
  require('./fitness'),
  require('./moment')
)

// 首次调用自动建会员档案；系统未初始化（集合不存在）时返回 null
async function ensureMember(openid) {
  const me = await getDoc('members', openid)
  if (me) return me
  const doc = {
    _id: openid, nickName: '', phone: '', role: 'member', points: 0,
    noShow: 0, blockUntil: 0, createdAt: Date.now()
  }
  try {
    await db.collection('members').add({ data: doc })
    return doc
  } catch (e) {
    return getDoc('members', openid)
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  // 定时触发器调用时没有 openid，小程序端无法伪造
  if (!OPENID && event && event.Type === 'Timer') {
    if (!(await isInitialized())) return { skipped: 'not initialized' }
    return runCron()
  }
  const { action, data } = event || {}
  const fn = Object.prototype.hasOwnProperty.call(handlers, action) && typeof handlers[action] === 'function' ? handlers[action] : null
  if (!fn) return { code: 404, msg: '未知操作' }
  try {
    const me = await ensureMember(OPENID)
    const result = await fn({ openid: OPENID, me, data: data || {} })
    return { code: 0, data: result === undefined ? null : result }
  } catch (e) {
    if (e instanceof BizError) return { code: 400, msg: e.message }
    console.error(action, e)
    return { code: 500, msg: '服务器开小差了，请稍后再试' }
  }
}
