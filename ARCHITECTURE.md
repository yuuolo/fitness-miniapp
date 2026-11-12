# 健身娱乐系统 · 架构说明

> 本文基于对仓库全部源码的通读（自有代码 78 个文件、约 3,600 行，其中 JS 2,400 行），说明系统分层、请求链路、数据模型、
> 核心业务规则与实现方式，并在末尾列出实测到的实现风险与技术债。
> 面向接手开发/运维的人，不需要先读代码。

---

## 1. 技术选型与定位

| 项 | 选择 | 含义 |
| --- | --- | --- |
| 客户端 | 微信小程序原生框架 | 无跨端框架，直接用 `Page()` / `WXML` / `WXSS` |
| 后端 | 微信云开发 · 单云函数 | 一个名为 `api` 的云函数，内部按 `action` 路由 |
| 数据库 | 云开发文档数据库（类 MongoDB） | 12 个集合，无自建服务器、无域名、无 ICP 备案 |
| 鉴权 | 微信 `openid`（云函数上下文注入） | 客户端无法伪造身份，无需自建登录体系 |
| 定时任务 | 云函数定时触发器 | `0 */15 * * * * *`，每 15 分钟一次 |

**关键取舍**：整个后端只有**一个云函数入口**。好处是部署简单（一次上传）、权限集中、冷启动只影响一个函数；代价是单函数承担全部流量，且默认 3 秒超时对批量写操作偏紧（见 §11.1）。

**明确不做**：在线支付/退款、闸机硬件、网页版管理后台、报表、积分商城。线下收款，收款方式仅作记录。

---

## 2. 总体架构

```
┌──────────────────────────── 微信小程序（miniprogram/） ────────────────────────────┐
│  tabBar 会员端                     非 tab 页                    员工端 pages/staff/   │
│  首页 / 约课 / 娱乐 / 我的   入场码 · 会员卡 · 我的预约    工作台 · 排课 · 名单 ·     │
│                                                              核销 · 会员 · 卡种 · 项目│
│  utils/api.js  ── 统一封装 wx.cloud.callFunction({name:'api'})                      │
│  utils/format.js ── 纯展示层的“装饰器”，把原始字段算成可渲染字段                      │
│  utils/subscribe.js ── 订阅消息授权（用户点击时触发）                                 │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
                                    │  { action, data }
                                    ▼
┌────────────────── 云函数 api（cloudfunctions/api/）─────────────────────────────────┐
│  index.js  唯一入口：Timer 分流 → action 分发 → ensureMember → 统一错误包装           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐              │
│  │ system   │ member   │ booking  │ entry    │ admin    │ cron     │              │
│  │ 初始化   │ 首页/资料 │ 约课/娱乐 │ 入场码   │ 员工操作 │ 定时任务 │              │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘              │
│  common.js  共享：时区工具 · BizError · 角色校验 · 卡可用性 · 积分/日志/缺席         │
│  notify.js  订阅消息发送（失败只记日志）  templates.js  模板 ID 与字段映射            │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
                                    ▼
┌────────────────────── 云开发数据库（12 个集合）──────────────────────────────────────┐
│ config · members · card_types · member_cards · card_logs · offline_payments          │
│ schedules · bookings · venues · venue_slots · entry_logs · points_logs              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构与职责

```
miniprogram/
  app.js                  wx.cloud.init({ env: config.envId || undefined })
  app.json                15 个页面 + 4 个 tabBar 项 + lazyCodeLoading
  config.js               envId、三个订阅消息模板 ID（需与 templates.js 一致）
  utils/api.js            call(action, data, {loading, silent}) → Promise
  utils/format.js         时间/金额格式化、卡片与预约的展示装饰器、角色/状态中文映射
  utils/subscribe.js      requestSubscribeMessage 封装，失败静默
  pages/                  会员端 7 页
  pages/staff/            员工端 8 页

cloudfunctions/api/
  index.js                入口与路由（46 行）
  common.js               共享底座（114 行）
  system.js               bootstrap、isInitialized
  member.js               home、updateProfile、myCards、myPoints
  booking.js              listSchedules、bookSchedule、cancelBooking、myBookings、
                          listVenues、venueSlots、bookVenue
  entry.js                entryCode（生成 HMAC 二维码）、verifyEntry（核销）
  fitness.js              身体数据、力量成绩、运动数据、排行榜、隐私开关
  admin.js                19 个员工/管理员操作（344 行，最重）
  cron.js                 定时任务三件事
  notify.js               subscribeMessage.send 封装
  templates.js            模板配置
  config.json             云函数权限 + 定时触发器
  package.json            依赖：wx-server-sdk ~3.0.1、qrcode ^1.5.4
  node_modules/           ⚠ 已随仓库提交（2,376 个文件、18.9 MB），见 §11.0

test/
  mock-cloud.js           内存版 wx-server-sdk（拦截 Module._load）
  run.js                  22 组端到端业务场景，约 330 行
