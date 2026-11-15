// 快捷入口：把标题/说明挪到图形上方
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

// ---------- WXML ----------
{
  const p = MP + '/pages/index/index.wxml'
  let t = fs.readFileSync(p, 'utf8')

  const oldRank = `        <view wx:if="{{features.rank !== false}}" class="q q-rank" bindtap="goRank">
          <view class="radar-wrap">
            <view wx:if="{{radarSvg}}" class="radar" style="background-image:url('{{radarSvg}}')"></view>
            <view wx:else class="radar radar-empty">
              <text class="radar-hint">还没有数据</text>
            </view>
          </view>
          <view class="q-t">排行榜</view>
          <view class="muted">{{radarScore !== null ? '综合能力 ' + radarScore : '录一次体测就能看到'}}</view>
        </view>`

  const newRank = `        <view wx:if="{{features.rank !== false}}" class="q q-rank" bindtap="goRank">
          <view class="q-t">排行榜</view>
          <view class="muted">{{radarScore !== null ? '综合能力 ' + radarScore : '录一次体测就能看到'}}</view>
          <view class="radar-wrap">
            <view wx:if="{{radarSvg}}" class="radar" style="background-image:url('{{radarSvg}}')"></view>
            <view wx:else class="radar radar-empty">
              <text class="radar-hint">还没有数据</text>
            </view>
          </view>
        </view>`

  const oldMoments = `        <view wx:if="{{features.moments !== false}}" class="q q-moments" bindtap="goMoments">
          <view class="thumbs">`

  const newMoments = `        <view wx:if="{{features.moments !== false}}" class="q q-moments" bindtap="goMoments">
          <view class="q-t">健身友圈</view>
          <view class="muted">晒训练日常</view>
          <view class="thumbs">`

  // 友圈：删掉原来在图形下面的标题与说明
  const oldMomentsTail = `          </view>
          <view class="q-t">健身友圈</view>
          <view class="muted">晒训练日常</view>
        </view>`
  const newMomentsTail = `          </view>
        </view>`

  let ok = true
  if (t.includes(oldRank)) t = t.replace(oldRank, newRank)
  else { console.log('⚠ 排行榜块未匹配'); ok = false }

  if (t.includes(oldMoments)) t = t.replace(oldMoments, newMoments)
  else { console.log('⚠ 友圈块开头未匹配'); ok = false }

  if (t.includes(oldMomentsTail)) t = t.replace(oldMomentsTail, newMomentsTail)
  else { console.log('⚠ 友圈块结尾未匹配'); ok = false }

  if (ok) {
    fs.writeFileSync(p, t)
    console.log('✓ WXML 顺序已调整：标题在上、图形在下')
  }
}

// ---------- WXSS：图形改为顶部留白 ----------
{
  const p = MP + '/pages/index/index.wxss'
  let t = fs.readFileSync(p, 'utf8')

  t = t.replace(
    `.radar-wrap {
  height: 150rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
}`,
    `.radar-wrap {
  height: 150rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 12rpx;
}`
  )

  t = t.replace(
    `.thumbs {
  display: flex;
  gap: 12rpx;
  height: 150rpx;
  margin-bottom: 12rpx;
}`,
    `.thumbs {
  display: flex;
  gap: 12rpx;
  height: 150rpx;
  margin-top: 12rpx;
}`
  )

  fs.writeFileSync(p, t)
  console.log('✓ WXSS 间距已改为图形顶部留白')
}
