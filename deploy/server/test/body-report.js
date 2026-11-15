// 体测报告解析测试：用小米 S800 两张真实报告的文字做样本
const assert = require('assert')
const report = require('../lib/body-report')

let passed = 0
const ok = name => { passed++; console.log('  \u2713 ' + name) }

// ---------- 样本一：小赵，男，31 岁，175cm ----------
const ZHAO = `人体成分分析报告
名称: 小赵   性别: 男   年龄: 31 岁   身高: 175cm   测量时间: 2026/07/19
体重 80.25kg 偏高
BMI 26.2 偏高
体脂率 27.6% 过高
心率 122次/分 偏高
身体成分分析
肌肉量 55.0kg 标准
肌肉率 68.6% 标准
蛋白质量 11.4kg 标准
蛋白质率 14.2% 标准
体水分量 43.0kg 标准
身体水分 53.6% 标准
骨盐量 3.1kg 不足
骨盐率 3.9% 不足
脂肪量 22.1kg 过高
骨骼肌量 31.2kg 标准
内脏脂肪等级 9.0 警戒
评估指标
身体形态 倒三角型
身体类型 肥胖
推测腰臀比 0.9
身体年龄 30 岁
骨骼肌指数 7.8
建议热量摄入 2356kcal
基础代谢率 1625kcal
去脂体重 58.1kg
节段脂肪分析
偏低 正常 偏高
1.5kg 左上肢    1.5kg 右上肢
11.5kg 躯干
3.3kg 左下肢    3.3kg 右下肢
均衡 均衡 均衡
节段肌肉分析
2.9kg 左上肢    2.9kg 右上肢
25.4kg 躯干
9.1kg 左下肢    9.1kg 右下肢
均衡 均衡 轻度不均
身体得分
74 分 建议控制饮食，减少摄入高油高热量食物
数据来源: 米家八电极体脂秤 S800`

// ---------- 样本二：小菜菜，女，42 岁，158cm ----------
const CAI = `人体成分分析报告
名称: 小菜菜   性别: 女   年龄: 42 岁   身高: 158cm   测量时间: 2026/07/19
体重 57.70kg 标准
BMI 23.1 标准
体脂率 26.4% 标准
心率 126次/分 偏高
身体成分分析
肌肉量 40.1kg 标准
肌肉率 69.5% 标准
蛋白质量 8.1kg 标准
蛋白质率 14.0% 标准
体水分量 31.5kg 标准
身体水分 54.6% 标准
骨盐量 2.4kg 正常
骨盐率 4.2% 正常
脂肪量 15.2kg 标准
骨骼肌量 22.5kg 标准
内脏脂肪等级 7.0 警戒
评估指标
身体形态 匀称型
身体类型 健康型
推测腰臀比 0.8
身体年龄 37 岁
骨骼肌指数 7.1
建议热量摄入 1868kcal
基础代谢率 1288kcal
去脂体重 42.5kg
节段脂肪分析
1.0kg 左上肢    1.0kg 右上肢
7.4kg 躯干
2.5kg 左下肢    2.5kg 右下肢
节段肌肉分析
2.1kg 左上肢    2.1kg 右上肢
18.5kg 躯干
6.7kg 左下肢    6.7kg 右下肢
身体得分
84 分 身体非常健康
数据来源: 米家八电极体脂秤 S800`