```

---

## 4. 请求链路

### 4.1 一次典型调用

```
页面 onShow()
  → api.call('home', {}, { silent: true })
    → wx.cloud.callFunction({ name: 'api', data: { action: 'home', data: {} } })
      → index.js: cloud.getWXContext() 取 OPENID
        → ensureMember(OPENID)                     // 首次访问自动建档
        → handlers['home']({ openid, me, data })
          → 返回 { code: 0, data: {...} }
    → api.js 判断 code === 0，resolve(data)；否则 reject(new Error(msg)) 并 toast
  → this.setData({ ... fmt.decorateCard / decorateBooking })
```

### 4.2 统一返回约定

| `code` | 含义 | 产生位置 |
| --- | --- | --- |
| `0` | 成功，`data` 为业务结果（`undefined` 归一为 `null`） | 正常返回 |
| `400` | 业务校验失败，`msg` 直接展示给用户 | `BizError`（`fail()` 抛出） |
| `404` | 未知 `action` | 路由未命中 |
| `500` | 未预期异常，`msg` 固定为「服务器开小差了」 | `catch` 兜底，原始错误打 `console.error` |

业务代码里**只抛 `fail('中文原因')`**，不写返回码；错误转译集中在入口一处，所以每个 handler 都能保持“成功即返回数据”的直线写法。

---

## 5. 权限模型

四级角色，数值比较（`common.js`）：

```js
const ROLE_LEVEL = { member: 0, coach: 1, staff: 2, admin: 3 }
function need(me, role) {           // need(me, 'staff') 表示 ≥ 前台
  if (!me) fail('请先登录')
  if ((ROLE_LEVEL[me.role] || 0) < ROLE_LEVEL[role]) fail('没有权限')
}
```

角色只存在 `members.role` 字段，由管理员通过 `setRole` 修改（且禁止改自己，防止把自己锁死）。

### action 路由表

| 模块 | action | 最低角色 | 说明 |
| --- | --- | --- | --- |
| system | `systemStatus` / `isInitialized` | — | 状态查询 |
| system | `bootstrap` | **无校验** | 首个调用者成为管理员（见 §6.1） |
| member | `home` | — | 首页聚合：资料 + 可用卡 + 今日预约 |
| member | `updateProfile` | member | 昵称 1–20 字，手机号 `^1\d{10}$` |
| member | `myCards` / `myPoints` | member | 我的卡 / 积分流水（近 30 条） |
| booking | `listSchedules` | — | 按日期列课，附带我的预约状态 |
| booking | `bookSchedule` | member | 团课/私教预约（事务） |
| booking | `cancelBooking` | member | 团课 2 小时内禁退；娱乐开始后禁退 |
| booking | `myBookings` | member | 全部预约（近 50 条） |
| booking | `listVenues` / `venueSlots` | — | 娱乐项目与时段余量 |
| booking | `bookVenue` | member | 按小时占位（事务） |
| entry | `entryCode` | member | 生成 60 秒动态二维码 |
| entry | `verifyEntry` | **staff** | 扫码核销，扣次加分 |
| admin | `dashboard` | coach | 今日概况（教练只看自己的课） |
| admin | `searchMembers` / `memberDetail` | staff | 手机号或昵称正则搜索 |
| admin | `openCard` / `adjustCard` / `setCardStatus` | staff | 办卡、调次/调期、停卡/恢复/作废 |
| admin | `setRole` | **admin** | 改角色 |
| admin | `listCardTypes` | staff | 卡种列表 |
| admin | `saveCardType` | **admin** | 新建/编辑卡种 |
| admin | `listCoaches` | staff | 可选教练列表（教练/前台/管理员） |
| admin | `staffSchedules` | coach | 排课列表（教练只见自己的） |
| admin | `saveSchedule` / `cancelSchedule` | staff | 排课、取消整节课 |
| admin | `roster` / `markAttendance` | coach | 上课名单、签到/缺席 |
| admin | `venueBookings` / `useVenueBooking` | staff | 娱乐预约列表、当天核销 |
| admin | `listAllVenues` | staff | 含下架项目 |
| admin | `saveVenue` | **admin** | 新建/编辑娱乐项目 |

> 注意 `bootstrap` 是唯一没有 `need()` 的动作，安全性依赖「先到先得 + 只能成功一次」：`config` 集合用固定 `_id: 'system'` 作为“已初始化”哨兵，重复 `add` 同 `_id` 会失败，因此并发初始化只有一个能成功。

---

## 6. 核心业务流程

### 6.1 初始化（bootstrap）

```
第一个人点「初始化系统」
  → 并发创建 12 个集合（已存在则忽略）
  → add config/{_id:'system'}      ← 唯一性哨兵，失败即“已初始化过”
  → add config/{_id:'secret'}      ← 32 字节随机数，入场码 HMAC 密钥
  → 把调用者 role 改成 admin
  → 并发写入 4 个卡种 + 4 个娱乐项目 + 未来 3 天 × 3 节课 = 9 节示例团课
