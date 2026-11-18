// P2 前端：详情页评论区 + 挑战榜页面
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

// ---------- 1. 详情页 JS：评论 ----------
edit('pages/challenges/detail/detail.js', t => {
  if (t.includes('sendComment')) return t
  t = t.replace(
    `    // 重新选裁判
    referees: [],
    refereeOpen: false`,
    `    // 重新选裁判
    referees: [],
    refereeOpen: false,
    // 评论
    commentText: '',
    sending: false`
  )
  t = t.replace(
    `  // ---------- 分享 ----------`,
    `  // ---------- 评论 ----------
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  sendComment() {
    const content = String(this.data.commentText || '').trim()
    if (!content || this.data.sending) return
    this.setData({ sending: true })
    api.call('commentChallenge', { id: this.data.id, content }, { silent: true }).then(() => {
      this.setData({ commentText: '', sending: false })
      this.load()
    }, err => {
      this.setData({ sending: false })
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    })
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    api.call('likeChallengeComment', { id }, { silent: true }).then(list => {
      const c = Object.assign({}, this.data.c, {
        comments: list,
        commentCount: (list || []).length
      })
      this.setData({ c })
    }, err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论？',
      success: r => {
        if (!r.confirm) return
        api.call('deleteChallengeComment', { id }, { silent: true }).then(list => {
          const c = Object.assign({}, this.data.c, {
            comments: list,
            commentCount: (list || []).length
          })
          this.setData({ c })
        }, err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  },

  // ---------- 分享 ----------`
  )
  return t
}, '详情页：评论逻辑')

// ---------- 2. 详情页 WXML：评论区 ----------
edit('pages/challenges/detail/detail.wxml', t => {
  if (t.includes('评论（')) return t
  const anchor = `    <view class="share-tip muted">点右上角「···」转发，邀请大家来看这场挑战</view>`
  const block = `    <!-- 大家怎么看 -->
    <view class="section-title">会员意见（{{c.commentCount}}）</view>
    <view class="card">
      <view wx:if="{{!c.comments.length}}" class="muted">还没有人发表意见，来说两句</view>

      <view wx:for="{{c.comments}}" wx:key="_id" class="comment">
        <view class="between">
          <text class="comment-author">{{item.authorName}}</text>
          <text class="muted">{{item.time}}</text>
        </view>
        <view class="comment-body">{{item.content}}</view>
        <view class="comment-ops">
          <text class="like {{item.likedByMe ? 'on' : ''}}" data-id="{{item._id}}" bindtap="toggleLike">
            ♥ {{item.likeCount || 0}}
          </text>
          <text wx:if="{{item.canDelete}}" class="op-del" data-id="{{item._id}}" bindtap="deleteComment">删除</text>
        </view>
      </view>

      <view wx:if="{{c.canComment}}" class="comment-input-bar">
        <input class="grow comment-input" value="{{commentText}}" maxlength="100"
          bindinput="onCommentInput" bindconfirm="sendComment" confirm-type="send"
          placeholder="发表你的看法（最多 100 字）" />
        <button class="btn" bindtap="sendComment" disabled="{{sending || !commentText}}">发送</button>
      </view>
    </view>

    <view class="share-tip muted">点右上角「···」转发，邀请大家来看这场挑战</view>`
  if (!t.includes(anchor)) {
    console.log('  [!] 找不到分享提示锚点')
    return t
  }
  return t.replace(anchor, block)
}, '详情页：评论界面')

// ---------- 3. 详情页样式 ----------
edit('pages/challenges/detail/detail.wxss', t => {
  if (t.includes('.comment-body')) return t
  return t + `
/* 评论 */
.comment { padding: 14rpx 0; border-bottom: 1px solid var(--line); }
.comment:last-child { border-bottom: none; }
.comment-author { font-size: 26rpx; font-weight: 600; color: var(--ink); }
.comment-body { font-size: 27rpx; color: var(--sub); margin: 8rpx 0; line-height: 1.5; }
.comment-ops { display: flex; align-items: center; gap: 28rpx; }
.like { font-size: 24rpx; color: var(--muted); }
.like.on { color: var(--danger); }
.op-del { font-size: 24rpx; color: var(--muted); }
.comment-input-bar {
  display: flex; align-items: center; gap: 16rpx; margin-top: 18rpx;
  padding-top: 18rpx; border-top: 1px solid var(--line);
}
.comment-input {
  background: var(--fill); border-radius: var(--r-pill);
  padding: 14rpx 24rpx; font-size: 26rpx;
}
`
}, '详情页：评论样式')

