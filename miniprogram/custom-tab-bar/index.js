const features = require('../utils/features')

// 完整 tab 列表；feature 为 null 表示永远显示
const ALL_TABS = [
  { pagePath: '/pages/index/index', text: '首页', feature: null },
  { pagePath: '/pages/schedule/schedule', text: '约课', feature: 'classes' },
  { pagePath: '/pages/moments/moments', text: '友圈', feature: 'moments' },
  { pagePath: '/pages/venues/venues', text: '娱乐', feature: 'venues' },
  { pagePath: '/pages/mine/mine', text: '我的', feature: null }
]

Component({
  data: {
    tabs: ALL_TABS,
    current: '',
    ready: false
  },

  attached() {
    this.off = features.subscribe(() => this.refresh())
    features.ensure().then(() => this.refresh())
  },

  detached() {
    if (this.off) this.off()
  },

  pageLifetimes: {
    show() {
      features.ensure().then(() => this.refresh())
    }
  },

  methods: {
    // 根据开关过滤 tab，并按当前页面高亮
    refresh() {
      const tabs = ALL_TABS.filter(t => !t.feature || features.enabled(t.feature))
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      const route = cur && cur.route ? '/' + cur.route : ''
      this.setData({ tabs, current: route, ready: true })
    },

    onTap(e) {
      const path = e.currentTarget.dataset.path
      if (!path || path === this.data.current) return
      // 先本地高亮再切页：真机上切页有延迟，否则点了之后文字颜色要等一下才变
      this.setData({ current: path })
      wx.switchTab({ url: path })
    }
  }
})