```

第一个点击的人成为管理员；员工随后需**自己先打开一次小程序**（触发 `ensureMember` 建档），再由管理员在「会员与办卡」里搜索并改角色。

### 6.2 会员卡模型

三种卡，一套 `member_cards` 结构：

| kind | 中文 | 入场 | 上课 | 计费维度 |
| --- | --- | --- | --- | --- |
| `period` | 期限卡 | ✅ | ✅ 团课 | `expireAt`，不限次（`remainTimes` 恒为 0） |
| `times` | 次卡 | ✅ 每天首次扣 1 次 | ✅ 团课 | `remainTimes` |
| `lesson` | 私教课包 | ❌ **不能入场** | ✅ 私教，上课扣次 | `remainTimes` |

状态机：`active ⇄ paused → void`（`void` 终态）。

- **可用性**（`cardUsable`）：`status === 'active'` 且未过 `expireAt` 且（期限卡 或 `remainTimes > 0`）。
- **入场挑卡**（`pickEntryCard`）：排除 `lesson`，优先期限卡，其次次卡。
- **停卡不计时**：停卡只记 `pausedAt`；恢复时把 `expireAt += (now - pausedAt)`，即停卡时长整体顺延，同时清空 `expireRemindedAt` 以便重新提醒。
- **作废**：`void` 不可恢复，退款线下处理。
- 所有次数/有效期变动都写 `card_logs`（`change`、`reason`、`operator`），可审计。

### 6.3 办卡与线下收款

`openCard` 一次写三处：`member_cards`（卡）+ `card_logs`（开卡流水）+ `offline_payments`（收款）。
收款记录保存**卡面价 `listPrice` 与实际实收 `amount`**（单位：分），便于对账和统计折扣；`payMethod` 枚举 `cash / wechat_qr / alipay_qr / pos / free`。

### 6.4 入场码（防伪 + 防截图转发）

```
code = "FE1.{openid}.{ts}.{hmac_sha256(secret, openid + '.' + ts).slice(0,20)}"
```

- 密钥 `config/secret` 在模块级 `secretCache` 缓存（热实例复用）。
- 小程序端每 30 秒刷新一次；服务端 TTL 60 秒，并额外容忍 `ts` 最多领先 30 秒的时钟偏差。
- 核验用 `crypto.timingSafeEqual`（先比长度，避免抛出）。
- 因为签名绑定了 `openid` 和毫秒级时间戳，**截图转发基本无效**。

核验时的扣次逻辑：

```
取会员 → 重新挑一张可用卡（不看生成二维码时的卡）
  无卡 → 写 entry_logs(result:'denied') → 报错（但码本身仍算有效）
  今天已 result:'ok' 入场过 → 不重复扣次，提示「今日已入场」
  否则：次卡 → 条件更新 where remainTimes > 0 扣 1；加 10 积分
  写 entry_logs(result:'ok')
```

“每天只扣一次”不是靠状态机，而是**查当天 `entry_logs` 是否已有成功记录**，因此幂等且可重放核验（同一码连扫两次安全）。

### 6.5 约团课 / 私教（booking.js）

```
checkCanBook：需 member 角色 + 已填手机号 + 未被缺席封禁
选卡：
  私教 → 遍历可用 lesson 卡，找「已占用的 booked 预约数 < 课包次数」的第一张
  团课 → 任一张非 lesson 且当前可用（按开课时刻判定）的卡
去重：bookingId = "c_{scheduleId}_{openid}"   ← 天然唯一，重复预约直接命中
事务：重读 schedule → 校验 active / 未开始 / 未超额
      → schedules.booked += 1
      → set bookings/{id}
事务外：发「预约成功」订阅消息（失败只记日志）
```

**私教课包不在预约时扣次，而在教练签到成功时扣**（`markAttendance`），避免“约了不来也扣课”。预约时只用「已占用预约数」做软性额度控制。

### 6.6 娱乐项目（按小时占位）

```
venues:   name, openHour, closeHour, capacity(每时段名额), price(分), onSale
venue_slots:  _id = "{venueId}_{date}_{hour}",  count = 已占人数
bookings:     _id = "v_{venueId}_{date}_{hour}_{openid}"
```

时段不是预生成的，而是**首次预约时懒创建** `venue_slots` 文档；之后所有预约在同一文档上 `count += 1`。容量并发可由 `venue.capacity` 与事务内重读的 `count` 比较保证。台球桌/KTV 的 `capacity = 1`，即同一小时只能一个人约。

取消时 `cancelBooking` 反向 `count -= 1`。开始时间之后不能取消；核销必须当天，且由前台在「娱乐预约核销」里点掉（先把钱收了再核销）。

### 6.7 签到 / 缺席 / 惩罚

```
markAttendance(status='attended')
  需 ≥ coach 且是这节课的教练（前台/管理员不限）
  开始前 30 分钟才允许签到
  私教 → 条件扣课包 1 节（where remainTimes > 0）+ card_logs
  写 booking.status='attended'，加 5 积分

markAttendance(status='absent')
  开课后才允许
  写 booking.status='absent'，recordNoShow()

