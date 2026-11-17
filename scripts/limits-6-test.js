// 测试：上传/展示限制（管理页配置）生效
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('身体数据历史按测量日期排序，补录旧日期不影响最新档案')"

const extra = `  ok('身体数据历史按测量日期排序，补录旧日期不影响最新档案')

  // 上传/展示限制：管理页可配，服务端校验，列表按配置截断
  const limits = require('../lib/limits')
  const homeLimits = await act('home', MEMBER)
  assert.ok(homeLimits.mediaLimits, '首页接口应下发上传限制')
  assert.strictEqual(homeLimits.mediaLimits.maxDuration, 15, '默认视频时长应为 15 秒')
  assert.strictEqual(homeLimits.mediaLimits.maxCount, 9, '默认数量应为 9 个')

  // 配一套更严格的限制
  const saved = await limits.save({ maxDuration: 10, maxVideoMB: 8, maxCount: 3, maxTotalMB: 12, feedThumbs: 2 }, 'test')
  assert.strictEqual(saved.maxDuration, 10)
  assert.strictEqual(saved.maxCount, 3)
  const home2 = await act('home', MEMBER)
  assert.strictEqual(home2.mediaLimits.maxDuration, 10, '首页应立刻读到新配置')

  const url = i => 'https://gym.example.com/api/media/f' + i

  // 超过数量
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '四个',
      media: [1, 2, 3, 4].map(i => ({ fileID: url(i), type: 'image', size: 1000 }))
    }),
    '最多 3', '超过数量上限应被拒'
  )
  // 视频超时长
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '视频太长',
      media: [{ fileID: url('v'), type: 'video', duration: 20, size: 1000 }]
    }),
    '秒', '视频超时长应被拒'
  )
  // 视频超体积（8MB 上限）
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '视频太大',
      media: [{ fileID: url('v2'), type: 'video', duration: 5, size: 9 * 1024 * 1024 }]
    }),
    'MB', '视频超体积应被拒'
  )
  // 合计超体积（12MB 上限）
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '合计太大',
      media: [1, 2, 3].map(i => ({ fileID: url('t' + i), type: 'image', size: 5 * 1024 * 1024 }))
    }),
    'MB', '合计超体积应被拒'
  )
  ok('媒体数量/时长/体积上限生效')

  // 合法的一条，列表按 feedThumbs=2 截断
  await act('postMoment', MEMBER, {
    content: '三个小图',
    media: [1, 2, 3].map(i => ({ fileID: url('ok' + i), type: 'image', size: 1000 }))
  })
  const feed = await act('momentList', MEMBER, {})
  const first = feed.list[0]
  assert.strictEqual(first.media.length, 2, '列表应只返回 2 个媒体')
  assert.strictEqual(first.hiddenMedia, 1, '应提示还有 1 个没显示')
  assert.strictEqual(first.mediaCount, 3, '应带上总数')
  const detail = await act('momentDetail', MEMBER, { id: first._id })
  assert.strictEqual(detail.media.length, 3, '详情页仍然能看到全部 3 个')
  ok('列表按配置截断缩略图，详情仍然完整')

  // 越界配置要被拒
  await expectFail(() => limits.save({ maxDuration: 999 }, 'test'), '秒', '视频时长越界应被拒')
  await expectFail(() => limits.save({ maxCount: 0 }, 'test'), '个', '数量越界应被拒')

  // 恢复默认，避免影响后面的测试
  await limits.save({ maxDuration: 15, maxVideoMB: 12, maxCount: 9, maxTotalMB: 40, feedThumbs: 9 }, 'test')
  const homeBack = await act('home', MEMBER)
  assert.strictEqual(homeBack.mediaLimits.maxCount, 9, '限制应能恢复默认')
  ok('上传与展示限制可配置、可校验、可恢复')`

if (t.includes('上传与展示限制可配置')) {
  console.log('· 已有该断言')
} else if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
} else {
  t = t.replace(anchor, extra)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 已加入上传限制测试')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
