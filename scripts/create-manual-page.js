// 生成「算法说明书」页面数据（内容与服务器实现逐条对齐）
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const DIR = path.join(MP, 'pages/manual')
fs.mkdirSync(DIR, { recursive: true })

const js = `// 算法说明书：评分、排行榜、能力图的计算方式
// 内容与 deploy/server/lib/fitness.js、lift-items.js 以及首页能力图的实现保持一致
Page({
  data: {
    open: { score: true },
    sections: [
      {
        id: 'score',
        title: '身体评分（0–100 分）',
        paras: [
          '总分由三部分组成：体脂率 40 分 + 相对力量 40 分 + 体重指数 20 分。',
          '缺项不扣分：如果只录了部分数据，按「已录入项」的满分合计折算成百分制。例如只填了体脂率，该项满分 40，实得 32 分，最终评分 = 32 ÷ 40 × 100 = 80 分。',
          '性别未填写时，体脂率和相对力量都按男性标准计算。'
        ],
        items: [
          { k: '体脂率（40 分）', v: '理想区间：男 15–20%，女 22–27%。在区间内得满分；每偏离 1% 扣 5 分，偏离 8% 及以上为 0 分。' },
          { k: '相对力量（40 分）', v: '三项合计（卧推 + 深蹲 + 硬拉）÷ 体重。男性 3.0 倍体重得满分，女性 2.2 倍得满分；低于满分线按比例给分，超过按满分算。' },
          { k: '体重指数（20 分）', v: 'BMI 在 18.5–24 之间得满分；偏低每 1 扣约 3.3 分（差 6 归零），偏高每 1 扣 2 分（差 10 归零）。' }
        ],
        formulas: [
          'BMI = 体重(kg) ÷ 身高(m)²',
          '相对力量 = (卧推 1RM + 深蹲 1RM + 硬拉 1RM) ÷ 体重',
          '评分 = (已得分数之和 ÷ 已录项满分之和) × 100，四舍五入取整'
        ],
        notes: [
          '身体数据或力量成绩更新后，评分会自动重算，不需要手动刷新。',
          '同一时期以「最新一次体测」的数据计算评分。'
        ]
      },
      {
        id: 'lift',
        title: '力量成绩与排行榜项目',
        paras: [
          '每次录入「重量 × 次数」，系统按该项目的计算方式换算成一个成绩，排行榜直接按这个成绩排名。',
          '如果这次成绩优于你之前的最好成绩，会更新成你的「个人最好成绩」；三项合计（SBD）只累加卧推、深蹲、硬拉三项。'
        ],
        items: [
          { k: '估算 1RM（默认用于卧推/深蹲/硬拉/肩推）', v: '用 Epley 公式由「重量 × 次数」估算单次最大重量。次数为 1 时直接取重量。' },
          { k: '最大重量', v: '直接取单组最大重量，不看次数。' },
          { k: '单组次数（默认用于引体向上）', v: '直接取单组次数，适合自重动作。' },
          { k: '单组容量', v: '重量 × 次数，适合比总做功量。' }
        ],
        formulas: [
          '估算 1RM（Epley）= 重量 × (1 + 次数 ÷ 30)，次数 ≤ 1 时 = 重量',
          '举例：80kg × 5 次 → 80 × (1 + 5/30) ≈ 93.3kg',
          '举例：100kg × 10 次 → 100 × (1 + 10/30) ≈ 133.3kg',
          '三项合计 SBD = 卧推 1RM + 深蹲 1RM + 硬拉 1RM'
        ],
        notes: [
          '录入范围：重量 0–500kg，次数 1–200 次。',
          '排行榜项目可以在管理端增删改，每个项目独立选择计算方式与单位。',
          '默认有 5 个项目：卧推、深蹲、硬拉、站姿肩推、引体向上。'
        ]
      },
      {
        id: 'rank',
        title: '排行榜规则',
        paras: [
          '每个项目单独一张榜。同一个项目里，每个会员在所选周期内只取最好的一条成绩参与排名。',
          '周期都按北京时间切分：本周从周一 00:00 开始，本月从 1 号 00:00 开始。'
        ],
        items: [
          { k: '总榜', v: '不限时间，取历史最好成绩。' },
          { k: '本周', v: '只看本周一 00:00 之后录入的成绩。' },
          { k: '本月', v: '只看本月 1 号 00:00 之后录入的成绩。' },
          { k: '绝对成绩', v: '直接比成绩数值，大的排前面。' },
          { k: '相对体重', v: '成绩 ÷ 体重（保留两位小数），比的是「每公斤体重能推多重」，小体重更容易排前面。' }
        ],
        notes: [
          '相对体重榜只收录打开了「参与相对体重排行」开关的会员；没打开的人不会出现在这张榜里。',
          '成绩相同时按先后顺序排列，名次不并列。',
          '榜单显示前 20 名；如果你不在前 20，页面底部会单独显示你自己的名次。'
        ]
      },
      {
        id: 'radar',
        title: '首页六边形能力图',
        paras: [
          '首页「排行榜」入口里的六边形，是把你的数据和一组参考线比较后换算成 0–100 分画出来的，用来一眼看出强项和短板。',
          '力量和体脂用的是「相对体重」的比值，所以体重不同的会员之间也能横向比较。'
        ],
        items: [
          { k: '卧推', v: '卧推 1RM ÷ 体重：0.3 倍为 0 分，1.4 倍为 100 分。' },
          { k: '深蹲', v: '深蹲 1RM ÷ 体重：0.5 倍为 0 分，1.9 倍为 100 分。' },
          { k: '硬拉', v: '硬拉 1RM ÷ 体重：0.7 倍为 0 分，2.4 倍为 100 分。' },
          { k: '体脂', v: '体脂率 35% 为 0 分，8% 为 100 分（越低越高）。' },
          { k: '肌肉', v: '肌肉率 35% 为 0 分，55% 为 100 分。' },
          { k: '综合', v: '直接取「身体评分」。' }
        ],
        notes: [
          '没有任何数据时显示「还没有数据」，录一次体测或力量成绩就会出现图形。',
          '六边形只做直观展示，不参与排行。'
        ]
      },
      {
        id: 'params',
        title: '各项参数含义',
        items: [
          { k: '体重', v: '计算 BMI、相对力量、相对体重榜、能力图的基准值，单位 kg。' },
          { k: '体脂率', v: '脂肪占体重的百分比。评分和六边形都按性别理想区间判断，不是越低越好。' },
          { k: '肌肉量', v: '身体肌肉总重量（kg），设备报告里的「肌肉量」。' },
          { k: '肌肉率', v: '肌肉占体重的百分比（%），比绝对值更能反映体型。' },
          { k: '骨骼肌量', v: '可以主动发力的那部分肌肉（kg），比肌肉量更贴近训练水平。' },
          { k: '内脏脂肪', v: '内脏周围脂肪等级，一般 1–9 为正常，越高越需要控制。' },
          { k: 'BMI', v: '体重指数 = 体重 ÷ 身高²，只反映身高体重比，不区分肌肉和脂肪。' },
          { k: '基础代谢', v: '静息状态下一天消耗的热量（kcal）。' },
          { k: '身体年龄', v: '设备根据体成分推算的代谢年龄，用于参考。' },
          { k: '去脂体重', v: '体重减去脂肪重量（kg），也叫瘦体重。' },
          { k: '腰臀比', v: '腰围 ÷ 臀围，反映脂肪分布，一般低于 0.9（男）/0.85（女）较理想。' },
          { k: '心率', v: '测量时的心率（次/分）。' },
          { k: '设备身体得分', v: '体测设备自己给的分数（0–100），和系统的「身体评分」是两套算法。' },
          { k: '1RM', v: '单次能举起的最大重量。系统用 Epley 公式由「重量 × 次数」估算。' },
          { k: 'SBD 合计', v: '卧推 + 深蹲 + 硬拉 的 1RM 之和，衡量整体力量水平。' },
          { k: '相对力量', v: 'SBD 合计 ÷ 体重，倍数越高说明同等体重下力量越大。' }
        ]
      },
      {
        id: 'source',
        title: '数据来源与录入',
        items: [
          { k: '体测数据', v: '教练用体测设备测完后录入，也可以拍照识别设备报告自动填表。' },
          { k: '力量成绩', v: '教练或管理员录入，每记录一次保留一条历史，取最好成绩上榜。' },
          { k: '运动记录', v: '按天记录做了什么运动，只做统计展示，不参与评分。' },
          { k: '谁能看到', v: '身体数据对所有会员可见；手机号只对本人、教练和管理员显示。' }
        ],
        notes: [
          '本页内容与实际算法一致；管理端调整排行榜项目或计算方式后，相关说明以管理端配置为准。'
        ]
      }
    ]
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const open = Object.assign({}, this.data.open)
    open[id] = !open[id]
    this.setData({ open })
  },

  expandAll() {
    const open = {}
    this.data.sections.forEach(s => { open[s.id] = true })
    this.setData({ open })
  },

  collapseAll() {
    this.setData({ open: {} })
  }
})
`