recordNoShow: noShow += 1；累计满 3 次 → noShow 清零 + blockUntil = now + 7 天
```

被封禁期间 `checkCanBook` 拒绝一切新预约，首页/「我的」显示解禁日期。被判缺席不影响已持有的卡。

### 6.8 定时任务（每 15 分钟，`cron.js`）

| 任务 | 触发条件 | 幂等手段 |
| --- | --- | --- |
| `markNoShows` | 团课 `endAt < now - 30min` 且仍 `booked` | 条件更新 `where status:'booked'`，`updated === 1` 才算成功 |
| `remindClasses` | 开课前 2 小时内且 `remindedAt === 0` | **先占位**写 `remindedAt`，再发消息（防重复推送） |
| `remindExpiringCards` | 3 天内到期且 `expireRemindedAt === 0` | 同上；**只在 9:00–21:00（北京时间）发送** |

每个任务单次最多处理 100 条（`BATCH`）。触发方式靠云函数 `config.json` 的 timer 触发器；入口用 `!OPENID && event.Type === 'Timer'` 区分，**小程序端伪造 `{Type:'Timer'}` 会被 `action` 路由拒绝（404）**，测试里专门验证了这一点。

### 6.9 时区处理

云函数运行在 UTC，所有业务日期按北京时间：

```js
const TZ_OFFSET = 8 * 3600e3
cnDate(ms)   // 'YYYY-MM-DD'
cnDateTime(ms)
cnHour(ms)   // 0–23，用于夜间免打扰
dayStart('2026-11-03')  // Date.parse('2026-11-03T00:00:00+08:00')
```

硬编码 `+08:00` 对中国大陆足够（无夏令时）；若要做其他时区需改这一处并重新审所有 `dayStart` 调用。

---

## 7. 数据模型

### 7.1 集合与关键字段

**`config`**（2 个固定文档）
| _id | 字段 |
| --- | --- |
| `system` | `initializedAt`, `by` |
| `secret` | `value`（32 字节 hex，HMAC 密钥） |

**`members`**（`_id` = openid）
`nickName`, `phone`, `role`(`member|coach|staff|admin`), `points`, `noShow`, `blockUntil`, `createdAt`

**`card_types`**
`name`, `kind`(`period|times|lesson`), `times`, `days`, `price`(分), `desc`, `onSale`, `createdAt`

**`member_cards`**
`openid`, `typeId`, `name`, `kind`, `remainTimes`, `totalTimes`, `startAt`, `expireAt`, `status`(`active|paused|void`), `pausedAt`, `expireRemindedAt`, `operator`, `createdAt`

**`card_logs`**
`cardId`, `openid`, `change`(±次数), `reason`, `operator`, `createdAt`

**`offline_payments`**
`openid`, `memberName`, `cardId`, `typeName`, `listPrice`, `amount`, `payMethod`, `payMethodName`, `remark`, `operator`, `operatorName`, `date`, `createdAt`

**`schedules`**
`courseName`, `kind`(`group|private`), `coachId`, `coachName`, `startAt`, `duration`(分钟), `capacity`, `booked`, `room`, `status`(`active|cancelled`), `createdAt`
> `private` 的 `capacity` 强制为 1。

**`bookings`** — 两种 `type` 共用集合，靠 `type` 区分
| type | _id 规则 | 特有字段 |
| --- | --- | --- |
| `class` | `c_{scheduleId}_{openid}` | `scheduleId`, `kind`, `title`, `coachId`, `coachName`, `room`, `cardId`, `cardName`, `remindedAt` |
| `venue` | `v_{venueId}_{date}_{hour}_{openid}` | `venueId`, `title`, `slotId`, `date`, `hour`, `price` |

公共字段：`openid`, `memberName`, `memberPhone`, `startAt`, `endAt`, `status`, `createdAt`；状态取值
`booked / attended / absent / cancelled`（课程）与 `booked / used / cancelled`（娱乐）。

**`venues`**
`name`, `desc`, `openHour`, `closeHour`, `capacity`, `price`(分), `onSale`, `createdAt`

**`venue_slots`**
`_id` = `{venueId}_{date}_{hour}`, `venueId`, `date`, `hour`, `count`

**`entry_logs`**
`openid`, `date`, `result`(`ok|denied`), `cardId`, `cardName`, `operator`, `reason`(拒绝时), `createdAt`

**`points_logs`**
`openid`, `change`, `source`(如 `到店打卡` / `上课签到：XX`), `createdAt`

### 7.2 实体关系

```
members (openid)
  ├─1:N─ member_cards ── N:1 ── card_types
  │         └─1:N─ card_logs
  ├─1:N─ bookings
  │         ├─ N:1 ─ schedules ── N:1 ─ members (coach)
  │         └─ N:1 ─ venues ──1:N─ venue_slots   (bookings.slotId → venue_slots._id)
  ├─1:N─ entry_logs
  ├─1:N─ points_logs
  └─1:N─ offline_payments