function main() {
  console.log('=== 样本一：小赵（男 / 31 岁 / 175cm）===')
  const a = report.parse(ZHAO)
  const fa = a.fields
  console.log('  解析到 ' + a.filled.length + ' 项：' + a.filled.join('、'))

  assert.strictEqual(fa.weight, 80.25); ok('体重 80.25')
  assert.strictEqual(fa.height, 175); ok('身高 175')
  assert.strictEqual(fa.gender, 'male'); ok('性别 男')
  assert.strictEqual(a.meta.age, 31); ok('年龄 31')
  assert.strictEqual(fa.bodyFat, 27.6); ok('体脂率 27.6')
  assert.strictEqual(fa.heartRate, 122); ok('心率 122')
  assert.strictEqual(fa.bmi, 26.2); ok('BMI 26.2')
  assert.strictEqual(fa.date, '2026-07-19'); ok('测量日期 2026-07-19')

  assert.strictEqual(fa.muscle, 55.0); ok('肌肉量 55.0')
  assert.strictEqual(fa.muscleRate, 68.6); ok('肌肉率 68.6')
  assert.strictEqual(fa.protein, 11.4); ok('蛋白质量 11.4')
  assert.strictEqual(fa.proteinRate, 14.2); ok('蛋白质率 14.2')
  assert.strictEqual(fa.water, 43.0); ok('体水分量 43.0')
  assert.strictEqual(fa.waterRate, 53.6); ok('身体水分 53.6')
  assert.strictEqual(fa.boneMass, 3.1); ok('骨盐量 3.1')
  assert.strictEqual(fa.boneRate, 3.9); ok('骨盐率 3.9')
  assert.strictEqual(fa.fatMass, 22.1); ok('脂肪量 22.1')
  assert.strictEqual(fa.skeletalMuscle, 31.2); ok('骨骼肌量 31.2')
  assert.strictEqual(fa.visceral, 9.0); ok('内脏脂肪等级 9.0')

  assert.strictEqual(fa.waistHipRatio, 0.9); ok('腰臀比 0.9')
  assert.strictEqual(fa.bodyAge, 30); ok('身体年龄 30')
  assert.strictEqual(fa.skeletalMuscleIndex, 7.8); ok('骨骼肌指数 7.8')
  assert.strictEqual(fa.recommendedCalories, 2356); ok('建议热量 2356kcal')
  assert.strictEqual(fa.bmr, 1625); ok('基础代谢 1625kcal')
  assert.strictEqual(fa.fatFreeMass, 58.1); ok('去脂体重 58.1')

  assert.strictEqual(fa.bodyShape, '倒三角型'); ok('身体形态 倒三角型')
  assert.strictEqual(fa.bodyType, '肥胖'); ok('身体类型 肥胖')
  assert.strictEqual(fa.deviceScore, 74); ok('身体得分 74')

  assert.deepStrictEqual(fa.segmentFat, {
    leftArm: 1.5, rightArm: 1.5, trunk: 11.5, leftLeg: 3.3, rightLeg: 3.3
  }); ok('节段脂肪五项：1.5 / 1.5 / 11.5 / 3.3 / 3.3')
  assert.deepStrictEqual(fa.segmentMuscle, {
    leftArm: 2.9, rightArm: 2.9, trunk: 25.4, leftLeg: 9.1, rightLeg: 9.1
  }); ok('节段肌肉五项：2.9 / 2.9 / 25.4 / 9.1 / 9.1')

  assert.strictEqual(a.warnings.length, 0, '不应有告警：' + JSON.stringify(a.warnings))
  ok('没有告警（所有关键字段都识别到了）')

  console.log('\n=== 样本二：小菜菜（女 / 42 岁 / 158cm）===')
  const b = report.parse(CAI)
  const fb = b.fields
  assert.strictEqual(fb.weight, 57.7); ok('体重 57.70')
  assert.strictEqual(fb.height, 158); ok('身高 158')
  assert.strictEqual(fb.gender, 'female'); ok('性别 女')
  assert.strictEqual(fb.bodyFat, 26.4); ok('体脂率 26.4')
  assert.strictEqual(fb.bmi, 23.1); ok('BMI 23.1')
  assert.strictEqual(fb.muscle, 40.1); ok('肌肉量 40.1')
  assert.strictEqual(fb.skeletalMuscle, 22.5); ok('骨骼肌量 22.5')
  assert.strictEqual(fb.visceral, 7.0); ok('内脏脂肪 7.0')
  assert.strictEqual(fb.bodyShape, '匀称型'); ok('身体形态 匀称型')
  assert.strictEqual(fb.bodyType, '健康型'); ok('身体类型 健康型')
  assert.strictEqual(fb.deviceScore, 84); ok('身体得分 84')
  assert.deepStrictEqual(fb.segmentFat, {
    leftArm: 1.0, rightArm: 1.0, trunk: 7.4, leftLeg: 2.5, rightLeg: 2.5
  }); ok('节段脂肪：1.0 / 1.0 / 7.4 / 2.5 / 2.5')
  assert.deepStrictEqual(fb.segmentMuscle, {
    leftArm: 2.1, rightArm: 2.1, trunk: 18.5, leftLeg: 6.7, rightLeg: 6.7
  }); ok('节段肌肉：2.1 / 2.1 / 18.5 / 6.7 / 6.7')
  assert.strictEqual(b.warnings.length, 0); ok('没有告警')

  console.log('\n=== 边界情况 ===')
  // 全角数字与中文标点
  const full = report.parse('体重：８０．２５ｋｇ\n体脂率：２７．６％\n身高：１７５ｃｍ')
  assert.strictEqual(full.fields.weight, 80.25); ok('全角数字也能识别')
  assert.strictEqual(full.fields.height, 175); ok('全角身高')

  // 缺字段要给出提示
  const partial = report.parse('体重 70kg')
  assert.ok(partial.warnings.some(w => w.indexOf('体脂率') >= 0)); ok('缺体脂率会提示')
  assert.ok(partial.warnings.some(w => w.indexOf('身高') >= 0)); ok('缺身高会提示')

  // BMI 缺失时按身高体重反算
  const noBmi = report.parse('体重 80kg\n身高 175cm\n体脂率 20%')
  assert.strictEqual(noBmi.fields.bmi, 26.1); ok('BMI 缺失时自动计算（80/1.75² = 26.1）')

  // 去脂体重缺失时用体重-脂肪量计算
  const noFfm = report.parse('体重 80kg\n脂肪量 20kg\n身高 175cm\n体脂率 25%')
  assert.strictEqual(noFfm.fields.fatFreeMass, 60); ok('去脂体重缺失时自动计算（80-20=60）')

  // 乱码/空文本不能崩
  const empty = report.parse('')
  assert.deepStrictEqual(empty.fields, {}); ok('空文本不崩，返回空字段')
  assert.ok(empty.warnings.length >= 2); ok('空文本给出缺字段提示')

  // 中文日期
  const cnDate = report.parse('测量时间: 2026年7月19日\n体重 70kg\n身高 170cm\n体脂率 20%')
  assert.strictEqual(cnDate.fields.date, '2026-07-19'); ok('中文日期格式也能识别')

  // ---------- 空间配对（真实 OCR 坐标）----------
  // 报告上脂肪/肌肉是左右两块，每块里「数值在部位名正上方同一列」。
  // OCR 按行读会把数值和部位名拆成两行、两块还会交错，只看文字顺序必然串。
  // 下面的坐标取自小米 S800 报告的真实识别结果。
  console.log('\n=== 空间配对（有坐标时）===')
  const box = (text, x, y, w) => ({ text, x, y, w: w || 40, h: 24, score: 0.99 })

  const ITEMS = [
    // 两块面板的标题
    box('节段脂肪分析', 59, 912, 129),
    box('节段肌肉分析', 663, 910, 132),
    box('身体形态', 700, 367),
    box('倒三角型', 706, 631, 63),
    box('身体类型', 1059, 367),
    // 脂肪（左栏）：左上肢 1.5 / 右上肢 1.5 / 躯干 11.5 / 左下肢 3.3 / 右下肢 3.3
    box('1.5kg', 91, 987, 49),
    box('左上肢', 95, 1012, 41),
    box('1.5kg', 511, 987, 50),
    box('右上肢', 515, 1012, 41),
    box('11.5kg', 511, 1053, 58),
    box('躯干', 515, 1080, 26),
    box('3.3kg', 92, 1123, 49),
    box('左下肢', 94, 1148, 41),
    box('3.3kg', 511, 1121, 51),
    box('右下肢', 513, 1146, 44),
    // 肌肉（右栏）：左上肢 2.9 / 右上肢 2.9 / 躯干 25.4 / 左下肢 9.1 / 右下肢 9.1
    box('2.9kg', 697, 987, 50),
    box('左上肢', 701, 1012, 41),
    box('2.9kg', 1117, 987, 50),
    box('右上肢', 1121, 1012, 41),
    box('25.4kg', 1118, 1053, 61),
    box('躯干', 1121, 1079, 26),
    box('9.1kg', 698, 1123, 45),
    box('左下肢', 700, 1148, 41),
    box('9.1kg', 1117, 1123, 46),
    box('右下肢', 1121, 1148, 40)
  ]

  const spatial = report.parse('体重 80.25kg 体脂率 27.6% 身高 175cm', ITEMS)
  assert.deepStrictEqual(spatial.fields.segmentFat, {
    leftArm: 1.5, rightArm: 1.5, trunk: 11.5, leftLeg: 3.3, rightLeg: 3.3
  }); ok('按坐标配出节段脂肪五项（左右两列都没串）')
  assert.deepStrictEqual(spatial.fields.segmentMuscle, {
    leftArm: 2.9, rightArm: 2.9, trunk: 25.4, leftLeg: 9.1, rightLeg: 9.1
  }); ok('按坐标配出节段肌肉五项')
  assert.strictEqual(spatial.fields.bodyShape, '倒三角型'); ok('身体形态按坐标取，不会误吞「身体类型」')

  // 没有坐标时不能瞎配，应该给出提示
  const noBox = report.parse('体重 80.25kg 体脂率 27.6% 身高 175cm')
  assert.ok(!noBox.fields.segmentFat); ok('没有坐标时不硬凑节段数据')
  assert.ok(noBox.warnings.some(w => w.indexOf('节段') >= 0)); ok('节段缺失时给提示')

  // 坐标错乱（数值远离部位名）也不该乱配
  const messy = report.parse('体重 70kg', [
    box('节段脂肪分析', 10, 900),
    box('节段肌肉分析', 900, 900),
    box('左上肢', 100, 1000),
    box('右上肢', 500, 1000),
    box('躯干', 500, 1100),
    box('左下肢', 100, 1200),
    box('右下肢', 500, 1200),
    box('9.9kg', 700, 300, 50)
  ])
  assert.ok(!messy.fields.segmentFat || Object.keys(messy.fields.segmentFat).length < 3)
  ok('坐标对不上时宁可留空，不乱填')

  console.log('\n全部 ' + passed + ' 项断言通过')
}

try {
  main()
} catch (e) {
  console.error('\n解析测试失败：', e.message)
  process.exit(1)
}
