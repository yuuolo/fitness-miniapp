// 体测报告解析：把小米八电极体脂秤（S800 等）报告的文字，解析成系统的体测字段
//
// 为什么先做「文本解析」而不是直接 OCR：
//   OCR 只是把图片变成文字，真正的价值在于把文字准确对应到字段。
//   解析器可以先用微信「提取文字」或任何 OCR 的结果喂进来，等接了 OCR 服务就自动串起来。
//
// 支持的字段与 lib/fitness.js 的 BODY_NUM_FIELDS 完全一致。

// 全角→半角、去掉多余空白
function normalize(input) {
  return String(input || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\r/g, '')
}

function round(n, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(n * p) / p
}

// 在 text 里从 from 开始取第一个数字（可带小数）
const NUM = /(\d+(?:\.\d+)?)/

/**
 * 取「标签后面的数字」
 * 兼容三种排版：
 *   体重 80.25kg      （同行）
 *   体重\n80.25kg     （换行）
 *   80.25kg 体重      （数字在前，节段分析是这种）
 */
function numberNear(text, label, opts) {
  const o = opts || {}
  const allowBefore = !!o.allowBefore
  const window = o.window || 40
  let idx = text.indexOf(label)
  while (idx >= 0) {
    const after = text.slice(idx + label.length, idx + label.length + window)
    let m = after.match(NUM)
    // 排除紧跟的下一个标签名里的数字（例如「骨骼肌量」误吞「骨骼肌指数」）
    if (m) {
      if (!(o.near && after.slice(0, m.index).length > o.near)) return Number(m[1])
      // 距离太远，尝试下一个出现位置
    }
    if (allowBefore) {
      const before = text.slice(Math.max(0, idx - 20), idx)
      const bm = before.match(/(\d+(?:\.\d+)?)\s*(?:kg|%|kcal)?\s*$/)
      if (bm) return Number(bm[1])
    }
    idx = text.indexOf(label, idx + 1)
  }
  return null
}

/** 取标签后紧跟的文字（用于身体形态 / 身体类型） */
function textAfter(text, label, maxLen) {
  const idx = text.indexOf(label)
  if (idx < 0) return ''
  const after = text.slice(idx + label.length, idx + label.length + (maxLen || 20))
  const m = after.match(/[^\n]*/)
  return (m ? m[0] : '').trim()
}

/**
 * 节段分析：图上是「数值 + 部位名」的矩阵，版面是「数值在前、部位名在后」：
 *   1.5kg 左上肢    1.5kg 右上肢
 *   11.5kg 躯干
 * 所以必须先找紧挨在标签前面的数字；找不到再看后面。
 * （如果先看后面，右上肢会错取到下一行的躯干值）
 */
function segmentValue(scope, name) {
  let idx = scope.indexOf(name)
  while (idx >= 0) {
    // 1. 前置：标签前 14 个字符内、以数字结尾
    const before = scope.slice(Math.max(0, idx - 14), idx)
    const bm = before.match(/(\d+(?:\.\d+)?)\s*(?:kg|%)?\s*$/)
    if (bm) return Number(bm[1])
    // 2. 后置：标签后 14 个字符内以数字开头（有些 OCR 会调换顺序）
    const after = scope.slice(idx + name.length, idx + name.length + 14)
    const am = after.match(/^\s*(\d+(?:\.\d+)?)/)
    if (am) return Number(am[1])
    idx = scope.indexOf(name, idx + 1)
  }
  return null
}

function parseSegments(text, startLabel, endLabel) {
  const start = text.indexOf(startLabel)
  if (start < 0) return {}
  const end = endLabel ? text.indexOf(endLabel, start + startLabel.length) : -1
  const scope = end > 0 ? text.slice(start, end) : text.slice(start)

  const out = {}
  const MAP = {
    leftArm: '左上肢',
    rightArm: '右上肢',
    trunk: '躯干',
    leftLeg: '左下肢',
    rightLeg: '右下肢'
  }
  for (const [key, name] of Object.entries(MAP)) {
    const v = segmentValue(scope, name)
    if (v !== null) out[key] = round(v, 2)
  }
  return out
}