fs.writeFileSync(path.join(DIR, 'manual.js'), js)

fs.writeFileSync(path.join(DIR, 'manual.json'), JSON.stringify({
  navigationBarTitleText: '算法说明'
}, null, 2) + '\n')

const wxml = `<view class="page">
  <view class="card intro">
    <view class="title">系统算法说明</view>
    <view class="muted mt-sm">
      评分、力量成绩、排行榜和能力图分别是怎么算出来的。所有数字都来自系统的实际实现。
    </view>
    <view class="row mt">
      <text class="mini-btn" bindtap="expandAll">全部展开</text>
      <text class="mini-btn gray ml" bindtap="collapseAll">全部收起</text>
    </view>
  </view>

  <view wx:for="{{sections}}" wx:key="id" class="card">
    <view class="between head" data-id="{{item.id}}" bindtap="toggle">
      <text class="title">{{index + 1}}. {{item.title}}</text>
      <text class="muted">{{open[item.id] ? '收起' : '展开'}}</text>
    </view>

    <block wx:if="{{open[item.id]}}">
      <view wx:for="{{item.paras}}" wx:key="*this" class="para">{{item}}</view>

      <view wx:if="{{item.items && item.items.length}}" class="tbl">
        <view wx:for="{{item.items}}" wx:key="k" class="tr">
          <text class="td-k">{{item.k}}</text>
          <text class="td-v">{{item.v}}</text>
        </view>
      </view>

      <view wx:if="{{item.formulas && item.formulas.length}}" class="formulas">
        <view wx:for="{{item.formulas}}" wx:key="*this" class="formula">{{item}}</view>
      </view>

      <view wx:if="{{item.notes && item.notes.length}}" class="notes">
        <view wx:for="{{item.notes}}" wx:key="*this" class="note">{{item}}</view>
      </view>
    </block>
  </view>

  <view class="foot muted">内容随算法调整同步更新</view>
</view>
`
fs.writeFileSync(path.join(DIR, 'manual.wxml'), wxml)

