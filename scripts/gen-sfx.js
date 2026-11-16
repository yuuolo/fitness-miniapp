// 生成两个短音效 WAV：跑掉（whoosh）+ 出现（pop）
// 22050Hz 单声道 16bit，体积很小，直接用在小程序里
const fs = require('fs')
const path = require('path')

const OUT = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/assets/sfx'
fs.mkdirSync(OUT, { recursive: true })

const RATE = 22050

function writeWav(file, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)          // fmt chunk size
  buf.writeUInt16LE(1, 20)           // PCM
  buf.writeUInt16LE(1, 22)           // mono
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)    // byte rate
  buf.writeUInt16LE(2, 32)           // block align
  buf.writeUInt16LE(16, 34)          // bits
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((v, i) => {
    const s = Math.max(-1, Math.min(1, v))
    buf.writeInt16LE(Math.round(s * 32000), 44 + i * 2)
  })
  fs.writeFileSync(file, buf)
  return buf.length
}

// 简单的一阶低通，让噪声不那么刺耳
function lowpass(samples, alpha) {
  let last = 0
  return samples.map(v => {
    last = last + alpha * (v - last)
    return last
  })
}

// ---------- 1. whoosh：扫频 + 噪声，模拟「嗖」地跑掉 ----------
function whoosh() {
  const dur = 0.42
  const n = Math.floor(RATE * dur)
  const out = []
  let noiseLP = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    // 频率从 700Hz 扫到 2600Hz，再回落，像快速掠过
    const f = 700 + 1900 * Math.sin(t * Math.PI * 0.85)
    const sine = Math.sin((2 * Math.PI * f * i) / RATE)
    const noise = Math.random() * 2 - 1
    noiseLP = noiseLP + 0.25 * (noise - noiseLP)
    // 包络：快速起、慢慢收
    const env = Math.min(1, t / 0.08) * Math.pow(1 - t, 1.6)
    out.push((sine * 0.45 + noiseLP * 0.55) * env * 0.55)
  }
  return lowpass(out, 0.5)
}

// ---------- 2. pop：短促的「啵」，配合新动作出现 ----------
function pop() {
  const dur = 0.16
  const n = Math.floor(RATE * dur)
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    // 音高从 900Hz 掉到 480Hz
    const f = 900 - 420 * Math.min(1, t * 1.6)
    const tone = Math.sin((2 * Math.PI * f * i) / RATE)
    const click = Math.random() * 2 - 1
    const env = Math.pow(1 - t, 2.2) * Math.min(1, t / 0.02)
    out.push((tone * 0.85 + click * 0.15) * env * 0.5)
  }
  return out
}

const a = writeWav(path.join(OUT, 'run-away.wav'), whoosh())
const b = writeWav(path.join(OUT, 'appear.wav'), pop())
console.log('run-away.wav: ' + Math.round(a / 1024) + ' KB')
console.log('appear.wav: ' + Math.round(b / 1024) + ' KB')
console.log('目录: ' + OUT)
