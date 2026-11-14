// 健身友圈：发文、列表、详情、删除、点赞、分享海报小程序码
const https = require('https')
const { query, tx } = require('./db')
const {
  cnDate, cnDateTime, fail, need, newId, memberLabel, memberRow, momentRow,
  configGet, configSet, ROLE_LEVEL
} = require('./common')
const { accessToken } = require('./notify')
const storage = require('./storage')

const MAX_CONTENT = 500
const MAX_MEDIA = 9
const PAGE_SIZE = 20
const DETAIL_PAGE = 'pages/moments/detail/detail'

// 小程序码 scene 最多 32 字符，用 10 位短码指回动态
function makeShort() {
  const t = Date.now().toString(36).slice(-6)
  const r = Math.random().toString(36).slice(2, 6)
  return t + r
}

function isStaff(me) {
  return (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.staff
}

// 教练或以上都可以帮会员发（代拍）
function canCoach(me) {
  return (ROLE_LEVEL[me.role] || 0) >= ROLE_LEVEL.coach
}

// 列表和详情共用一套出参，避免前端两套字段
function momentView(m, me) {
  const likedBy = m.likedBy || []
  return {
    _id: m._id,
    openid: m.openid,
    authorName: m.authorName,
    isMine: m.openid === me._id,
    type: m.type,
    content: m.content || '',
    media: m.media || [],
    coachName: m.coachName || '',
    date: m.date,
    time: cnDateTime(m.createdAt),
    createdAt: m.createdAt,
    likeCount: likedBy.length,
    liked: likedBy.indexOf(me._id) >= 0,
    canDelete: m.openid === me._id || isStaff(me)
  }
}

// 图片/视频先由小程序上传，这里只收地址（云存储 fileID 或自建 https 地址）
function cleanMedia(list) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length > MAX_MEDIA) fail('最多 ' + MAX_MEDIA + ' 个视频或照片')
  return arr.map(x => ({
    fileID: String(x.fileID || ''),
    type: x.type === 'video' ? 'video' : 'image',
    duration: Number(x.duration) || 0,
    thumb: String(x.thumb || '')
  })).filter(x => /^(cloud:\/\/|https:\/\/)/.test(x.fileID))
}

async function insertMoment(client, doc) {
  // short 有唯一索引，小概率冲突时重试
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId()
    try {
      await client.query(
        `insert into moments (id, openid, author_name, content, media, type, coach_id, coach_name,
           liked_by, short, poster_qr, status, date, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, $9, '', 'normal', $10, $11)`,
        [id, doc.openid, doc.authorName, doc.content, JSON.stringify(doc.media), doc.type,
          doc.coachId, doc.coachName, doc.short, doc.date, doc.createdAt]
      )
      return id
    } catch (e) {
      if (e.code === '23505' && attempt < 4) {
        doc.short = makeShort()
        continue
      }
      throw e
    }
  }
  throw new Error('short 生成失败')
}

async function postMoment({ me, data }) {
  need(me, 'member')
  // 会员发自己的；教练或前台可以帮会员发（代拍）
  const targetOpenid = data.openid && canCoach(me) ? data.openid : me._id
  const target = memberRow((await query('select * from members where openid = $1', [targetOpenid])).rows[0])
  if (!target) fail('会员不存在')

  const content = String(data.content || '').trim()
  if (content.length > MAX_CONTENT) fail('文字不能超过 ' + MAX_CONTENT + ' 个字')
  const media = cleanMedia(data.media)
  if (!content && !media.length) fail('写点什么，或者选一个视频/照片')

  const now = Date.now()
  const byCoach = target._id !== me._id
  const doc = {
    openid: target._id,
    authorName: memberLabel(target),
    content,
    media,
    type: media.some(x => x.type === 'video') ? 'video' : (media.length ? 'image' : 'text'),
    coachId: byCoach ? me._id : '',
    coachName: byCoach ? memberLabel(me) : '',
    short: makeShort(),
    date: cnDate(now),
    createdAt: now
  }
  const id = await tx(client => insertMoment(client, doc))
  return momentView(momentRow((await query('select * from moments where id = $1', [id])).rows[0]), me)
}

async function momentList({ me, data }) {
  need(me, 'member')
  const before = Number(data.before) || 0
  const list = (await query(
    `select * from moments where status = 'normal'
       and ($1::bigint = 0 or created_at < $1::bigint)
     order by created_at desc limit $2`,
    [before, PAGE_SIZE]
  )).rows.map(momentRow)
  return {
    list: list.map(m => momentView(m, me)),
    hasMore: list.length === PAGE_SIZE
  }
}

