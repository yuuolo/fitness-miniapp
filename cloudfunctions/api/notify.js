const { cloud } = require('./common')
const templates = require('./templates')

// 模板的 thing 类字段最多 20 个字
function wrap(fields) {
  const data = {}
  Object.keys(fields).forEach(k => {
    data[k] = { value: String(fields[k] === undefined ? '' : fields[k]).slice(0, 20) }
  })
  return data
}

// 会员没有授权或次数用完时发送会失败，这里只记日志，不影响业务
async function notify(kind, openid, values) {
  const t = templates[kind]
  if (!t || !t.id) return false
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: t.id,
      page: t.page,
      miniprogramState: templates.miniprogramState,
      data: wrap(t.fields(values))
    })
    return true
  } catch (e) {
    console.warn('subscribeMessage.send failed', kind, e.errCode || e.message)
    return false
  }
}

module.exports = { notify }
