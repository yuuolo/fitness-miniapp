// 首页布局：默认值、校验、按角色过滤、保存与缓存
// 用法：DATABASE_URL=postgres://.../gym_layout node test/layout.js
// 生产库保护：测试会清表，绝不能在 gym 上跑
require('./_guard')
const assert = require('assert')
const { query, pool, ensureSchema } = require('../lib/db')
const { memberRow } = require('../lib/common')
const layout = require('../lib/layout')

let passed = 0
const ok = name => { passed++; console.log('  \u2713 ' + name) }

async function expectFail(fn, contains, name) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err, name + ' 应该失败')
  if (contains) assert.ok(String(err.message).includes(contains), name + ' 文案不符：' + err.message)
  ok(name)
}

async function main() {
  await ensureSchema()
  await query("delete from config where key = 'layout'")

  // ---------- 1. 默认值 ----------
  const def = layout.defaults()
  assert.deepStrictEqual(Object.keys(def).sort(), ['admin', 'coach', 'member'])
  assert.strictEqual(def.member.length, 6)
  assert.strictEqual(def.member[0].type, 'hero')
  assert.ok(def.member.some(b => b.type === 'hero'))
  assert.ok(def.member.some(b => b.type === 'competitions'), '默认会员布局应包含竞赛预览')
  assert.ok(def.member.some(b => b.type === 'challenge'), '默认会员布局应包含挑战预览')
  assert.ok(def.member.every(b => b.enabled), '默认布局的模块都应默认显示')
  assert.ok(def.admin.some(b => b.type === 'hero'), '管理员默认带欢迎模块')
  // 这 4 个模块已彻底删除，不应再出现
  // 注意：上一行没有分号，这里的数组字面量必须以 ; 开头，否则会被当成下标访问
  ;['entry', 'stats', 'cards', 'bookings'].forEach(type => {
    assert.ok(!def.member.some(b => b.type === type), '默认布局不应再有 ' + type)
    assert.ok(!def.admin.some(b => b.type === type), '默认布局不应再有 ' + type)
  })
  assert.ok(def.coach.some(b => b.type === 'link'), '教练默认带一个自定义入口')
  ok('三个角色都有默认布局，且带各自特色的模块')

  const meta = layout.describe()
  assert.strictEqual(meta.blocks.length, 7, '可选模块只剩 7 种')
  assert.ok(meta.pages.length >= 8, '可选页面至少 8 个，实际 ' + meta.pages.length)
  assert.strictEqual(meta.roles.length, 3, '角色只有会员/教练/管理员')
  assert.ok(meta.defaults.member)
  ok('describe() 返回模块清单、页面清单、角色与默认值')

  // 快捷入口只能指向真实存在的页面。容器镜像里没有 miniprogram 目录，
  // 找得到 app.json 就对照检查，找不到就跳过（本地跑 node scripts/check.js 也会查这个）。
  const fs = require('fs')
  const path = require('path')
  const appJsonPath = path.join(__dirname, '../../../miniprogram/app.json')
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
    const appPages = new Set(appJson.pages.map(p => '/' + p))
    const dead = meta.pages.filter(p => !appPages.has(p.path))
    assert.deepStrictEqual(dead.map(d => d.path), [], '快捷入口不能指向已删除的页面')
    ok('布局里的快捷入口页面全部真实存在（无死链）')
  } else {
    console.log('  - 跳过 app.json 对照（容器内没有 miniprogram 目录）')
  }

  // ---------- 2. 归一化 ----------
  const clean = layout.normalize({
    roles: {
      member: [
        { type: 'hero', title: '欢迎' },
        { type: 'nope', title: '非法模块' },
        { type: 'link', title: '坏链接', page: '/pages/not-exist' },
        { type: 'rank', enabled: false }
      ],
      coach: 'not-an-array'
    }
  })
  assert.strictEqual(clean.roles.member.length, 2, '非法模块与非法页面应被丢掉')
  assert.deepStrictEqual(clean.roles.member.map(b => b.type), ['hero', 'rank'])
  assert.strictEqual(clean.roles.member[1].enabled, false)
  assert.ok(Array.isArray(clean.roles.coach) && clean.roles.coach.length > 0, '非法角色回退到默认')
  assert.strictEqual(clean.roles.admin.length, layout.defaults().admin.length, '缺失角色用默认补')
  ok('归一化会丢掉非法模块与非法快捷入口，缺失角色用默认补齐')

  // ---------- 3. 读默认 ----------
  const fresh = await layout.get(true)
  assert.strictEqual(fresh.roles.member.length, 6)
  assert.strictEqual(fresh.updatedAt, 0)
  const memberBlocks = await layout.forRole('member')
  assert.strictEqual(memberBlocks.length, 6)
  ok('没配置过时读出来就是默认布局')

  // ---------- 4. 自定义快捷入口 ----------
  const link = layout.makeLink({ page: '/pages/competitions/competitions', title: '看竞赛', desc: '实时排名', icon: '🏆' })
  assert.strictEqual(link.type, 'link')
  assert.strictEqual(link.page, '/pages/competitions/competitions')
  assert.strictEqual(link.title, '看竞赛')
  assert.strictEqual(link.icon, '🏆')
  assert.ok(link.id.startsWith('lnk_'))
  ok('可以生成指向任意页面的快捷入口卡片')

  await expectFail(
    () => layout.makeLink({ page: '/pages/hack', title: '越权页' }),
    '页面不存在', '快捷入口只能指向白名单页面'
  )

  // ---------- 5. 保存与权限 ----------
  const admin = memberRow({ openid: 'layout-admin', nick_name: '测试管理员', role: 'admin' })
  const member = memberRow({ openid: 'layout-member', nick_name: '小明', role: 'member' })

  await expectFail(
    () => layout.save({ me: member, data: { roles: layout.defaults() } }),
    '没有权限', '普通会员不能改首页布局'
  )

  const roles = layout.defaults()
  // 会员首页：把自定义入口放到第一位，并隐藏友圈预览
  roles.member = [
    link,
    { id: 'hero', type: 'hero', title: '欢迎', enabled: true },
    { id: 'moments', type: 'moments', title: '友圈预览', enabled: false }
  ]
  const saved = await layout.save({ me: admin, data: { roles } })
  assert.strictEqual(saved.updatedBy, '测试管理员')
  assert.ok(saved.updatedAt > 0)
  ok('管理员保存布局，记录操作人与时间')

  const reread = await layout.get(true)
  assert.strictEqual(reread.roles.member.length, 3)
  assert.strictEqual(reread.roles.member[0].type, 'link')
  assert.strictEqual(reread.roles.member[0].title, '看竞赛')
  ok('保存后重新读取，顺序与自定义入口都保留')

  // ---------- 6. 按角色过滤隐藏项 ----------
  const active = await layout.forRole('member')
  assert.ok(active.length >= 1, '隐藏的模块不应出现在生效列表里')
  assert.deepStrictEqual(active.map(b => b.type), ['link', 'hero'])
  ok('forRole 过滤掉隐藏模块')

  const coachActive = await layout.forRole('coach')
  assert.ok(coachActive.length > 0, '没动过的角色仍是默认')
  // 未知角色回退到「会员」的当前布局（不是默认布局）
  const unknownRole = await layout.forRole('nobody')
  assert.deepStrictEqual(unknownRole.map(b => b.type), active.map(b => b.type), '未知角色按会员处理')
  ok('未配置的角色与未知角色都有合理回退')

  // ---------- 7. 边界校验 ----------
  await expectFail(
    () => layout.save({ me: admin, data: { roles: { member: [] } } }),
    '至少保留一个模块', '每个角色至少要有一个模块'
  )

  const tooMany = layout.defaults()
  tooMany.member = []
  for (let i = 0; i < layout.maxLinks + 1; i++) {
    tooMany.member.push(layout.makeLink({ page: '/pages/rank/rank', title: '榜' + i }))
  }
  await expectFail(
    () => layout.save({ me: admin, data: { roles: tooMany } }),
    '最多', '自定义快捷入口有数量上限'
  )
  ok('布局保存有边界校验（不能清空、入口数量有上限）')

  // ---------- 8. 缓存 ----------
  const roles2 = layout.defaults()
  roles2.member = [{ id: 'hero', type: 'hero', title: '欢迎', enabled: true }]
  await layout.save({ me: admin, data: { roles: roles2 } })
  const afterSave = await layout.forRole('member')   // 不强制刷新，验证缓存被清掉
  assert.strictEqual(afterSave.length, 1)
  ok('保存后缓存立即失效，不会读到旧布局')

  console.log('\n全部 ' + passed + ' 项断言通过')
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n首页布局测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