async function momentDetail({ me, data }) {
  need(me, 'member')
  const m = momentRow((await query('select * from moments where id = $1', [data.id])).rows[0])
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  return momentView(m, me)
}

async function deleteMoment({ me, data }) {
  need(me, 'member')
  const m = momentRow((await query('select * from moments where id = $1', [data.id])).rows[0])
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  if (m.openid !== me._id && !isStaff(me)) fail('只能删除自己的动态')
  await query("update moments set status = 'deleted' where id = $1", [m._id])
  return { ok: true }
}

// 点赞：事务内读改写整个数组，健身房量级下足够
async function likeMoment({ me, data }) {
  need(me, 'member')
  return tx(async client => {
    const m = momentRow((await client.query(
      'select * from moments where id = $1 for update', [data.id]
    )).rows[0])
    if (!m || m.status !== 'normal') fail('动态不存在或已删除')
    const likedBy = (m.likedBy || []).slice()
    const idx = likedBy.indexOf(me._id)
    const want = data.like === undefined ? idx < 0 : !!data.like
    if (want && idx < 0) likedBy.push(me._id)
    if (!want && idx >= 0) likedBy.splice(idx, 1)
    await client.query('update moments set liked_by = $2 where id = $1', [m._id, JSON.stringify(likedBy)])
    return { liked: want, likeCount: likedBy.length }
  })
}

// ---------- 分享海报 ----------

function httpsJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body))
    const req = https.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': payload.length }
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const type = res.headers['content-type'] || ''
        if (type.indexOf('application/json') >= 0) {
          let parsed = {}
          try {
            parsed = JSON.parse(buf.toString('utf8'))
          } catch (e) {
            return reject(new Error('小程序码接口返回无法解析'))
          }
          if (parsed.errcode) {
            const err = new Error(parsed.errmsg || '小程序码生成失败')
            err.errcode = parsed.errcode
            return reject(err)
          }
          return reject(new Error('小程序码接口没有返回图片'))
        }
        resolve(buf)
      })
    })
    req.setTimeout(10000, () => req.destroy(new Error('小程序码接口超时')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function momentPoster({ me, data }) {
  need(me, 'member')
  const m = momentRow((await query('select * from moments where id = $1', [data.id])).rows[0])
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  if (m.posterQr) return { fileID: m.posterQr, cached: true }

  let short = m.short
  if (!short) {
    short = makeShort()
    await query('update moments set short = $2 where id = $1', [m._id, short])
  }

  try {
    const at = await accessToken()
    const buf = await httpsJson(
      'https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=' + encodeURIComponent(at),
      { scene: 's=' + short, page: DETAIL_PAGE, width: 280, checkPath: false }
    )
    // 海报图片也走存储抽象层（数据库 / COS / OSS）
    const saved = await storage.put(buf, { ext: 'jpg', mime: 'image/jpeg' })
    const fileID = saved.url
    await query('update moments set poster_qr = $2 where id = $1', [m._id, fileID])
    return { fileID, cached: false }
  } catch (e) {
    console.warn('wxacode.getUnlimited failed', e.errcode || e.message)
    // 个人主体未认证时拿不到动态小程序码，退回到管理员手工上传的静态码
    const fallback = await configGet('posterQr')
    if (fallback && fallback.fileID) {
      return { fileID: fallback.fileID, cached: false, static: true }
    }
    fail('小程序码生成失败(' + (e.errcode || 'unknown') + ')：' + (e.message || ''))
  }
}

// 管理员上传一张静态小程序码，作为未认证主体的兜底入口
async function setPosterQr({ me, data }) {
  need(me, 'staff')
  const fileID = String(data.fileID || '')
  if (!/^(cloud:\/\/|https:\/\/)/.test(fileID)) fail('请先上传一张小程序码图片')
  await configSet('posterQr', { fileID, updatedAt: Date.now(), operator: me._id })
  return { fileID }
}

// 扫海报上的码进来时用短码找动态
async function momentByShort({ me, data }) {
  need(me, 'member')
  const short = String(data.short || '')
  if (!short) fail('缺少短码')
  const m = momentRow((await query(
    "select * from moments where short = $1 and status = 'normal' limit 1", [short]
  )).rows[0])
  if (!m) fail('动态不存在或已删除')
  return momentView(m, me)
}

module.exports = {
  postMoment, momentList, momentDetail, deleteMoment, likeMoment,
  momentPoster, momentByShort, setPosterQr
}
