// 修订阅手势：挑战提醒也改成同步；订阅页按钮等模板就绪才可用；加挑战提醒按钮
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

// ---------- 1. subscribe.js：加同步版挑战订阅 ----------
edit('utils/subscribe.js', t => {
  if (t.includes('requestSync')) return t
  return t.replace(
    `module.exports = { prefetch, request, requestTopics, requestTopicsSync, loadIds, loadTopicIds, cachedTopicIds }`,
    `/**
 * 挑战提醒订阅：同步版（必须在点击事件里直接调用）
 * kinds 传 invite / start / result；授权成功后服务端不需要票（挑战模板按事件直接发）
 */
function requestSync(kinds) {
  const ids = cachedChallengeIds()
  if (!ids) return Promise.resolve({ ok: false, error: 'not-ready' })
  const list = []
  for (const k of kinds || []) {
    const id = ids[k]
    if (id && list.indexOf(id) < 0) list.push(id)
  }
  if (!list.length) return Promise.resolve({ ok: false, error: 'no-template' })
  return ask(list.slice(0, 3)).then(res => {
    if (!res) return { ok: false, error: 'timeout' }
    if (res.__error) return { ok: false, error: res.__error }
    const accepted = list.filter(id => res[id] === 'accept')
    return { ok: accepted.length > 0, error: accepted.length ? '' : 'rejected', accepted }
  })
}

module.exports = {
  prefetch, request, requestSync, requestTopics, requestTopicsSync,
  loadIds, loadTopicIds, cachedTopicIds
}`
  )
}, 'subscribe.js：requestSync（挑战提醒同步授权）')

// ---------- 2. 挑战页改用同步授权（保住手势） ----------
edit('pages/challenges/new/new.js', t => {
  if (!t.includes("subscribe.request(['invite', 'result'])")) return t
  return t.replace(
    "subscribe.request(['invite', 'result']).then(() => api.call('createChallenge', {",
    "subscribe.requestSync(['invite', 'result']).then(() => api.call('createChallenge', {"
  )
}, '发起挑战：同步授权')

edit('pages/challenges/detail/detail.js', t => {
  let out = t
  out = out.replace("subscribe.request(['result'])", "subscribe.requestSync(['result'])")
  out = out.replace("subscribe.request(['start'])", "subscribe.requestSync(['start'])")
  return out
}, '详情页：同步授权')

// ---------- 3. 订阅页：就绪前禁用按钮 + 挑战提醒单独按钮 ----------
edit('pages/subscribe/subscribe.js', t => {
  if (t.includes('challengeReady')) return t
  t = t.replace(
    `    ready: false,`,
    `    ready: false,
    challengeSubscribing: false,`
  )
  t = t.replace(
    `  // 一键订阅：一次点击把 3 个模板都授权（rankScore / rankLift 共用同一个模板）`,
    `  // 挑战提醒（有人挑战你 / 该你判了 / 判定结果）—— 和内容更新分开点，因为微信一次最多 3 个模板
  subscribeChallenge() {
    if (this.data.challengeSubscribing) return
    this.setData({ challengeSubscribing: true, lastError: '' })
    subscribe.requestSync(['invite', 'start', 'result']).then(r => {
      this.setData({ challengeSubscribing: false })
      if (!r || !r.ok) {
        const tip = this.tipOf((r && r.error) || 'unknown')
        this.setData({ lastError: tip })
        wx.showModal({ title: '订阅未成功', content: tip, showCancel: false })
        return
      }
      wx.showToast({ title: '挑战提醒已订阅' })
    })
  },

  // 把错误码翻译成能看懂的话
  tipOf(reason) {
    if (reason === 'not-ready') return '模板还在准备，稍等 2 秒再点一次'
    if (reason === 'rejected') return '你点了“取消”，同意后才能收到通知'
    if (reason === 'no-template') return '后台还没配好通知模板'
    if (/TAP|gesture/i.test(reason)) return '请再点一次按钮（微信要求必须由点击触发）'
    if (/timeout/i.test(reason)) return '微信没响应，请再点一次'
    return '订阅失败：' + reason
  },

  // 一键订阅：一次点击把内容更新的 3 个模板都授权（rankScore / rankLift 共用同一个模板）`
  )
  t = t.replace(
    `        const reason = (r && r.error) || 'unknown'
        const tip = reason === 'not-ready'
          ? '模板还在准备，稍等 2 秒再点一次'
          : reason === 'rejected'
            ? '你点了“取消”，同意后才能收到通知'
            : reason === 'no-template'
              ? '后台还没配好通知模板'
              : '订阅失败：' + reason
        this.setData({ lastError: tip })`,
    `        const tip = this.tipOf((r && r.error) || 'unknown')
        this.setData({ lastError: tip })`
  )
  return t
}, '订阅页：错误提示 + 挑战提醒按钮')

edit('pages/subscribe/subscribe.wxml', t => {
  if (t.includes('subscribeChallenge')) return t
  return t.replace(
    `    <button class="btn block" bindtap="subscribeAll" disabled="{{subscribing}}">
      {{subscribing ? '授权中…' : '一键订阅全部提醒'}}
    </button>`,
    `    <button class="btn block" bindtap="subscribeAll" disabled="{{subscribing || !ready}}">
      {{subscribing ? '授权中…' : (ready ? '一键订阅内容提醒' : '正在准备…')}}
    </button>
    <button class="btn ghost block mt" bindtap="subscribeChallenge" disabled="{{challengeSubscribing || !ready}}">
      {{challengeSubscribing ? '授权中…' : '订阅挑战提醒（有人挑战我 / 该我判了 / 判定结果）'}}
    </button>`
  )
}, '订阅页：挑战提醒按钮')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/subscribe.js', 'pages/subscribe/subscribe.js', 'pages/challenges/new/new.js', 'pages/challenges/detail/detail.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