```

### 7.3 身体与运动数据（fitness.js）

| 集合 | 关键字段 |
| --- | --- |
| `body_records` | `openid`, `date`, `measuredAt`, `weight`, `height`, `bmi`, `bodyFat`, `heartRate`, `muscle`, `muscleRate`, `protein`, `proteinRate`, `water`, `waterRate`, `boneMass`, `boneRate`, `fatMass`, `skeletalMuscle`, `visceral`, `waistHipRatio`, `bodyAge`, `skeletalMuscleIndex`, `recommendedCalories`, `bmr`, `fatFreeMass`, `bodyShape`, `bodyType`, `segmentFat{}`, `segmentMuscle{}`, `deviceScore`, `deviceName`, `reportImage`, `score`, `detail`, `source`, `operator`, `createdAt` |
| `strength_records` | `openid`, `lift`(`bench`/`squat`/`deadlift`/`ohp`/`pullup`), `weight`, `reps`, `oneRM`, `date`, `operator`, `createdAt` |
| `activity_records` | `_id = ar_{openid}_{date}_{source}`、`type`、`steps`、`duration`、`calories`、`avgHr`、`source` |

`members` 上额外冗余：`gender`、`height`、`latestBody`、`bestLift`、`sbdTotal`、`isBodyPublic`。
冗余是为了排行榜不必逐条 join 历史表。

**1RM**：Epley 公式 `重量 × (1 + 次数/30)`；记 1 次时即实测值。

**身体评分**（0–100，缺项按已有项归一化到百分制）：
- 体脂率 40 分：男 15–20%、女 22–27% 满分，每偏离 1% 扣 8%
- 相对力量 40 分：`(卧推+深蹲+硬拉 1RM) ÷ 体重`，男 3.0 倍 / 女 2.2 倍满分
- 体重指数 20 分：BMI 18.5–24 满分

**排行榜**：`leaderboard({ lift, metric })`，`absolute` 比 1RM，`relative` 比 `1RM ÷ 体重`。
隐私按「自愿公开」：`isBodyPublic` 默认 false；未公开者响应里不下发 `weight`/`bodyFat`/`bmi`，
且**不进相对体重榜**——否则可由「1RM ÷ 相对值」反推出体重。

| action | 权限 | 说明 |
| --- | --- | --- |
| `saveBodyRecord` | staff | 录入身体数据，自动算 BMI 与评分 |
| `saveStrength` | staff | 录入成绩，换算 1RM，刷新最佳与评分 |
| `saveActivity` | staff | 录入运动数据（同日同来源覆盖） |
| `myFitness` | member | 本人完整档案 |
| `memberFitness` | staff | 任意会员档案（未公开者隐去身体指标） |
| `leaderboard` | member | 双榜 + 我的排名 |
| `setBodyPublic` | member | 自愿公开开关 |
| `bodyTrend` | member/staff | 按时间段返回身体数据变化（`days` 7–365，含 `delta`） |

**体测设备报告**：`saveBodyRecord` 除体重外全部选填，可录入米家 S800 这类体测报告的完整指标
（身体成分 11 项、代谢与评估 7 项、体态 3 项、节段脂肪/肌肉各 5 段），并支持上传报告照片
（`reportImage`，仅收 `cloud://` fileID）。
系统评分（`score`）与设备自评分（`deviceScore`）**两套并存**，公式不同，界面上分别标注。

**历史与趋势**：每次录入都是一条 `body_records`，天然形成历史版本；`members.latestBody` 冗余最新一份供
首页/排行榜直接读取。`bodyTrend({ openid, days })` 取区间内全部记录，返回时间序列与该区间首尾的
`delta`（体重、体脂、肌肉量、内脏脂肪、BMI、评分）。会员端可按 7/30/90/365 天切换。

页面：`pages/fitness/fitness`（我的身体数据）、`pages/rank/rank`（排行榜）、
`pages/staff/fitness/fitness`（员工代录）。

### 7.4 健身友圈（moment.js）

| 集合 | 关键字段 |
| --- | --- |
| `moments` | `openid`, `authorName`, `content`, `media[]`, `type`(`video`/`image`/`text`), `coachId`, `coachName`, `likedBy[]`, `status`(`normal`/`deleted`), `date`, `createdAt` |

`media` 项为 `{ fileID, type, duration, thumb }`，`fileID` 必须是云存储的 `cloud://` 地址，
普通 URL 会被过滤掉；视频和图片都由小程序先 `wx.cloud.uploadFile` 上传，云函数只收 fileID。

| action | 权限 | 说明 |
| --- | --- | --- |
| `postMoment` | member | 发自己的；教练/前台可带 `openid` 帮会员代拍，记 `coachName` |
| `momentList` | member | 按 `createdAt` 倒序分页，`before` 游标，每页 20 |
| `momentDetail` | member | 单条详情 |
| `deleteMoment` | 作者或 staff | 软删除（`status='deleted'`） |
| `likeMoment` | member | 点赞开关，读改写 `likedBy` 数组 |

页面：`pages/moments/moments`（列表，tabBar）、`pages/moments/post/post`（发布，含代拍选择）、
`pages/moments/detail/detail`（详情 + 分享）。

