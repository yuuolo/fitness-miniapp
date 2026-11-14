// 功能开关测试：默认全开、保存、隐藏后接口被拦、描述接口
// 用法：DATABASE_URL=... node test/features.js
const assert = require('assert')
const { query, pool, ensureSchema } = require('../lib/db')
const features = require('../lib/features')

let passed = 0
const ok = name => { passed++; console.log('  \u2713 ' + name) }

async function expectThrow(fn, contains, name) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err, name + ' 应该失败')
  if (contains) assert.ok(String(err.message).includes(contains), name + ' 文案不符：' + err.message)
  ok(name)
}

async function main() {
  await ensureSchema()
  await query("delete from config where key = 'features'")
  await features.set({}, 'test') // 清掉内存缓存

  // ---------- 1. 默认 ----------
  const initial = await features.get()
  assert.deepStrictEqual(
    Object.keys(initial).filter(k => features.KEYS.includes(k)).sort(),
    features.KEYS.slice().sort()
  )
  for (const key of features.KEYS) assert.strictEqual(initial[key], true, key + ' 默认应为 true')
  ok('未配置时全部功能默认开启（' + features.KEYS.length + ' 个）')

  // ---------- 2. 关闭一个 ----------
  const afterOff = await features.set({ classes: false }, 'test')
  assert.strictEqual(afterOff.classes, false)
  assert.strictEqual(afterOff.cards, true, '其他开关不受影响')
  ok('关闭「团课」后其他开关保持不变')

  await expectThrow(() => features.assertEnabled('classes'), '团课与私教预约', '关闭后 assertEnabled 抛出带功能名的业务错误')
  await features.assertEnabled('cards')
  ok('未关闭的功能 assertEnabled 正常通过')

  // ---------- 3. 落库 + 缓存失效 ----------
  const row = (await query("select value from config where key = 'features'")).rows[0].value
  assert.strictEqual(row.classes, false, '关闭状态应写入 config 表')
  assert.ok(row.updatedAt > 0)
  assert.strictEqual(row.updatedBy, 'test')
  ok('开关状态落库并记录操作人与时间')

  // ---------- 4. 描述接口 ----------
  const desc = await features.describe()
  assert.strictEqual(desc.features.length, features.KEYS.length)
  const cls = desc.features.find(f => f.key === 'classes')
  assert.strictEqual(cls.enabled, false)
  assert.ok(cls.name && cls.desc && cls.covers, '每个开关都应带名称、说明、覆盖范围')
  assert.strictEqual(desc.state.classes, false)
  assert.strictEqual(desc.updatedBy, 'test')
  ok('描述接口返回名称/说明/覆盖范围与当前状态')

  // ---------- 5. 非法输入 ----------
  await expectThrow(() => features.set({ nope: false }, 'test'), '未知的功能开关', '未知 key 被拒绝')
  await expectThrow(() => features.set({ cards: 'false' }, 'test'), 'true 或 false', '非布尔值被拒绝')
  ok('非法开关输入被拒绝')

  // ---------- 6. 全部关闭再全部打开 ----------
  const allOff = {}
  for (const key of features.KEYS) allOff[key] = false
  await features.set(allOff, 'test')
  const off = await features.get()
  for (const key of features.KEYS) assert.strictEqual(off[key], false)
  ok('可以一次性全部关闭')

  const allOn = {}
  for (const key of features.KEYS) allOn[key] = true
  await features.set(allOn, 'test')
  const on = await features.get()
  for (const key of features.KEYS) assert.strictEqual(on[key], true)
  ok('可以一次性全部打开（恢复原状）')

  // ---------- 7. 脏数据容错 ----------
  await query(
    "insert into config (key, value) values ('features', $1) on conflict (key) do update set value = excluded.value",
    [JSON.stringify({ cards: 'yes', classes: null, nope: true })]
  )
  await query("delete from config where key = 'features'") // 触发缓存失效
  const dirty = await features.get()
  assert.strictEqual(dirty.cards, true, '非布尔值应回退为默认 true')
  assert.strictEqual(dirty.classes, true)
  assert.ok(!('nope' in dirty), '未知键不应出现在结果里')
  ok('库里被写入脏数据时回退到安全默认值')

  console.log('\n全部 ' + passed + ' 项断言通过')
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n功能开关测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