/** 身体得分：报告底部「身体得分 74 分」 */
function parseScore(text) {
  const idx = text.indexOf('身体得分')
  if (idx < 0) return null
  const after = text.slice(idx + 4, idx + 40)
  const m = after.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const v = Number(m[1])
  return v >= 0 && v <= 100 ? round(v, 1) : null
}

/** 测量时间：2026/07/19 或 2026-07-19 或 2026年7月19日 */
function parseDate(text) {
  let m = text.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/)
  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
  }
  m = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/)
  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
  }
  return ''
}

/**
 * 节段分析（按坐标配对）
 *
 * 报告上脂肪和肌肉是左右并排的两张图，每张图里「数值在部位名正上方同一列」：
 *      1.5kg        1.5kg         ← 数值行
 *      左上肢        右上肢        ← 部位名行
 *                11.5kg
 *                躯干
 * 光看文字顺序会串（OCR 是按行读的），所以有坐标时优先按空间位置配对：
 * 同一个部位名上方的、水平位置几乎对齐的数值，就是它的值。
 */
const SEG_LABELS = ['左上肢', '右上肢', '躯干', '左下肢', '右下肢']
const SEG_KEYS = {
  左上肢: 'leftArm', 右上肢: 'rightArm', 躯干: 'trunk', 左下肢: 'leftLeg', 右下肢: 'rightLeg'
}

