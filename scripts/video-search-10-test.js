// 测试：力量成绩附视频 / 友圈搜索 / 只看视频
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('排行榜项目可以编辑（改名/比法/排序）并有安全校验')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
if (t.includes('友圈支持按关键字搜索')) {
  console.log('· 已有该断言')
  process.exit(0)
}

const idx = t.indexOf(anchor) + anchor.length
const block = `
  { // 力量成绩附视频 + 友圈搜索
    const vid = 'https://gym.example.com/api/media/strengthvid123'

    // 带视频保存
    const withVideo = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 90, reps: 1, videoUrl: vid })
    assert.strictEqual(withVideo.videoUrl, vid, '保存后应带回视频地址')
    const fitWithVideo = await act('memberFitness', COACH, { openid: MEMBER })
    const rec = (fitWithVideo.strengthHistory || []).find(x => x.videoUrl)
    assert.ok(rec, '力量成绩历史里应能看到视频')
    assert.strictEqual(rec.videoUrl, vid)

    // 非法地址要拒绝
    await expectFail(
      () => act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 90, reps: 1, videoUrl: 'javascript:alert(1)' }),
      '视频地址', '非法视频地址应被拒'
    )
    ok('力量成绩可以附视频')

    // 不带视频也能正常保存（回归）
    const noVideo = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 100, reps: 1 })
    assert.strictEqual(noVideo.videoUrl, '')

    // 友圈搜索：1 个字就能搜（内容 / 作者）
    await act('postMoment', MEMBER, { content: '今天练了卧推 PR' })
    await act('postMoment', MEMBER, { content: '随便发一条' })
    const oneChar = await act('momentList', MEMBER, { keyword: '卧' })
    assert.ok(oneChar.list.some(m => m.content.indexOf('卧推') >= 0), '1 个字应该能搜到')
    assert.ok(oneChar.list.every(m => (m.content + m.authorName).indexOf('卧') >= 0), '搜索结果应只包含匹配项')

    // 作者名也参与搜索
    const authorName = oneChar.list.length ? oneChar.list[0].authorName : ''
    if (authorName) {
      const byAuthor = await act('momentList', MEMBER, { keyword: authorName.slice(0, 1) })
      assert.ok(byAuthor.list.length > 0, '按作者首字也能搜到')
    }

    // 只看视频
    await act('postMoment', MEMBER, {
      content: '视频动态',
      media: [{ fileID: 'https://gym.example.com/api/media/v1', type: 'video', duration: 5, size: 1000 }]
    })
    const onlyVideos = await act('momentList', MEMBER, { onlyVideo: true })
    assert.ok(onlyVideos.list.length >= 1, '应能筛出视频动态')
    assert.ok(onlyVideos.list.every(m => m.type === 'video'), '只看视频时结果应全是视频')
    ok('友圈支持按关键字搜索（1 个字起）和只看视频')
  }`

t = t.slice(0, idx) + block + t.slice(idx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加入测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
