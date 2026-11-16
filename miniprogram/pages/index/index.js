const api = require('../../utils/api')
const heroAnim = require('../../utils/hero-anim')
const sfx = require('../../utils/sfx')
const fmt = require('../../utils/format')
const features = require('../../utils/features')

// tabBar 页面必须用 switchTab，其它用 navigateTo
const TAB_PAGES = [
  '/pages/index/index',
  '/pages/moments/moments',
  '/pages/mine/mine'
]

// 条形图比例：以第一名为 100%，其它按比例算出宽度
// 最小值给 4%，避免最后几名短到看不见
function withPct(list, unit) {
  const top = list.length ? Number(list[0].value) || 0 : 0
  return list.map(it => Object.assign({}, it, {
    pct: top > 0 ? Math.max(4, Math.round(((Number(it.value) || 0) / top) * 100)) : 0,
    unit: it.unit || unit || 'kg'
  }))
}

// ---------- 快捷入口：六边形能力图 ----------
// 不用图表库也不用 canvas：算出雷达图的点和线，拼成 SVG，转 base64 当背景图。
// 这样在 wxss 里由 view 承载就行，深色模式、缩放都不用额外处理。
const B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// 字符串 → UTF-8 字节数组（SVG 里可能有中文，不能按单字节编码）
function utf8Bytes(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else {
      const c2 = str.charCodeAt(++i)
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    }
  }
  return out
}

function base64(str) {
  const bytes = utf8Bytes(str)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    const b3 = bytes[i + 2]
    out += B64CHARS[b1 >> 2]
    out += B64CHARS[((b1 & 3) << 4) | (b2 === undefined ? 0 : b2 >> 4)]
    if (b2 === undefined) { out += '=='; break }
    out += B64CHARS[((b2 & 15) << 2) | (b3 === undefined ? 0 : b3 >> 6)]
    if (b3 === undefined) { out += '='; break }
    out += B64CHARS[b3 & 63]
  }
  return out
}