**分享限制**：小程序没有任何 API 能直接发朋友圈。详情页实现 `onShareTimeline`，
用户只能通过右上角菜单「分享到朋友圈」；朋友圈打开为单页模式，不能跳转 tabBar 或其他页面。
`onShareAppMessage` + `open-type="share"` 按钮用于转发给好友。

> 注：`<video>` 不能直接使用云文件 ID，列表与详情都用 `wx.cloud.getTempFileURL` 换临时链接；
> `<image>` 可以直接用 `cloud://`。

---

## 8. 并发与一致性

| 场景 | 手段 |
| --- | --- |
| 课程名额超卖 | `runTransaction` 内重读 `schedules` 后 `booked += 1` |
| 同一人重复约同一节课 | 预约 `_id` 由 `scheduleId + openid` 决定，`set` 幂等 |
| 娱乐时段超卖 | 事务内重读 `venue_slots.count` 与 `venue.capacity` 比较 |
| 次卡扣成负数 | 条件更新 `where({ _id, remainTimes: _.gt(0) })`，校验 `stats.updated === 1` |
| 调次扣成负数 | `where({ _id, remainTimes: _.gte(-delta) })` |
| 定时任务重复推送 | 先条件占用 `remindedAt` / `expireRemindedAt`，`updated === 1` 才发 |
| 重复入场扣次 | 查当天 `entry_logs` 是否已有 `ok` |
| 重复初始化 | `config/{_id:'system'}` 主键唯一 |
| 并发自动建档 | `add` 失败则回读已有文档 |

> 云开发事务内只能用 `transaction.collection(c).doc(id)` 按 `_id` 定位文档读写，不支持 `where` 条件查询或批量更新 —— 所以代码一律「先 `txGet` 校验、再 `update`」。本项目的用法（读计数 → 比较 → 自增）是安全的。

---

## 9. 前端设计

### 9.1 页面清单

| 路径 | 角色 | 作用 |
| --- | --- | --- |
| `pages/index/index` | 会员 | 首页：会员卡摘要、今日预约、入场码入口 |
| `pages/schedule/schedule` | 会员 | 7 天日期条 + 团课/私教列表，预约/取消 |
| `pages/venues/venues` | 会员 | 项目切换 + 日期 + 小时格，占位/取消 |
| `pages/mine/mine` | 会员/员工 | 资料编辑、积分流水、初始化入口、员工工作台入口 |
| `pages/entry/entry` | 会员 | 全屏动态码，30 秒自动刷新 + 倒计时 |
| `pages/cards/cards` | 会员 | 我的卡 + 在售卡种 + 到期提醒授权按钮 |
| `pages/bookings/bookings` | 会员 | 全部预约与可取消判定 |
| `pages/staff/index/index` | 员工 | 今日概况 + 扫码核验 + 功能入口 |
| `pages/staff/schedule/schedule` | 员工/教练 | 排课表单（仅前台）+ 课程列表 + 进名单 |
| `pages/staff/roster/roster` | 员工/教练 | 上课名单：签到 / 缺席 / 拨号 |
| `pages/staff/venue-bookings/venue-bookings` | 员工 | 娱乐预约核销 |
| `pages/staff/members/members` | 员工 | 会员搜索 |
| `pages/staff/member/member` | 员工 | 会员详情：办卡、卡操作、改角色 |
| `pages/staff/card-types/card-types` | 员工/管理员 | 卡种管理 |
| `pages/staff/venues/venues` | 员工/管理员 | 娱乐项目管理 |

### 9.2 三个前端约定

1. **展示装饰器**：后端只返回原始字段（时间戳、分、英文枚举），`format.js` 的 `decorateCard` / `decorateBooking` 在页面里一次性算好 `statusName`、`timeText`、`priceText`、`summary`，WXML 里不做逻辑。前后端职责边界很干净。
2. **权限传参**：员工页用 query (`?staff=1`、`?admin=1`) 控制按钮显隐——**仅控制显示，真正的拦截永远在云函数**（`need()`）。所以即使手改 URL 也拿不到越权数据。
3. **交互一致**：所有写操作都走 `wx.showModal` 二次确认（取消/作废用红色 `confirmColor`），成功后 toast + 重新 `load()`；列表页 `onShow` 重新拉取，因此从子页返回即刷新。

---

## 10. 测试架构

`test/` 完全不依赖微信环境，`node test/run.js` 即可跑：

- **`mock-cloud.js`**：用 `Module._load` 劫持 `require('wx-server-sdk')` 和 `require('qrcode')`，提供一个内存版数据库（`Map` 套 `Map`）。实现了用到的子集：`where/orderBy/limit/count/update/add/doc/set/runTransaction`、`command`（`gt/gte/lt/lte/neq/in/inc/and`）、`RegExp`、`createCollection`。事务用**全库快照 + 失败回滚**模拟。订阅消息失败用 `unsubscribed` 集合模拟微信的 `43101`（用户拒收）。
- **`run.js`**：`Date.now = () => clock` 假时钟，手工推进时间；`as(openid, action, data)` 模拟不同用户调用；22 组场景覆盖初始化、权限、名额、扣次、入场码防伪与过期、缺席封禁、停卡顺延、定时任务幂等。
- 断言粒度很细：会检查 `schedules.booked` 计数、`remainTimes`、积分、消息模板 ID 与字段截断（≤20 字）。