function numOf(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function segmentsFromBoxes(items) {
  if (!Array.isArray(items) || items.length < 10) return null

  // 两块面板的横向分界：以右栏标题的左边为界线。
  // 不能用两个标题的中点——脂肪面板右列（右上肢/躯干/右下肢）在 x≈515，
  // 中点会算到 361，把它们误判成右栏的肌肉。
  let fatX = null
  let muscleX = null
  items.forEach(it => {
    const t = String(it.text || '')
    if (fatX === null && t.indexOf('节段脂肪') >= 0) fatX = it.x
    if (muscleX === null && t.indexOf('节段肌肉') >= 0) muscleX = it.x
  })
  const hasPanels = fatX !== null && muscleX !== null
  const boundary = hasPanels ? muscleX - 20 : null

  const labels = items.filter(it => SEG_LABELS.indexOf(String(it.text || '').trim()) >= 0)
  const numbers = items.filter(it => {
    const t = String(it.text || '').trim()
    return /^\d+(\.\d+)?\s*(kg|KG|Kg)?$/.test(t)
  })
  if (!labels.length || !numbers.length) return null

  const fat = {}
  const muscle = {}
  let matched = 0

  labels.forEach(label => {
    const name = String(label.text).trim()
    const key = SEG_KEYS[name]
    if (!key) return
    const panel = hasPanels ? (label.x >= boundary ? 'muscle' : 'fat') : null

    // 候选：同一个面板、水平基本对齐、垂直在标签上方 5~95 像素
    const candidates = numbers
      .filter(n => {
        if (hasPanels) {
          const np = n.x >= boundary ? 'muscle' : 'fat'
          if (np !== panel) return false
        }
        const dx = Math.abs((n.x + (n.w || 0) / 2) - (label.x + (label.w || 0) / 2))
        const dy = label.y - n.y
        return dx <= 60 && dy >= 5 && dy <= 95
      })
      .sort((a, b) => b.y - a.y) // 取最靠近标签的上方那个

    if (!candidates.length) return
    const value = numOf(candidates[0].text)
    if (value === null) return
    if (panel === 'muscle') muscle[key] = round(value, 2)
    else fat[key] = round(value, 2)
    matched++
  })

  // 至少要凑齐一半，才认为空间配对可靠
  if (matched < 5) return null
  return {
    fat: Object.keys(fat).length ? fat : null,
    muscle: Object.keys(muscle).length ? muscle : null,
    matched
  }
}

// 身体形态是「人体剪影」下面的一行字（倒三角型 / 匀称型 …）。
// 纯文本匹配会误吞右边的「身体类型」格子（那些也是「…型」），所以按坐标取。
const SHAPES = ['倒三角型', '匀称型', '沙漏型', '梨型', '苹果型', '矩形型', '矩形', '瘦长型', '运动型', '健壮型']

function bodyShapeFromBoxes(items) {
  if (!Array.isArray(items) || !items.length) return null
  const header = items.find(it => String(it.text || '').indexOf('身体形态') >= 0)
  if (!header) return null
  const hits = items
    .filter(it => SHAPES.indexOf(String(it.text || '').trim()) >= 0)
    .filter(it => {
      const dy = it.y - header.y
      const dx = Math.abs(it.x - header.x)
      return dy > 20 && dy < 420 && dx < 240
    })
    .sort((a, b) => a.y - b.y)
  return hits.length ? String(hits[0].text).trim() : null
}

/**
 * 解析报告文字
 * @param {string} raw 报告文字（OCR 或手工粘贴）
 * @param {Array} [items] OCR 返回的带坐标识别项；有的话节段数据按坐标配对，更准
 * @returns {{fields: object, meta: object, warnings: string[], filled: string[]}}
 */
function parse(raw, items) {
  const text = normalize(raw)
  const warnings = []
  const fields = {}
  const filled = []

  const put = (key, value, label) => {
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) return
    fields[key] = value
    filled.push(label || key)
  }

  // ---------- 表头 ----------
  const meta = {}
  const nameMatch = text.match(/(?:名称|姓名)[:：]?\s*([^\s\n]{1,12})/)
  if (nameMatch) meta.name = nameMatch[1]
  if (/性别[:：]?\s*男/.test(text)) meta.gender = 'male'
  else if (/性别[:：]?\s*女/.test(text)) meta.gender = 'female'
  const age = numberNear(text, '年龄')
  if (age && age >= 5 && age <= 120) meta.age = age
  const height = numberNear(text, '身高')
  if (height && height >= 80 && height <= 250) {
    fields.height = height
    filled.push('身高')
  }
  const date = parseDate(text)
  if (date) {
    fields.date = date
    filled.push('测量日期')
  }
  if (meta.gender) fields.gender = meta.gender

  // ---------- 主指标 ----------
  put('weight', numberNear(text, '体重'), '体重')
  put('bodyFat', numberNear(text, '体脂率'), '体脂率')
  put('heartRate', numberNear(text, '心率'), '心率')
  put('bmi', numberNear(text, 'BMI'), 'BMI')

  // ---------- 成分 ----------
  put('muscle', numberNear(text, '肌肉量'), '肌肉量')
  put('muscleRate', numberNear(text, '肌肉率'), '肌肉率')
  put('protein', numberNear(text, '蛋白质量'), '蛋白质量')
  put('proteinRate', numberNear(text, '蛋白质率'), '蛋白质率')
  put('water', numberNear(text, '体水分量'), '体水分量')
  put('waterRate', numberNear(text, '身体水分'), '身体水分')
  put('boneMass', numberNear(text, '骨盐量'), '骨盐量')
  put('boneRate', numberNear(text, '骨盐率'), '骨盐率')
  put('fatMass', numberNear(text, '脂肪量'), '脂肪量')
  put('skeletalMuscle', numberNear(text, '骨骼肌量'), '骨骼肌量')
  put('visceral', numberNear(text, '内脏脂肪'), '内脏脂肪等级')

  // ---------- 评估指标 ----------
  put('waistHipRatio', numberNear(text, '腰臀比'), '腰臀比')
  put('bodyAge', numberNear(text, '身体年龄'), '身体年龄')
  put('skeletalMuscleIndex', numberNear(text, '骨骼肌指数'), '骨骼肌指数')
  put('recommendedCalories', numberNear(text, '建议热量'), '建议热量摄入')
  put('bmr', numberNear(text, '基础代谢'), '基础代谢率')
  put('fatFreeMass', numberNear(text, '去脂体重'), '去脂体重')

  // ---------- 形态 / 类型 / 得分 ----------
  // 身体形态优先按坐标取：右边「身体类型」格子里也都是「…型」，纯文本会误吞
  const shapeFromBox = items ? bodyShapeFromBoxes(items) : null
  if (shapeFromBox) {
    fields.bodyShape = shapeFromBox
    filled.push('身体形态')
  } else {
    const shape = textAfter(text, '身体形态', 16).match(/[\u4e00-\u9fa5]{2,6}型/)
    if (shape && shape[0] !== '身体类型') {
      fields.bodyShape = shape[0]
      filled.push('身体形态')
    }
  }
  const typeText = textAfter(text, '身体类型', 40)
  const typeHit = typeText.match(/(肥胖|偏胖|标准型|健康型|匀称型|隐形肥胖|肌肉型|瘦弱型|运动员型|偏瘦型)/)
  if (typeHit) {
    fields.bodyType = typeHit[1]
    filled.push('身体类型')
  }
  put('deviceScore', parseScore(text), '身体得分')

  // ---------- 节段 ----------
  // 有坐标时按空间位置配对（OCR 的真实版面会串行，必须用坐标）
  const spatial = items ? segmentsFromBoxes(items) : null

  if (spatial && spatial.fat) {
    fields.segmentFat = spatial.fat
    filled.push('节段脂肪')
  } else {
    const segFat = parseSegments(text, '节段脂肪', '节段肌肉')
    if (Object.keys(segFat).length) {
      fields.segmentFat = segFat
      filled.push('节段脂肪')
    }
  }

  if (spatial && spatial.muscle) {
    fields.segmentMuscle = spatial.muscle
    filled.push('节段肌肉')
  } else {
    const segMuscle = parseSegments(text, '节段肌肉', '身体得分')
    if (Object.keys(segMuscle).length) {
      fields.segmentMuscle = segMuscle
      filled.push('节段肌肉')
    }
  }

  if (warnings.length >= 0 && (!fields.segmentFat || !fields.segmentMuscle)) {
    warnings.push('节段数据不完整，可以手动补上或换一张更清晰的报告图')
  }

  // ---------- 设备名 ----------
  const dev = text.match(/(?:数据来源|设备)[:：]?\s*([^\n]{2,30})/)
  if (dev) fields.deviceName = dev[1].trim()

  // ---------- 补算 ----------
  if (!fields.bmi && fields.weight && fields.height) {
    const m = fields.height / 100
    fields.bmi = round(fields.weight / (m * m), 1)
    filled.push('BMI(按身高体重计算)')
  }
  if (!fields.fatFreeMass && fields.weight && fields.fatMass) {
    fields.fatFreeMass = round(fields.weight - fields.fatMass, 1)
    filled.push('去脂体重(计算)')
  }

  // ---------- 校验提示 ----------
  if (!fields.weight) warnings.push('没识别到「体重」，请检查文字是否完整')
  if (!fields.bodyFat) warnings.push('没识别到「体脂率」')
  if (!fields.height) warnings.push('没识别到「身高」，身体评分会受影响')
  if (fields.weight && (fields.weight < 20 || fields.weight > 300)) {
    warnings.push('体重 ' + fields.weight + 'kg 看起来不合理，请核对')
  }
  if (fields.bodyFat && (fields.bodyFat < 2 || fields.bodyFat > 70)) {
    warnings.push('体脂率 ' + fields.bodyFat + '% 看起来不合理，请核对')
  }

  return { fields, meta, warnings, filled }
}

module.exports = { parse, normalize, parseSegments, segmentsFromBoxes, parseDate, parseScore }
