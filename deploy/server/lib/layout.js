// 首页布局：管理员按角色编排首页模块（顺序、开关、自定义快捷入口）
//
// 存 config 表的 layout 键。小程序首页按当前登录人的角色取对应数组，
// 按顺序渲染。管理员在后台可以上下移动、隐藏模块，还能把任意页面
// 做成「快捷入口卡片」放到首页更靠前的位置。
const { query } = require('./db')
const { fail, need, ROLE_LEVEL } = require('./common')

const CONFIG_KEY = 'layout'
const CACHE_MS = 5000
let cache = { at: 0, value: null }

// 可用的模块类型（前端按 type 渲染固定样式）
const BLOCK_TYPES = [
  { type: 'hero', name: '欢迎与积分', desc: '顶部问候语、积分', scope: 'all' },
  { type: 'entry', name: '入场码按钮', desc: '出示二维码给前台扫码', scope: 'all', feature: 'cards' },
  { type: 'stats', name: '今日概况', desc: '入场人次/课程预约/娱乐预约/会员总数', scope: 'staff' },
  { type: 'quick', name: '快捷入口', desc: '约团课、娱乐预约等宫格', scope: 'all' },
  { type: 'rank', name: '排行榜预览', desc: '排行榜前 5 名 + 我的名次', scope: 'all', feature: 'rank' },
  { type: 'cards', name: '我的会员卡', desc: '会员卡列表与剩余次数', scope: 'all', feature: 'cards' },
  { type: 'bookings', name: '今日预约', desc: '今天要上的课与娱乐预约', scope: 'all', feature: 'classes' },
  { type: 'competitions', name: '竞赛预览', desc: '进行中的竞赛', scope: 'all', feature: 'rank' },
  { type: 'moments', name: '友圈预览', desc: '最新几条动态', scope: 'all', feature: 'moments' },
  { type: 'link', name: '自定义快捷入口', desc: '指向任意页面的一张卡片', scope: 'all' }
]

// 可以做成快捷入口的页面
const PAGE_CATALOG = [
  { path: '/pages/entry/entry', name: '入场码', tab: false },
  { path: '/pages/cards/cards', name: '我的会员卡', tab: false },
  { path: '/pages/bookings/bookings', name: '我的预约', tab: false },
  { path: '/pages/schedule/schedule', name: '约团课', tab: true },
  { path: '/pages/venues/venues', name: '娱乐预约', tab: true },
  { path: '/pages/moments/moments', name: '健身友圈', tab: true },
  { path: '/pages/rank/rank', name: '力量排行榜', tab: false },
  { path: '/pages/competitions/competitions', name: '竞赛', tab: false },
  { path: '/pages/fitness/fitness', name: '我的身体数据', tab: false },
  { path: '/pages/profile/profile', name: '个人资料', tab: false },
  { path: '/pages/mine/mine', name: '我的', tab: true },
  { path: '/pages/staff/index/index', name: '员工工作台', tab: false },
  { path: '/pages/staff/schedule/schedule', name: '排课与签到', tab: false },
  { path: '/pages/staff/members/members', name: '会员与办卡', tab: false },
  { path: '/pages/staff/competitions/competitions', name: '竞赛管理', tab: false },
  { path: '/pages/staff/venue-bookings/venue-bookings', name: '娱乐预约核销', tab: false }
]

const PAGE_PATHS = new Set(PAGE_CATALOG.map(p => p.path))
const TYPES = new Set(BLOCK_TYPES.map(b => b.type))
const ROLES = ['member', 'coach', 'staff', 'admin']

const MAX_BLOCKS = 20
const MAX_LINKS_PER_ROLE = 8

let seq = 0
function newId(type) {
  seq = (seq + 1) % 1000
  return type + '_' + Date.now().toString(36) + seq.toString(36)
}

function block(type, extra) {
  const meta = BLOCK_TYPES.find(b => b.type === type)
  return Object.assign({
    id: type,
    type,
    title: meta ? meta.name : type,
    desc: meta ? meta.desc : '',
    enabled: true
  }, extra || {})
}

// 各角色的默认布局
function defaults() {
  const social = [
    block('hero'),
    block('entry'),
    block('quick'),
    block('rank'),
    block('cards'),
    block('bookings')
  ]
  return {
    member: social,
    coach: [block('hero'), block('stats'), block('quick'), block('competitions'), block('rank'), block('schedule-link', {
      type: 'link', title: '排课与签到', desc: '今天要带的课', icon: '📋',
      page: '/pages/staff/schedule/schedule', enabled: true
    })],
    staff: [block('stats'), block('hero'), block('entry'), block('quick'), block('bookings'), block('competitions')],
    admin: [block('stats'), block('hero'), block('entry'), block('quick'), block('competitions'), block('rank'), block('cards')]
  }
}

