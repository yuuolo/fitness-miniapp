// 查微信订阅消息能力：已选模板、可选用类目、公众号/主体线索
const https = require('https')
const { accessToken } = require('/app/lib/notify')

function get(path) {
  return new Promise((resolve, reject) => {
    https.get('https://api.weixin.qq.com' + path, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (e) {
          reject(new Error('非 JSON: ' + raw.slice(0, 200)))
        }
      })
    }).on('error', reject)
  })
}

;(async () => {
  const token = await accessToken()
  console.log('access_token 获取成功')

  console.log('\n=== 1. 当前已选用的模板（gettemplate）===')
  const t = await get('/wxaapi/newtmpl/gettemplate?access_token=' + encodeURIComponent(token))
  console.log(JSON.stringify(t, null, 2).slice(0, 1500))

  console.log('\n=== 2. 可选类目（getcategory）===')
  const c = await get('/wxaapi/newtmpl/getcategory?access_token=' + encodeURIComponent(token))
  console.log(JSON.stringify(c, null, 2).slice(0, 1500))
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
