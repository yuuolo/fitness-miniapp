// 单个身体指标的历史曲线
const api = require('../../utils/api')

const METRICS = [
  {
    "key": "weight",
    "name": "体重",
    "unit": "kg",
    "dir": -1
  },
  {
    "key": "bodyFat",
    "name": "体脂率",
    "unit": "%",
    "dir": -1
  },
  {
    "key": "muscle",
    "name": "肌肉量",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "muscleRate",
    "name": "肌肉率",
    "unit": "%",
    "dir": 1
  },
  {
    "key": "protein",
    "name": "蛋白质量",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "water",
    "name": "体水分量",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "boneMass",
    "name": "骨盐量",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "fatMass",
    "name": "脂肪量",
    "unit": "kg",
    "dir": -1
  },
  {
    "key": "skeletalMuscle",
    "name": "骨骼肌量",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "visceral",
    "name": "内脏脂肪",
    "unit": "级",
    "dir": -1
  },
  {
    "key": "heartRate",
    "name": "心率",
    "unit": "次/分",
    "dir": 0
  },
  {
    "key": "bmi",
    "name": "BMI",
    "unit": "",
    "dir": -1
  },
  {
    "key": "waistHipRatio",
    "name": "腰臀比",
    "unit": "",
    "dir": -1
  },
  {
    "key": "bodyAge",
    "name": "身体年龄",
    "unit": "岁",
    "dir": -1
  },
  {
    "key": "bmr",
    "name": "基础代谢",
    "unit": "kcal",
    "dir": 1
  },
  {
    "key": "fatFreeMass",
    "name": "去脂体重",
    "unit": "kg",
    "dir": 1
  },
  {
    "key": "score",
    "name": "身体评分",
    "unit": "分",
    "dir": 1
  }
]

function metaOf(key) {
  return METRICS.find(m => m.key === key) || { key, name: key, unit: '', dir: 0 }
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10
}

// 生成折线图 SVG（背景图形式，和小程序里其它图表一致）
function lineSvg(values, opts) {
  const W = 620
  const H = 300
  const padL = 54
  const padR = 26
  const padT = 22
  const padB = 30
  const n = values.length
  if (!n) return ''
  const vs = values.map(v => Number(v))
  let min = Math.min.apply(null, vs)
  let max = Math.max.apply(null, vs)
  if (max === min) { max = max + 1; min = min - 1 }
  const pad = (max - min) * 0.18
  min -= pad
  max += pad
  const span = max - min || 1

  const xOf = i => n === 1 ? (padL + (W - padL - padR) / 2) : padL + (W - padL - padR) * i / (n - 1)
  const yOf = v => padT + (H - padT - padB) * (1 - (Number(v) - min) / span)

  const pts = vs.map((v, i) => [xOf(i), yOf(v)])
  const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const area = 'M' + padL + ',' + (H - padB) + ' L' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') +
    ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + (H - padB) + ' Z'

  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = (padT + (H - padT - padB) * t).toFixed(1)
    return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#efe9e3" stroke-width="1"/>'
  }).join('')

  const dots = pts.map((p, i) => {
    const last = i === pts.length - 1
    return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 6 : 3.4) + '" fill="' + (last ? '#c8562f' : '#e0b3a0') + '"/>'
  }).join('')

  const yTop = round1(max)
  const yBottom = round1(min)
  const labels = '<text x="8" y="' + (padT + 4) + '" font-size="18" fill="#9c948c">' + yTop + '</text>' +
    '<text x="8" y="' + (H - padB) + '" font-size="18" fill="#9c948c">' + yBottom + '</text>'

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    grid +
    '<path d="' + area + '" fill="rgba(200,86,47,0.10)"/>' +
    '<polyline points="' + line + '" fill="none" stroke="#c8562f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + labels +
    '</svg>'

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

Page({
  data: {
    key: '',
    meta: null,
    loaded: false,
    svg: '',
    latest: null,
    prev: null,
    deltaText: '',
    tone: 'flat',
    list: [],
    count: 0
  },

  onLoad(query) {
    const key = (query || {}).key || 'weight'
    const meta = metaOf(key)
    this.setData({ key, meta })
    wx.setNavigationBarTitle({ title: meta.name + ' 变化' })
    this.load()
  },

  load() {
    return api.call('bodyHistory', {}, { silent: true }).then(r => {
      const records = (r && r.records) || []
      const meta = this.data.meta
      const pts = records
        .filter(x => x[meta.key] != null && x[meta.key] !== '')
        .map(x => ({ date: x.date, value: Number(x[meta.key]) }))

      const list = pts.slice().reverse() // 最新在前
      const latest = list[0] || null
      const prev = list[1] || null
      let deltaText = ''
      let tone = 'flat'
      if (latest && prev) {
        const d = round1(latest.value - prev.value)
        deltaText = (d > 0 ? '+' : '') + d
        const dir = meta.dir || 0
        tone = d === 0 || dir === 0 ? 'flat' : ((d > 0 ? 1 : -1) === dir ? 'good' : 'bad')
      }

      this.setData({
        loaded: true,
        count: pts.length,
        svg: pts.length >= 2 ? lineSvg(pts.map(p => p.value)) : '',
        latest,
        prev,
        deltaText,
        tone,
        list
      })
    }, () => this.setData({ loaded: true }))
  }
})