这是本项目质量的关键支撑——**业务规则都写在云函数里且没有微信依赖，所以能被完整脱机测试**。

---

## 11. 通读发现的风险与技术债

按「仓库卫生 → 上线前必须处理 → 建议处理 → 可接受取舍」组织。以下均为代码事实，非猜测。

### 11.0 仓库卫生（作为新项目接手，建议先处理）

**`cloudfunctions/api/node_modules/` 被提交进了 Git**：2,376 个文件、18.9 MB，占仓库体积的 80%（仓库总计 2,454 个文件 / 23.5 MB）。同时仓库**没有 `.gitignore`**，`project.private.config.json`（本机开发者工具私有配置，通常不入库）也在版本控制里。

影响：
- 克隆/拉取慢，`git log`/`diff` 噪音大，代码评审基本无法进行；
- 依赖版本被“钉”在提交时的快照，`package.json` 与磁盘实际内容可能不一致；
- 云开发部署是「上传并部署：云端安装依赖」，本来就**不需要**本地的 `node_modules`，所以提交它纯属负担。

建议：

```bash
# 在仓库根新建 .gitignore
printf 'node_modules/\nproject.private.config.json\n.DS_Store\n' > .gitignore

# 从版本控制中移除（保留磁盘文件），然后提交
git rm -r --cached cloudfunctions/api/node_modules
git rm --cached project.private.config.json
git add .gitignore && git commit -m "chore: stop tracking node_modules and private config"
```

> 注意：只是「后续不再跟踪」。历史提交里仍有 18.9 MB，如需彻底瘦身要用 `git filter-repo` 重写历史（会改变所有 commit hash）。作为新项目起步，若还没推送到自己的远端，直接删库重新初始化是最省事的做法。

### 11.1 上线前必须处理（第 1、3、4 项已修复，见 §11.5；第 2 项索引仍需在控制台建）

1. **`bootstrap` 可能半初始化**。`config/{_id:'system'}` 写入后，示例卡种/项目/课程是 `Promise.all` 并发写；若中途超时或失败，系统已被标记“已初始化”，但示例数据不全，且**无法重试**（再次 bootstrap 会被哨兵拒绝）。同时默认 3 秒超时对 17 次并发写偏紧。→ 部署时务必把超时改 20 秒；建议把哨兵写入放到示例数据全部成功之后，或提供管理员可重入的补数据入口。
2. **没有数据库索引**。代码里大量按 `openid` / `scheduleId` / `date` / `status` / `expireRemindedAt` 查询，云开发默认只有 `_id` 索引。数据量上千后，`cron` 与首页会明显变慢并可能超时。建议在控制台建复合索引（见 §11.3）。
3. **`cron` 单批上限无翻页**。三个任务都只 `limit(BATCH=100)` 一次。若某天积压超过 100 条（例如长时间停机后），剩余的要等后续每 15 分钟一轮慢慢消化，缺席判定会滞后。→ 建议改成 `while` 循环直到取不满一批。
4. **私教课包预约时可能超卖**。选卡时用的“已占用预约数 < 课包次数”是**事务外**的普通查询（TOCTOU），并发下同一课包可被超额预约占位；只是到签到扣次时会被条件更新拦下，表现为“约上了但上不了课”。→ 建议改为事务内校验，或在签到失败时给出明确提示。

### 11.2 建议处理（第 5、6、9 项已修复，见 §11.5）

5. **`cancelSchedule` 非事务**：先 `schedules.booked = 0`，再批量取消 `bookings`。若第二步失败，计数与预约状态不一致（后续 `booked` 可能被减成负数或被漏减）。
6. **`markAttendance` 私教消课非事务**：扣课包、写 `card_logs`、改 `booking.status` 是三次独立写，中间失败会“扣了次但预约仍为 booked”。
7. **`searchMembers` 用正则且无锚定**：`phone` 走 `db.RegExp` 全表扫描，`nickName` 同理；默认 `limit 50` 且无分页。门店几百人内可接受，上千人建议改前缀匹配或建索引字段。
8. **历史数据被 limit 截断**：`home` 的卡 `limit 20`、`myCards` `limit 50`、`myBookings` `limit 50`、`memberDetail` 的卡 50/预约 20/入场 10。老会员会“看不到”更早的记录。
9. **`adjustCard` 的 `extendDays` 允许为负且无下限**，可把 `expireAt` 调到过去使卡立即过期（业务上或许有用，但没有二次确认兜底）。
10. **娱乐预约无违约成本**：可无限预约占位不付款、随意取消，且不参与 `noShow` 惩罚。台球桌 `capacity=1` 时，一个人可把所有黄金时段占满。
11. **`getSecret` 模块级缓存**：轮换密钥后必须等冷启动才生效；多云函数实例各自缓存，无法快速失效。
12. **拒绝入场的 `fail()` 在写 `entry_logs` 之后抛出**：写在事务外，属可接受，但拒绝记录与返回消息需分开理解（码有效但卡无效）。