// ---------- 4. 挑战榜页面 ----------
const dir = MP + '/pages/challenges/board'
fs.mkdirSync(dir, { recursive: true })

const boardJs = `// 挑战榜：本周胜场 / 当前连胜 / 总胜场 + 我的战绩与徽章
const api = require('../../../utils/api')

const TABS = [
  { key: 'week', name: '本周胜场' },
  { key: 'streak', name: '当前连胜' },
  { key: 'total', name: '总胜场' }
]

Page({
  data: {
    tabs: TABS,
    tab: 'week',
    week: [], streak: [], total: [],
    mine: null,
    loaded: false
  },

  onShow() { this.load() },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('challengeBoard', {}, { silent: true }).then(r => {
      this.setData({
        week: r.week || [],
        streak: r.streak || [],
        total: r.total || [],
        mine: r.mine || null,
        loaded: true
      })
    }, () => this.setData({ loaded: true }))
  },

  pickTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  openMine() {
    if (!this.data.mine) return
    wx.navigateTo({ url: '/pages/challenges/list/list' })
  }
})
`

const boardWxml = `<view class="page">
  <!-- 我的战绩 -->
  <view wx:if="{{mine}}" class="card my-card">
    <view class="between">
      <view>
        <view class="my-name">{{mine.name}}</view>
        <view class="muted">{{mine.wins}} 胜 · {{mine.losses}} 负 · {{mine.draws}} 平<text wx:if="{{mine.judged}}"> · 胜率 {{mine.winRate}}%</text></view>
      </view>
      <view class="my-num">
        <text class="num">{{mine.streak}}</text>
        <text class="muted">连胜</text>
      </view>
    </view>
    <view wx:if="{{mine.banned}}" class="ban">因作弊禁赛中，到 {{mine.banUntilText}}</view>

    <view wx:if="{{mine.badges.length}}" class="badges">
      <view wx:for="{{mine.badges}}" wx:key="key" class="badge">{{item.name}}</view>
    </view>
    <view wx:else class="muted">还没有徽章，赢一场就有了</view>
  </view>

  <!-- 榜单切换 -->
  <view class="tabs">
    <view wx:for="{{tabs}}" wx:key="key" class="tab {{tab === item.key ? 'on' : ''}}"
      data-tab="{{item.key}}" bindtap="pickTab">{{item.name}}</view>
  </view>

  <block wx:if="{{tab === 'week'}}">
    <view wx:if="{{loaded && !week.length}}" class="card muted">本周还没有人赢下挑战</view>
    <view wx:for="{{week}}" wx:key="openid" class="card rank-row {{item.openid === mine.openid ? 'me' : ''}}">
      <view class="between">
        <view class="row" style="gap:16rpx;align-items:center">
          <text class="rank {{index < 3 ? 'top' : ''}}">{{index + 1}}</text>
          <text class="rank-name">{{item.name}}</text>
          <text wx:if="{{item.banned}}" class="tag">禁赛</text>
        </view>
        <view class="score"><text class="num">{{item.weekWins}}</text><text class="muted"> 胜</text></view>
      </view>
      <view wx:if="{{item.badges.length}}" class="badges small">
        <text wx:for="{{item.badges}}" wx:key="key" class="badge small">{{item.name}}</text>
      </view>
    </view>
  </block>

  <block wx:if="{{tab === 'streak'}}">
    <view wx:if="{{loaded && !streak.length}}" class="card muted">目前没有连胜的人</view>
    <view wx:for="{{streak}}" wx:key="openid" class="card rank-row {{item.openid === mine.openid ? 'me' : ''}}">
      <view class="between">
        <view class="row" style="gap:16rpx;align-items:center">
          <text class="rank {{index < 3 ? 'top' : ''}}">{{index + 1}}</text>
          <text class="rank-name">{{item.name}}</text>
        </view>
        <view class="score"><text class="num">{{item.streak}}</text><text class="muted"> 连胜</text></view>
      </view>
    </view>
  </block>

  <block wx:if="{{tab === 'total'}}">
    <view wx:if="{{loaded && !total.length}}" class="card muted">还没有判定过的挑战</view>
    <view wx:for="{{total}}" wx:key="openid" class="card rank-row {{item.openid === mine.openid ? 'me' : ''}}">
      <view class="between">
        <view class="row" style="gap:16rpx;align-items:center">
          <text class="rank {{index < 3 ? 'top' : ''}}">{{index + 1}}</text>
          <text class="rank-name">{{item.name}}</text>
          <text wx:if="{{item.banned}}" class="tag">禁赛</text>
        </view>
        <view class="score"><text class="num">{{item.wins}}</text><text class="muted"> 胜</text></view>
      </view>
      <view class="muted small">{{item.losses}} 负 · {{item.draws}} 平 · 胜率 {{item.winRate}}%</view>
    </view>
  </block>

  <view class="rule muted">徽章：首胜 / 三连 / 五连 / 以下克上 / 全项目挑战者 / 清白之身</view>
</view>
`

