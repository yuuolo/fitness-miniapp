// 生成三个操作音效：保存（上扬）、点赞（清脆）、删除（下沉）
const fs = require('fs')
const path = require('path')

const OUT = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/assets/sfx'
const RATE = 22050

function writeWav(file, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((v, i) => {
    const s = Math.max(-1, Math.min(1, v))
    buf.writeInt16LE(Math.round(s * 32000), 44 + i * 2)
  })
  fs.writeFileSync(file, buf)
  return buf.length
}

// 单个音符：频率 f、时长 dur、起始时间 offset，带指数衰减包络
function tone(out, f, dur, offset, gain, decay) {
  const start = Math.floor(offset * RATE)
  const n = Math.floor(dur * RATE)
  for (let i = 0; i < n; i++) {
    const t = i / n
    const vib = 1 + 0.004 * Math.sin((2 * Math.PI * 5 * i) / RATE)
    const env = Math.pow(1 - t, decay || 2) * Math.min(1, i / (RATE * 0.006))
    const v = Math.sin((2 * Math.PI * f * vib * i) / RATE) * env * gain
    if (out[start + i] === undefined) out[start + i] = 0
    out[start + i] += v
  }
}

// 1) 保存：两音上扬（C6 → E6），柔和
function save() {
  const out = new Array(Math.floor(RATE * 0.36)).fill(0)
  tone(out, 1046.5, 0.13, 0, 0.34, 2.4)
  tone(out, 1318.5, 0.2, 0.1, 0.3, 2.2)
  return out
}

// 2) 点赞：很短的清脆「叮」
function like() {
  const out = new Array(Math.floor(RATE * 0.16)).fill(0)
  tone(out, 1760, 0.09, 0, 0.30, 3)
  tone(out, 2637, 0.06, 0.02, 0.16, 3)
  return out
}

// 3) 删除：两音下沉（A4 → E4），略闷
function del() {
  const out = new Array(Math.floor(RATE * 0.34)).fill(0)
  tone(out, 440, 0.14, 0, 0.30, 2.2)
  tone(out, 311.1, 0.2, 0.11, 0.28, 2.4)
  return out
}

console.log('save.wav: ' + Math.round(writeWav(path.join(OUT, 'save.wav'), save()) / 1024) + ' KB')
console.log('like.wav: ' + Math.round(writeWav(path.join(OUT, 'like.wav'), like()) / 1024) + ' KB')
console.log('delete.wav: ' + Math.round(writeWav(path.join(OUT, 'delete.wav'), del()) / 1024) + ' KB')