// 六个维度，值都是 0~100；拿不到数据的维度记 0
function radarValues(f) {
  const body = (f && f.latestBody) || {}
  const best = (f && f.bestLift) || {}
  const weight = Number(body.weight) || 0
  const ratio = (v) => (weight > 0 ? (Number(v) || 0) / weight : 0)
  const clamp01 = (x) => Math.max(0, Math.min(1, x))

  // 力量：相对体重的倍数，按「新手 ~ 较强」区间映射
  const bench = clamp01((ratio(best.bench) - 0.3) / 1.1) * 100
  const squat = clamp01((ratio(best.squat) - 0.5) / 1.4) * 100
  const dead = clamp01((ratio(best.deadlift) - 0.7) / 1.7) * 100
  // 体脂：越低越好，8% 满分、35% 零分
  const fat = Number(body.bodyFat) > 0 ? clamp01((35 - body.bodyFat) / 27) * 100 : 0
  // 肌肉率：35% 零分、55% 满分
  const muscle = Number(body.muscleRate) > 0 ? clamp01((body.muscleRate - 35) / 20) * 100 : 0
  // 综合评分
  const score = Number(body.score) > 0 ? Number(body.score) : 0

  return [
    { key: 'bench', label: '卧推', value: round1(bench) },
    { key: 'squat', label: '深蹲', value: round1(squat) },
    { key: 'dead', label: '硬拉', value: round1(dead) },
    { key: 'fat', label: '体脂', value: round1(fat) },
    { key: 'muscle', label: '肌肉', value: round1(muscle) },
    { key: 'score', label: '综合', value: round1(score) }
  ]
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

// 生成雷达图 SVG（6 边形，20~100 分档）
function radarSvg(values) {
  const SIZE = 120
  const C = SIZE / 2
  const R = 33            // 网格半径（比原来小，给六角的字留位置）
  const N = 6
  const LABEL_R = 49      // 文字离中心的距离

  const angleOf = i => -Math.PI / 2 + (Math.PI * 2 * i) / N

  const point = (i, ratio) => {
    // 从正上方开始，顺时针分布
    const angle = angleOf(i)
    return [C + Math.cos(angle) * R * ratio, C + Math.sin(angle) * R * ratio]
  }
  const poly = (ratio) => {
    const pts = []
    for (let i = 0; i < N; i++) {
      const [x, y] = point(i, ratio)
      pts.push(x.toFixed(1) + ',' + y.toFixed(1))
    }
    return pts.join(' ')
  }

  // 网格：外框 + 两圈内环
  let grid = ''
  ;[1, 0.66, 0.33].forEach(r => {
    grid += '<polygon points="' + poly(r) + '" fill="none" stroke="#c9c2ba" stroke-width="1" opacity="0.55"/>'
  })
  // 轴线
  for (let i = 0; i < N; i++) {
    const [x, y] = point(i, 1)
    grid += '<line x1="' + C + '" y1="' + C + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) +
      '" stroke="#c9c2ba" stroke-width="1" opacity="0.45"/>'
  }

  // 六个角上的名称（即六个维度的参考值含义）
  let labels = ''
  values.forEach((v, i) => {
    const angle = angleOf(i)
    const lx = C + Math.cos(angle) * LABEL_R
    const ly = C + Math.sin(angle) * LABEL_R
    labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" ' +
      'text-anchor="middle" dominant-baseline="middle" font-size="11" ' +
      'font-family="-apple-system, PingFang SC, Microsoft YaHei, sans-serif" ' +
      'fill="#9c948c">' + v.label + '</text>'
  })

  // 数据多边形
  const dataPts = values.map((v, i) => {
    const [x, y] = point(i, Math.max(0.04, Math.min(1, v.value / 100)))
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
    grid +
    '<polygon points="' + dataPts + '" fill="#e9603a" fill-opacity="0.35" stroke="#e9603a" stroke-width="2" stroke-linejoin="round"/>' +
    labels +
    '</svg>'

  return 'data:image/svg+xml;base64,' + base64(svg)
}

Page({
  data: {
    loaded: false,
    initialized: true,
    me: null,
    features: {},
    // 管理员在后台配好的首页模块顺序
    layout: [],
    hasBlock: {},
    rankTop: [],
    rankMe: null,
    rankTotal: 0,
    rankName: '卧推',
    competitions: [],
    moments: [],
    // 快捷入口：六边形能力图（排行榜格子）
    radarSvg: '',
    radarScore: null,
    radarEmpty: true,
    // 快捷入口：最近两条动态的缩略图（友圈格子）
    momentThumbs: [],
    // 欢迎栏里的运动小人（Canvas 动画，姿势每天一个）
    heroPoseKey: '',
    heroPoseName: '',
    heroFigSize: 78,
    figureState: ''
  },

  onShow() {
    if (this.data.heroPoseKey && !this.heroAnimOn) this.startHeroAnim()
    this.syncTabBar()
    this.load()
  },

  // 自定义 tabBar 的高亮：真机上组件的 pageLifetimes.show 不一定触发，
  // 这里在每个 tab 页 onShow 主动同步一次，保证底部文字颜色跟得上
  syncTabBar() {
    const bar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (bar && typeof bar.refresh === 'function') bar.refresh()
  },

  // 今天的日期（北京时间），用来给「每天一个动作」做种子
  todayStr() {
    const d = new Date(Date.now() + 8 * 3600e3)
    const p = n => (n < 10 ? '0' + n : '' + n)
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
  },

  // 欢迎栏小人：Canvas 逐帧动画，动作每天固定一个
  startHeroAnim() {
    this.stopHeroAnim()
    if (!this.data.heroPoseKey) return
    const query = this.createSelectorQuery
      ? this.createSelectorQuery()
      : wx.createSelectorQuery()
    query.select('#heroFig').fields({ node: true, size: true }).exec(res => {
      const hit = res && res[0]
      if (!hit || !hit.node) return
      const canvas = hit.node
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const dpr = info.pixelRatio || 2
      const size = hit.width || this.data.heroFigSize
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const ctx = canvas.getContext('2d')
      const gender = (this.data.me && this.data.me.gender) || 'male'
      const PERIOD = 2200
      this.heroAnimOn = true
      let start = 0
      this.heroFrames = 0
      const step = ts => {
        if (!this.heroAnimOn) return
        if (!start) start = ts
        const phase = ((ts - start) % PERIOD) / PERIOD
        this.heroFrames++
        heroAnim.drawCanvas(ctx, this.data.heroPoseKey, gender, phase, size, dpr)
        if (canvas.requestAnimationFrame) canvas.requestAnimationFrame(step)
      }
      if (canvas.requestAnimationFrame) {
        canvas.requestAnimationFrame(step)
      } else {
        // 兜底：老版本没有 requestAnimationFrame 时用定时器
        this.heroTimer = setInterval(() => {
          if (!this.heroAnimOn) return
          const ts = Date.now()
          if (!start) start = ts
          heroAnim.drawCanvas(ctx, poseKey, gender, ((ts - start) % PERIOD) / PERIOD, size, dpr)
        }, 40)
      }
    })
  },

  // 点小人：先切成跑步姿势往右跑掉，再换个动作从左边跑回来
  tapFigure() {
    if (this.figureBusy || !this.data.heroPoseKey) return
    this.figureBusy = true
    this.clearFigureTimers()

    // 记住点之前的动作，换动作时避开它（否则可能换回同一个）
    this.prevFigureKey = this.data.heroPoseKey
    // 1) 变成跑步姿势，同时容器往右滑出（0.9s）
    sfx.playRunAway()
    this.setData({ heroPoseKey: 'run', heroPoseName: '跑步', figureState: 'run' })

    this.figureTimers.push(setTimeout(() => {
      // 2) 瞬间移到左侧画面外，并换一个动作
      const next = this.pickOtherPose()
      this.setData({
        figureState: 'reenter',
        heroPoseKey: next.key,
        heroPoseName: next.name
      })
      this.figureTimers.push(setTimeout(() => {
        // 3) 从左边滑回原位，配一声「啵」
        sfx.playAppear()
        this.setData({ figureState: '' })
        this.figureTimers.push(setTimeout(() => { this.figureBusy = false }, 600))
      }, 80))
    }, 900))
  },

  // 换一个和当前不同的动作
  pickOtherPose() {
    const cur = this.data.heroPoseKey
    const prev = this.prevFigureKey
    const list = heroAnim.POSES.filter(p => p.key !== cur && p.key !== prev)
    const pool = list.length ? list : heroAnim.POSES
    return pool[Math.floor(Math.random() * pool.length)]
  },

  clearFigureTimers() {
    (this.figureTimers || []).forEach(t => clearTimeout(t))
    this.figureTimers = []
  },

  stopHeroAnim() {
    this.heroAnimOn = false
    this.clearFigureTimers()
    this.figureBusy = false
    if (this.heroTimer) {
      clearInterval(this.heroTimer)
      this.heroTimer = null
    }
  },

  onHide() {
    this.stopHeroAnim()
  },

  onUnload() {
    this.stopHeroAnim()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('home', {}, { silent: !this.data.loaded }).then(res => {
      // 后端在 home 里顺带返回功能开关，顺便同步给 tabBar 等订阅者
      if (res.features) features.set(res.features)

      const blocks = res.layout || []
      // 快速判断「首页有没有这个模块」，用来决定要不要额外请求数据
      const hasBlock = {}
      blocks.forEach(b => { hasBlock[b.type] = true })

      // 欢迎栏的小人：每个人的动作各不相同，同一个人一天内固定
      const seed = (res.me && (res.me._id || res.me.phone || res.me.nickName)) || ''
      const fig = heroAnim.poseOfDay(seed, this.todayStr())

      this.setData({
        loaded: true,
        initialized: res.initialized,
        me: res.me,
        features: res.features || {},
        layout: blocks,
        hasBlock,
        heroPoseKey: fig.key,
        heroPoseName: fig.name
      })
      this.startHeroAnim()

      this.loadExtras(hasBlock, res.features || {})

      // 资料没填完时，每次启动小程序自动引导一次去完善（只引导一次，避免反复弹）
      if (res.initialized && res.me && !res.me.profileReady) this.promptProfile()
    })
  },

  // 按布局里实际出现的模块，只拉需要的附加数据
  loadExtras(hasBlock, feat) {
    if (hasBlock.rank && feat.rank !== false) this.loadRank()
    else this.setData({ rankTop: [], rankMe: null, rankTotal: 0 })

    if (hasBlock.competitions && feat.rank !== false) this.loadCompetitions()
    if (hasBlock.moments && feat.moments !== false) this.loadMoments()
    // 快捷入口里的能力图（排行榜格子）
    if (hasBlock.quick && feat.fitness !== false) this.loadRadar()
    // 快捷入口里的友圈缩略图：即使没有「友圈预览」模块也要拉
    if (hasBlock.quick && feat.moments !== false && !hasBlock.moments) this.loadMoments()
  },


  // 快捷入口：拉自己的身体数据，算六边形能力图
  loadRadar() {
    return api.call('myFitness', {}, { silent: true }).then(f => {
      const values = radarValues(f)
      // 六个维度全是 0 说明还没录数据
      const empty = values.every(v => v.value <= 0)
      const score = values[values.length - 1]
      this.setData({
        radarEmpty: empty,
        radarScore: empty ? null : Math.round(score.value),
        radarSvg: empty ? '' : radarSvg(values),
        radarValues: values
      })
    }, () => {})
  },

  // 首页展示排行榜前 5，并算出条形图比例
  loadRank() {
    return api.call('leaderboard', { lift: 'bench', metric: 'absolute' }, { silent: true }).then(r => {
      this.setData({
        rankTop: withPct((r.top || []).slice(0, 5), r.unit),
        rankMe: r.me,
        rankTotal: r.total,
        rankName: r.liftName
      })
    }, () => {})
  },

  loadCompetitions() {
    return api.call('competitionList', {}, { silent: true }).then(r => {
      const list = (r.list || [])
        .filter(c => c.status === 'active' || c.status === 'upcoming')
        .slice(0, 3)
      this.setData({ competitions: list })
    }, () => {})
  },

  loadMoments() {
    return api.call('momentList', {}, { silent: true }).then(r => {
      const raw = r.list || []
      // 友圈预览：作者名/时间/首图（服务端字段是 authorName / time / media）
      const list = raw.slice(0, 3).map(m => {
        const first = (m.media || [])[0] || null
        return {
          _id: m._id,
          authorName: m.authorName || '会员',
          content: (m.content || '').slice(0, 40),
          image: first ? (first.thumb || first.fileID || '') : '',
          isVideo: !!(first && first.type === 'video'),
          timeText: m.time || ''
        }
      })

      // 快捷入口缩略图：最近两条有图片或视频的动态
      const momentThumbs = []
      for (const m of raw) {
        const first = (m.media || [])[0]
        if (!first) continue
        momentThumbs.push({
          src: first.thumb || first.fileID || '',
          video: first.type === 'video'
        })
        if (momentThumbs.length >= 2) break
      }

      this.setData({ moments: list, momentThumbs })
    }, () => {})
  },

  promptProfile() {
    const app = getApp()
    if (!app.globalData) app.globalData = {}
    if (app.globalData.profilePrompted) return
    app.globalData.profilePrompted = true
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/profile/profile?first=1' })
    }, 500)
  },

  // ---------- 跳转 ----------

  navTo(url) {
    if (!url) return
    const clean = url.split('?')[0]
    if (TAB_PAGES.indexOf(clean) >= 0) wx.switchTab({ url: clean })
    else wx.navigateTo({ url })
  },

  // 自定义快捷入口 / 通用链接
  goLink(e) {
    this.navTo(e.currentTarget.dataset.page)
  },


  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },



  goMoments() {
    wx.switchTab({ url: '/pages/moments/moments' })
  },


  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  goCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/competitions' })
  },

  goCompetition(e) {
    wx.navigateTo({ url: '/pages/competition-detail/competition-detail?id=' + e.currentTarget.dataset.id })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  }
})