const boardWxss = `/* 挑战榜 */
.my-card { background: linear-gradient(180deg, var(--brand-soft), var(--surface)); }
.my-name { font-size: 32rpx; font-weight: 600; color: var(--ink); }
.my-num { text-align: right; }
.num { font-size: 40rpx; font-weight: 700; color: var(--brand-strong); }
.ban { margin-top: 10rpx; font-size: 24rpx; color: var(--danger); }
.badges { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 14rpx; }
.badge {
  font-size: 22rpx; color: var(--brand-strong); background: var(--brand-soft);
  border-radius: var(--r-pill); padding: 4rpx 16rpx;
}
.badge.small { font-size: 20rpx; padding: 2rpx 12rpx; color: var(--sub); background: var(--fill); }
.badges.small { margin-top: 8rpx; }
.tabs { display: flex; gap: 8rpx; margin: 16rpx 0; }
.tab {
  flex: 1; text-align: center; font-size: 25rpx; color: var(--sub);
  background: var(--fill); border-radius: var(--r-pill); padding: 12rpx 0;
}
.tab.on { background: var(--brand); color: #fff; font-weight: 600; }
.rank-row.me { outline: 2rpx solid var(--brand-line); }
.rank {
  width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center;
  font-size: 24rpx; color: var(--muted); background: var(--fill); border-radius: 50%;
}
.rank.top { background: var(--brand); color: #fff; }
.rank-name { font-size: 29rpx; font-weight: 600; color: var(--ink); }
.score .num { font-size: 34rpx; }
.small { font-size: 23rpx; }
.rule { text-align: center; font-size: 22rpx; padding: 24rpx 0 8rpx; }
`

const boardJson = JSON.stringify({
  navigationBarTitleText: '挑战榜',
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
}, null, 2) + '\n'

fs.writeFileSync(dir + '/board.js', boardJs)
fs.writeFileSync(dir + '/board.wxml', boardWxml)
fs.writeFileSync(dir + '/board.wxss', boardWxss)
fs.writeFileSync(dir + '/board.json', boardJson)
done.push('pages/challenges/board')

// ---------- 5. 注册页面 + 大厅加入口 ----------
const appPath = MP + '/app.json'
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))
if (!app.pages.includes('pages/challenges/board/board')) {
  const i = app.pages.indexOf('pages/challenges/list/list')
  app.pages.splice(i + 1, 0, 'pages/challenges/board/board')
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
  done.push('app.json 注册挑战榜')
}

edit('pages/challenges/list/list.wxml', t => {
  if (t.includes('goBoard')) return t
  return t.replace(
    `    <button class="btn" bindtap="goNew">发起挑战</button>`,
    `    <view class="board-btn" bindtap="goBoard">榜</view>
    <button class="btn" bindtap="goNew">发起挑战</button>`
  )
}, '大厅加挑战榜入口')

edit('pages/challenges/list/list.js', t => {
  if (t.includes('goBoard')) return t
  return t.replace(
    `  goNew() {`,
    `  goBoard() {
    wx.navigateTo({ url: '/pages/challenges/board/board' })
  },

  goNew() {`
  )
}, '大厅跳挑战榜')

edit('pages/challenges/list/list.wxss', t => {
  if (t.includes('.board-btn')) return t
  return t + `
/* 挑战榜入口 */
.board-btn {
  width: 60rpx; height: 60rpx; line-height: 60rpx; text-align: center;
  font-size: 26rpx; color: var(--brand-strong); background: var(--fill);
  border-radius: 50%; margin-right: 8rpx;
}
`
}, '大厅挑战榜入口样式')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/challenges/detail/detail.js', 'pages/challenges/board/board.js', 'pages/challenges/list/list.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
console.log('  ✓ 语法通过')
