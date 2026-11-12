const {
  db, _, cnDate, cnDateTime, fail, need, getDoc, memberLabel, ROLE_LEVEL
} = require('./common')

const MAX_CONTENT = 500
const MAX_MEDIA = 9
const PAGE_SIZE = 20

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

// 视频/图片先由小程序上传到云存储，这里只收 fileID
function cleanMedia(list) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length > MAX_MEDIA) fail('最多 ' + MAX_MEDIA + ' 个视频或照片')
  return arr.map(x => ({
    fileID: String(x.fileID || ''),
    type: x.type === 'video' ? 'video' : 'image',
    duration: Number(x.duration) || 0,
    thumb: String(x.thumb || '')
  })).filter(x => /^cloud:\/\//.test(x.fileID))
}

async function postMoment({ me, data }) {
  need(me, 'member')
  // 会员发自己的；教练或前台可以帮会员发（代拍）
  const targetOpenid = data.openid && canCoach(me) ? data.openid : me._id
  const target = await getDoc('members', targetOpenid)
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
    likedBy: [],
    status: 'normal',
    date: cnDate(now),
    createdAt: now
  }
  const res = await db.collection('moments').add({ data: doc })
  return momentView(Object.assign({ _id: res._id }, doc), me)
}

async function momentList({ me, data }) {
  need(me, 'member')
  const before = Number(data.before) || 0
  const where = before ? { status: 'normal', createdAt: _.lt(before) } : { status: 'normal' }
  const list = (await db.collection('moments').where(where)
    .orderBy('createdAt', 'desc').limit(PAGE_SIZE).get()).data
  return {
    list: list.map(m => momentView(m, me)),
    hasMore: list.length === PAGE_SIZE
  }
}

async function momentDetail({ me, data }) {
  need(me, 'member')
  const m = await getDoc('moments', data.id)
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  return momentView(m, me)
}

async function deleteMoment({ me, data }) {
  need(me, 'member')
  const m = await getDoc('moments', data.id)
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  if (m.openid !== me._id && !isStaff(me)) fail('只能删除自己的动态')
  await db.collection('moments').doc(m._id).update({ data: { status: 'deleted' } })
  return { ok: true }
}

// 点赞：读改写整个数组，健身房量级下足够，避免引入数组原子操作
async function likeMoment({ me, data }) {
  need(me, 'member')
  const m = await getDoc('moments', data.id)
  if (!m || m.status !== 'normal') fail('动态不存在或已删除')
  const likedBy = (m.likedBy || []).slice()
  const idx = likedBy.indexOf(me._id)
  const want = data.like === undefined ? idx < 0 : !!data.like
  if (want && idx < 0) likedBy.push(me._id)
  if (!want && idx >= 0) likedBy.splice(idx, 1)
  await db.collection('moments').doc(m._id).update({ data: { likedBy } })
  return { liked: want, likeCount: likedBy.length }
}

module.exports = { postMoment, momentList, momentDetail, deleteMoment, likeMoment }