### 11.3 建议索引（云开发控制台手动创建）

| 集合 | 复合索引 |
| --- | --- |
| `bookings` | `openid + startAt(desc)`、`scheduleId + status`、`type + status + endAt`、`type + date + status`、`cardId + status`、`openid + type + venueId + date + status` |
| `entry_logs` | `openid + date + result`、`date + result` |
| `member_cards` | `openid + status`、`status + expireRemindedAt + expireAt` |
| `schedules` | `status + startAt`、`coachId + startAt` |
| `members` | `phone`、`role`、`createdAt(desc)` |
| `points_logs` | `openid + createdAt(desc)` |
| `card_logs` | `cardId + createdAt` |
| `venues` / `card_types` | `onSale + createdAt` |
| `venue_slots` | `venueId + date` |

### 11.4 可接受的设计取舍

- 时区硬编码 `+08:00`（中国大陆无夏令时）。
- 金额全程用「分」的整数，避免浮点误差；前端只在展示时转元。
- 订阅消息为一次性授权，发送失败（用户拒收/次数用尽）只记日志，不影响业务 —— 这是微信限制下的正确做法。
- 入场码签名截断为 20 个十六进制字符（80 bit），对 60 秒窗口足够。
- 员工端靠 query 参数控制 UI 显隐，安全由服务端 `need()` 兜底。

### 11.5 本次修复记录

| # | 问题 | 修复方式 | 回归测试 |
| --- | --- | --- | --- |
| 1 | `bootstrap` 可能半初始化 | 哨兵 `config/system` 改为**最后**写；示例数据按集合判空，可重复执行 | 初始化可续做 |
| 3 | `cron` 单批 100 条不翻页 | 三个任务改为循环取批，最多 20 轮（2000 条/次），无进展即跳出 | 定时任务三项 |
| 4 | 私教课包预约超额（TOCTOU） | 预约时在 `member_cards.pending` 上占位（事务内读改写），取消 / 缺席 / 签到后释放 | 私教课包占位、取消整节私教课 |
| 5 | `cancelSchedule` 非事务 | 先置课程为已取消 → 逐条取消预约并释放课包占位 → 按真实剩余数重算 `booked` | 取消整节私教课 |
| 6 | 私教消课分三步写 | 扣课包 + 释放占位 + 改预约状态放进同一事务 | 私教课签到 |
| 9 | 缩短有效期可缩到开卡前 | 增加「有效期不能早于开卡时间」校验 | 调整有效期下限 |

测试从 22 组增加到 **25 组**，全部通过。

> 剩余待办：§11.1 第 2 项（数据库索引）只能在云开发控制台手工创建，代码层面无法完成。

---

## 12. 部署与运维要点

1. `project.config.json` 的 `appid` 换成自己的（当前是原作者的 `wx342ac49c24679ae9`）。
2. `miniprogram/config.js` 的 `envId` 填云开发环境 ID（单环境可留空）。
3. 右键 `cloudfunctions/api` → 「上传并部署：云端安装依赖」（依赖含 `qrcode`，必须云端安装）。
4. 云开发控制台 → 云函数 `api` → 版本与配置 → **超时时间改 20 秒**（默认 3 秒）。
5. 右键 `cloudfunctions/api/config.json` → 「上传触发器」，之后每 15 分钟自动跑。
6. 订阅消息（可选）：小程序后台「功能 → 订阅消息」选三个模板，把模板 ID 同时填到 `cloudfunctions/api/templates.js` 和 `miniprogram/config.js`；`fields` 的字段名（`thing1`/`time2`/`date2`）必须与模板详情一致。正式发布后把 `miniprogramState` 改成 `formal`。
7. 店长首次打开「我的」→「初始化系统」。
8. 员工先自行打开一次小程序建档，管理员再改角色。
9. 备案完成前只能发体验版；本地回归 `node test/run.js`。

**日常观察点**：云函数错误率与耗时（P95 是否逼近 20 秒）、数据库读写次数配额、定时任务是否卡在单批 100 条、`config/secret` 是否泄露。

---

## 13. 一句话总结

这是一套**以“业务规则集中在单一云函数 + 确定性文档 ID + 条件更新/事务”实现一致性的小程序后端**，前端只做展示与交互；12 个集合承载会员/卡/课程/预约/娱乐/日志六类数据，三条定时任务负责缺席判定与消息推送；自有代码 78 个文件约 3,600 行（JS 2,400 行），业务规则可由 `node test/run.js` 完全脱机验证。真正需要在生产前补齐的是**超时与初始化原子性、数据库索引、定时任务翻页**三件事；作为新项目接手，先清掉误提交的 `node_modules`（§11.0）。
