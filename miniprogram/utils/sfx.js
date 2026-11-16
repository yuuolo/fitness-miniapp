// 音效工具：懒加载 InnerAudioContext，失败静默（不打扰业务）
// 跟随系统静音开关（obeyMuteSwitch 默认 true），iOS/Android 都不会在静音时出声
const SOURCES = {
  runAway: '/assets/sfx/run-away.wav',
  appear: '/assets/sfx/appear.wav'
}

const cache = {}

function context(key) {
  const src = SOURCES[key]
  if (!src) return null
  if (cache[key]) return cache[key]
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return null
  try {
    const audio = wx.createInnerAudioContext()
    audio.src = src
    audio.volume = 0.6
    audio.onError(() => {})
    cache[key] = audio
    return audio
  } catch (e) {
    return null
  }
}

function play(key) {
  const audio = context(key)
  if (!audio) return
  try {
    audio.stop()
    audio.seek(0)
    audio.play()
  } catch (e) {}
}

module.exports = {
  playRunAway: () => play('runAway'),
  playAppear: () => play('appear'),
  play
}
