// 点击小人：1 秒内往右跑掉，然后换一个动作从左边跑回来
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

// ---------- wxml：把 canvas 包一层，用来接点击与做位移动画 ----------
edit('pages/index/index.wxml', t => {
  if (t.includes('hero-fig-wrap')) return t
  return t.replace(
    `        <!-- 右边的小人：Canvas 逐帧动画，动作每天固定一个 -->
        <canvas wx:if="{{heroPoseKey}}" type="2d" id="heroFig" class="hero-canvas"></canvas>`,
    `        <!-- 右边的小人：Canvas 逐帧动画，动作每天固定一个；点一下会跑掉换动作 -->
        <view wx:if="{{heroPoseKey}}" class="hero-fig-wrap {{figureState}}" bindtap="tapFigure">
          <canvas type="2d" id="heroFig" class="hero-canvas"></canvas>
        </view>`
  )
}, 'wxml 包一层可点击容器')

// ---------- wxss：容器状态（跑掉 / 重进） ----------
edit('pages/index/index.wxss', t => {
  if (t.includes('hero-fig-wrap')) return t
  return t.replace(
    `.hero-canvas {
  position: absolute;
  right: 20rpx;
  top: 50%;
  width: 156rpx;
  height: 156rpx;
  margin-top: -78rpx;
  pointer-events: none;
}`,
    `/* 小人的容器：负责位移与淡入淡出，canvas 只负责画动作 */
.hero-fig-wrap {
  position: absolute;
  right: 20rpx;
  top: 50%;
  width: 156rpx;
  height: 156rpx;
  margin-top: -78rpx;
  transition: transform 0.5s cubic-bezier(0.22, 0.8, 0.3, 1), opacity 0.5s ease;
}

/* 点一下：往右跑出画面（1 秒内） */
.hero-fig-wrap.run {
  transform: translateX(260%);
  opacity: 0;
  transition: transform 0.9s cubic-bezier(0.3, 0, 1, 0.7), opacity 0.9s ease;
}

/* 瞬间移到左边画面外（不要过渡，避免看到穿场） */
.hero-fig-wrap.reenter {
  transform: translateX(-260%);
  opacity: 0;
  transition: none;
}

.hero-canvas {
  width: 156rpx;
  height: 156rpx;
  display: block;
}`
  )
}, 'wxss 加跑动/重进状态')

// ---------- js：点击处理 ----------
edit('pages/index/index.js', t => {
  if (t.includes('tapFigure')) return t

  // data 增加 figureState
  t = t.replace(
    `    heroPoseName: '',
    heroFigSize: 78`,
    `    heroPoseName: '',
    heroFigSize: 78,
    figureState: ''`
  )

  // 动画循环改成每帧读当前姿势，这样换动作能立刻生效
  t = t.replace(
    `      const poseKey = this.data.heroPoseKey
      const gender = (this.data.me && this.data.me.gender) || 'male'`,
    `      const gender = (this.data.me && this.data.me.gender) || 'male'`
  )
  t = t.replace(
    `        this.heroFrames++
        heroAnim.drawCanvas(ctx, poseKey, gender, phase, size, dpr)`,
    `        this.heroFrames++
        heroAnim.drawCanvas(ctx, this.data.heroPoseKey, gender, phase, size, dpr)`
  )

  // 点击方法 + 随机换一个「不是当前」的动作
  t = t.replace(
    `  stopHeroAnim() {`,
    `  // 点小人：先切成跑步姿势往右跑掉，再换个动作从左边跑回来
  tapFigure() {
    if (this.figureBusy || !this.data.heroPoseKey) return
    this.figureBusy = true
    this.clearFigureTimers()

    // 1) 变成跑步姿势，同时容器往右滑出（0.9s）
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
        // 3) 从左边滑回原位
        this.setData({ figureState: '' })
        this.figureTimers.push(setTimeout(() => { this.figureBusy = false }, 600))
      }, 80))
    }, 900))
  },

  // 换一个和当前不同的动作
  pickOtherPose() {
    const cur = this.data.heroPoseKey
    const list = heroAnim.POSES.filter(p => p.key !== cur)
    const pool = list.length ? list : heroAnim.POSES
    return pool[Math.floor(Math.random() * pool.length)]
  },

  clearFigureTimers() {
    (this.figureTimers || []).forEach(t => clearTimeout(t))
    this.figureTimers = []
  },

  stopHeroAnim() {`
  )

  // 停止动画时也清掉换动作的定时器
  t = t.replace(
    `  stopHeroAnim() {
    this.heroAnimOn = false`,
    `  stopHeroAnim() {
    this.heroAnimOn = false
    this.clearFigureTimers()
    this.figureBusy = false`
  )

  return t
}, 'js 加点击换动作')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/index/index.js'])
console.log('  ✓ 语法通过')
