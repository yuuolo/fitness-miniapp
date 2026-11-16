// 把保存/点赞/删除音效接到各页面
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 按页面层级算 require 前缀
function addRequire(t, prefix, label) {
  if (t.includes("utils/sfx")) return t
  const line = "const sfx = require('" + prefix + "utils/sfx')"
  // 插到第一行 require 后面
  const m = t.match(/^const .*require\(.*\)\r?\n/m)
  if (!m) return t
  return t.replace(m[0], m[0] + line + '\n')
}

// ---------- 1. 员工端体测页：保存体测 / 力量 / 运动、删除 ----------
edit('pages/staff/fitness/fitness.js', t => {
  t = addRequire(t, '../../../')
  // 保存体测成功
  t = t.replace(
    `      wx.showToast({ title: '已录入，评分 ' + r.score })`,
    `      sfx.playSave()
      wx.showToast({ title: '已录入，评分 ' + r.score })`
  )
  // 保存力量成绩
  t = t.replace(
    `      wx.showToast({ title: '1RM 约 ' + r.oneRM + ' kg' })`,
    `      sfx.playSave()
      wx.showToast({ title: '1RM 约 ' + r.oneRM + ' kg' })`
  )
  // 保存运动记录
  t = t.replace(
    `      wx.showToast({ title: '已记录' })`,
    `      sfx.playSave()
      wx.showToast({ title: '已记录' })`
  )
  // 报告图上传成功
  t = t.replace(
    `      wx.showToast({ title: '报告已上传' })`,
    `      sfx.playSave()
      wx.showToast({ title: '报告已上传' })`
  )
  // 删除体测记录成功
  t = t.replace(
    `        api.call('deleteBodyRecord', { id }, { loading: '删除中' }).then(() => {
          wx.showToast({ title: '已删除' })`,
    `        api.call('deleteBodyRecord', { id }, { loading: '删除中' }).then(() => {
          sfx.playDelete()
          wx.showToast({ title: '已删除' })`
  )
  return t
}, '员工端体测页：保存/删除音效')

// ---------- 2. 我的资料页：保存 ----------
edit('pages/profile/profile.js', t => {
  t = addRequire(t, '../../')
  return t.replace(
    `      wx.showToast({ title: '已保存' })`,
    `      sfx.playSave()
      wx.showToast({ title: '已保存' })`
  )
}, '资料页：保存音效')

// ---------- 3. 教练代填资料：保存 ----------
edit('pages/staff/member/member.js', t => {
  t = addRequire(t, '../../../')
  return t.replace(
    `      wx.showToast({ title: '已保存' })`,
    `      sfx.playSave()
      wx.showToast({ title: '已保存' })`
  )
}, '教练代填资料：保存音效')

// ---------- 4. 发动态：发布 ----------
edit('pages/moments/post/post.js', t => {
  t = addRequire(t, '../../')
  return t.replace(
    `      wx.showToast({ title: '已发布' })`,
    `      sfx.playSave()
      wx.showToast({ title: '已发布' })`
  )
}, '发动态：发布音效')

// ---------- 5. 竞赛成绩录入 ----------
edit('pages/staff/competition-entry/competition-entry.js', t => {
  t = addRequire(t, '../../../')
  return t.replace(
    `        title: '已录入',`,
    `        title: '已录入',`
  ).replace(
    `      wx.showToast({
        title: '已录入',`,
    `      sfx.playSave()
      wx.showToast({
        title: '已录入',`
  )
}, '竞赛录入：保存音效')

// ---------- 6. 友圈列表：点赞 + 删除 ----------
edit('pages/moments/moments.js', t => {
  t = addRequire(t, '../../')
  // 点赞成功（只在「点赞」时响，取消点赞不响）
  t = t.replace(
    `      api.call('likeMoment', { id }, { silent: true }).then(r => {`,
    `      api.call('likeMoment', { id }, { silent: true }).then(r => {
        if (r.liked) sfx.playLike()`
  )
  // 删除成功
  t = t.replace(
    `      api.call('deleteMoment', { id }, { loading: '删除中' }).then(() => {`,
    `      api.call('deleteMoment', { id }, { loading: '删除中' }).then(() => {
        sfx.playDelete()`
  )
  return t
}, '友圈列表：点赞/删除音效')

// ---------- 7. 友圈详情：点赞 + 删除 ----------
edit('pages/moments/detail/detail.js', t => {
  t = addRequire(t, '../../../')
  t = t.replace(
    `    api.call('likeMoment', { id: m._id }, { silent: true }).then(r => {`,
    `    api.call('likeMoment', { id: m._id }, { silent: true }).then(r => {
      if (r.liked) sfx.playLike()`
  )
  t = t.replace(
    `      api.call('deleteMoment', { id: this.data.m._id }, { loading: '删除中' }).then(() => {`,
    `      api.call('deleteMoment', { id: this.data.m._id }, { loading: '删除中' }).then(() => {
        sfx.playDelete()`
  )
  return t
}, '友圈详情：点赞/删除音效')

console.log(done.map(x => '  ✓ ' + x).join('\n'))

// 校验
for (const f of [
  'pages/staff/fitness/fitness.js',
  'pages/profile/profile.js',
  'pages/staff/member/member.js',
  'pages/moments/post/post.js',
  'pages/staff/competition-entry/competition-entry.js',
  'pages/moments/moments.js',
  'pages/moments/detail/detail.js'
]) {
  try {
    require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
    console.log('  ✓ 语法 ' + f)
  } catch (e) {
    console.log('  ✗ 语法 ' + f)
  }
}