const wxss = `.intro .title { font-size: 34rpx; }

.head {
  padding: 4rpx 0;
}

.para {
  font-size: 26rpx;
  color: var(--sub);
  margin-top: 14rpx;
  line-height: 1.6;
}

.tbl {
  margin-top: 16rpx;
  border-radius: var(--r-sm);
  overflow: hidden;
}

.tr {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--line-soft);
}

.tr:last-child {
  border-bottom: none;
}

.td-k {
  width: 200rpx;
  flex: none;
  font-size: 26rpx;
  color: var(--ink);
  font-weight: 500;
}

.td-v {
  flex: 1;
  font-size: 25rpx;
  color: var(--sub);
  line-height: 1.6;
}

.formulas {
  margin-top: 16rpx;
  padding: 16rpx;
  border-radius: var(--r-sm);
  background: var(--fill);
}

.formula {
  font-size: 24rpx;
  color: var(--ink);
  padding: 6rpx 0;
  word-break: break-all;
}

.notes {
  margin-top: 16rpx;
}

.note {
  font-size: 23rpx;
  color: var(--muted);
  line-height: 1.6;
  padding-left: 20rpx;
  position: relative;
}

.note::before {
  content: '·';
  position: absolute;
  left: 6rpx;
}

.mini-btn {
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 24rpx;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-strong);
}

.mini-btn.gray {
  background: var(--fill);
  color: var(--sub);
}

.foot {
  text-align: center;
  font-size: 22rpx;
  padding: 24rpx 0 8rpx;
}
`
fs.writeFileSync(path.join(DIR, 'manual.wxss'), wxss)

console.log('已生成 pages/manual：manual.js / manual.json / manual.wxml / manual.wxss')