function blank() {
  return { version: 1, roles: defaults(), updatedAt: 0, updatedBy: '' }
}

/** 归一化：补齐缺的角色、清理非法字段 */
function normalize(raw) {
  const base = blank()
  if (!raw || typeof raw !== 'object') return base
  const roles = {}
  for (const role of ROLES) {
    const list = Array.isArray(raw.roles && raw.roles[role]) ? raw.roles[role] : base.roles[role]
    roles[role] = list.slice(0, MAX_BLOCKS).map(item => {
      const type = TYPES.has(item && item.type) ? item.type : null
      if (!type) return null
      const meta = BLOCK_TYPES.find(b => b.type === type)
      const out = {
        id: String(item.id || type).slice(0, 40),
        type,
        title: String(item.title || meta.name).slice(0, 20),
        desc: String(item.desc || '').slice(0, 30),
        enabled: item.enabled !== false
      }
      if (type === 'link') {
        out.page = PAGE_PATHS.has(item.page) ? item.page : ''
        out.icon = String(item.icon || '🔗').slice(0, 4)
        if (!out.page) return null
      }
      if (meta.feature) out.feature = meta.feature
      return out
    }).filter(Boolean)
  }
  return {
    version: 1,
    roles,
    updatedAt: Number(raw.updatedAt) || 0,
    updatedBy: String(raw.updatedBy || '')
  }
}

async function readRaw() {
  const res = await query('select value from config where key = $1', [CONFIG_KEY])
  if (!res.rows.length) return null
  const value = res.rows[0].value
  if (value === null || value === undefined) return null
  // config.value 是 jsonb：pg 已经解析成对象了；兼容万一存成字符串的情况
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (e) {
      return null
    }
  }
  return value
}

/** 读整份布局（带 5 秒缓存） */
async function get(force) {
  const now = Date.now()
  if (!force && cache.value && now - cache.at < CACHE_MS) return cache.value
  const value = normalize(await readRaw())
  cache = { at: now, value }
  return value
}

/** 取某个角色生效的模块（已过滤隐藏项） */
async function forRole(role) {
  const layout = await get()
  const useRole = ROLES.includes(role) ? role : 'member'
  return layout.roles[useRole].filter(b => b.enabled)
}

/** 保存整份布局（管理员） */
async function save({ me, data }) {
  need(me, 'admin')
  const payload = normalize({ roles: data && data.roles, updatedAt: Date.now(), updatedBy: me.nickName || '管理员' })

  // 每角色的自定义入口数量限制
  for (const role of ROLES) {
    const links = payload.roles[role].filter(b => b.type === 'link')
    if (links.length > MAX_LINKS_PER_ROLE) {
      fail('每个角色最多 ' + MAX_LINKS_PER_ROLE + ' 个自定义快捷入口')
    }
    if (!payload.roles[role].length) fail('每个角色至少保留一个模块')
  }

  payload.updatedAt = Date.now()
  payload.updatedBy = me.nickName || '管理员'
  await query(
    `insert into config (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [CONFIG_KEY, JSON.stringify(payload)]
  )
  cache = { at: 0, value: null }
  return payload
}

function describe() {
  return {
    blocks: BLOCK_TYPES,
    pages: PAGE_CATALOG,
    roles: ROLES.map(r => ({
      key: r,
      name: { member: '会员', coach: '教练', staff: '前台', admin: '管理员' }[r]
    })),
    defaults: defaults(),
    maxBlocks: MAX_BLOCKS,
    maxLinks: MAX_LINKS_PER_ROLE
  }
}

/** 新建一个自定义入口模块（供后台「新增」用） */
function makeLink({ title, desc, icon, page }) {
  if (!PAGE_PATHS.has(page)) fail('页面不存在')
  return block('link', {
    id: newId('lnk'),
    title: String(title || '').slice(0, 20) || (PAGE_CATALOG.find(p => p.path === page) || {}).name || '快捷入口',
    desc: String(desc || '').slice(0, 30),
    icon: String(icon || '🔗').slice(0, 4),
    page
  })
}

module.exports = {
  CONFIG_KEY,
  BLOCK_TYPES,
  PAGE_CATALOG,
  ROLES,
  defaults,
  normalize,
  get,
  forRole,
  save,
  describe,
  makeLink,
  maxLinks: MAX_LINKS_PER_ROLE,
  maxBlocks: MAX_BLOCKS
}
