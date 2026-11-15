// 用真实 OCR 结果（含坐标）验证解析：节段数据必须按坐标配对正确
const fs = require('fs')
const report = require('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/body-report')

const DIR = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ocr-out'

const SEG1 = { leftArm: 1.5, rightArm: 1.5, trunk: 11.5, leftLeg: 3.3, rightLeg: 3.3 }
const MUS1 = { leftArm: 2.9, rightArm: 2.9, trunk: 25.4, leftLeg: 9.1, rightLeg: 9.1 }
const SEG2 = { leftArm: 1.0, rightArm: 1.0, trunk: 7.4, leftLeg: 2.5, rightLeg: 2.5 }
const MUS2 = { leftArm: 2.1, rightArm: 2.1, trunk: 18.5, leftLeg: 6.7, rightLeg: 6.7 }

const EXPECT = {
  report1: {
    values: {
      weight: 80.25, bodyFat: 27.6, height: 175, bmi: 26.2, heartRate: 122,
      muscle: 55.0, muscleRate: 68.6, protein: 11.4, proteinRate: 14.2,
      water: 43.0, waterRate: 53.6, boneMass: 3.1, boneRate: 3.9,
      fatMass: 22.1, skeletalMuscle: 31.2, visceral: 9.0,
      waistHipRatio: 0.9, bodyAge: 30, skeletalMuscleIndex: 7.8,
      recommendedCalories: 2356, bmr: 1625, fatFreeMass: 58.1, deviceScore: 74
    },
    gender: 'male', date: '2026-07-19', shape: '倒三角型',
    fat: SEG1, muscle: MUS1
  },
  report2: {
    values: {
      weight: 57.7, bodyFat: 26.4, height: 158, bmi: 23.1, heartRate: 126,
      muscle: 40.1, muscleRate: 69.5, protein: 8.1, proteinRate: 14.0,
      water: 31.5, waterRate: 54.6, boneMass: 2.4, boneRate: 4.2,
      fatMass: 15.2, skeletalMuscle: 22.5, visceral: 7.0,
      waistHipRatio: 0.8, bodyAge: 37, skeletalMuscleIndex: 7.1,
      recommendedCalories: 1868, bmr: 1288, fatFreeMass: 42.5, deviceScore: 84
    },
    gender: 'female', date: '2026-07-19', shape: '匀称型',
    fat: SEG2, muscle: MUS2
  }
}

let bad = 0
const check = (label, got, want) => {
  const same = typeof want === 'number'
    ? Math.abs((Number(got) || 0) - want) < 0.15
    : String(got) === String(want)
  if (!same) { console.log('  ✗ ' + label + '：期望 ' + want + '，实际 ' + got); bad++ }
}

for (const [name, exp] of Object.entries(EXPECT)) {
  const text = fs.readFileSync(DIR + '/' + name + '.txt', 'utf8')
  // 坐标来自 OCR 接口返回的 items
  let items = []
  const itemsPath = DIR + '/' + name + '.items.json'
  if (fs.existsSync(itemsPath)) items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'))

  console.log('\n=== ' + name + '（' + (items.length ? '有坐标 ' + items.length + ' 项' : '无坐标，走文本模式') + '）===')
  const r = report.parse(text, items)
  const f = r.fields
  console.log('  识别 ' + r.filled.length + ' 项')
  console.log('  ' + r.filled.join('、'))

  for (const [k, v] of Object.entries(exp.values)) check(k, f[k], v)
  check('gender', f.gender, exp.gender)
  check('date', f.date, exp.date)
  check('bodyShape', f.bodyShape, exp.shape)

  if (f.segmentFat) {
    for (const k of Object.keys(exp.fat)) check('节段脂肪.' + k, f.segmentFat[k], exp.fat[k])
    console.log('  节段脂肪 ' + JSON.stringify(f.segmentFat))
  } else { console.log('  ✗ 缺节段脂肪'); bad++ }

  if (f.segmentMuscle) {
    for (const k of Object.keys(exp.muscle)) check('节段肌肉.' + k, f.segmentMuscle[k], exp.muscle[k])
    console.log('  节段肌肉 ' + JSON.stringify(f.segmentMuscle))
  } else { console.log('  ✗ 缺节段肌肉'); bad++ }
}

console.log('\n' + (bad ? '有 ' + bad + ' 项不对' : '全部正确 ✓'))
process.exit(bad ? 1 : 0)
