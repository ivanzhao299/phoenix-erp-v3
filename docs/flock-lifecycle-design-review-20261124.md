# 生产管理 · 鸡群生命周期重构方案（独立复核后审查稿）

2026-11-24，新加坡时间。审查基线为两次从发布仓库获取的 `origin/main`，提交 [`d7474f0a3`](https://github.com/ivanzhao299/phoenix-erp-v3/commit/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd)。下文代码链接均固定在这次提交。本文供产品、场长、兽医、财务和研发共同审查。三名只读子代理分别从现场操作、接口与记账、实施验收独立复核；主审逐项对照固定提交裁定并合并修订。第一至四节说明立项依据，第五节规定页面、业务与接口行为，第六节规定切换、验收和需签认的范围。

## 一、审查结论

**建议批准生命周期前端结构重构，保留已有事件账。** 对一舍一有效鸡群、同公司整群转舍的业务，现有鸡群、鸡舍、占栏和过账边界合理。前端把 13 种单据的制单、审核、跨群查询与附件阅读集中在一个页面，缺少按业务检索的列表和与当前对象绑定的办理界面。建议交付六个业务列表和一个跨业务待办。第一期先打通死亡/淘汰登记到审核过账，修复死淘取数、草稿隔离与旧待审单可达性。现有生产入库复核保留按指定舍日查单的能力，具备动作权限者可从原单继续办理；历史数据修整、财务收款关联、跨月补单个班次分别设定边界。

| 审查维度 | 判断 | 审查建议 |
|---|---|---|
| 作业与追溯模型 | 适合一舍一群。入栏、在栏、待售、交付、关闭、清舍和再次入栏能分别留痕 | 保留群号和占栏历史。只有现场确有部分转群、同舍多群且能够分群计数、采蛋时，另审分栏模型 |
| 开发及数据正确性 | 幂等、独立审核、原子过账已有实际保护。日报首写、历史补录、重建和移动查询出现口径分叉 | 统一损失查询，加上正常入口的回归测试。历史实盘继续按有依据的余额接续 |
| 前端分配和交互 | 现有单页未达到项目台账、单据、审批和移动作业模板的职责分工；在手机和桌面均复现点原单后详情仍在屏外 | 第一期实施按业务划分的列表、表单弹窗、详情抽屉和复杂单据页；保留现有选择器、品种确认与受控附件 |
| API 与模块职责 | 生命周期负责羽数及占栏，兽医负责养护事实，库存负责实物，边界可用；查询接口和跨动作校验不够完整 | 保留现有写接口，先补按范围检索、预检和动作回执，再在 Nest 模块内拆分职责 |
| 行业适配 | 已覆盖商品蛋鸡的核心流转和按群追溯。现有页面更擅长回答“羽数去了哪里”，对“本周表现是否偏离品系目标”的支持较弱 | 增补群周期视图和指标定义。适用法规、育种目标和企业审批流程分别确认 |

**独立复核后的主要修订**

| 复核角度 | 调整后的设计 | 审查位置 |
|---|---|---|
| 现场操作 | 分开个人待办与入库工作台的舍日复核；保留手机死淘入口。整日无报和缺一个班次分别处理 | 5.3 列表、5.4 单据办理、6.1 旧链接 |
| 接口与记账 | 为权限、创建超时、跨月授权和并发关群定义结果；待售交付以不可变结算凭据为止。历史日报纠错前先识别受影响的在途单 | 5.5 组件与接口、5.6 契约与反例 |
| 实施与验收 | 先上线兼容查询接口和死淘办理链，再按业务切换入口。分别验收旧客户端查单、已过账回执找回和手机键盘操作 | 6.1 切换与恢复、6.2 待签认决定及候选版本用例 |

## 二、行业依据与适用范围

- **按群追溯。** WOAH《陆生动物卫生法典》第 6.5 章建议按群保存健康、生产、用药、免疫、死亡等记录，记录清洗消毒；条件允许时采用全进全出。现有整群转舍、关闭后清舍验收、历史占栏关联符合这个方向。WOAH 的建议保留其他养殖模式的空间，一舍一群是本项目选定的运营边界。[WOAH 第 6.5 章][woah]
- **养殖档案。** 对中国境内适用主体，《畜牧法》第四十一条涉及品种、数量、来源、进出场日期、投入品、免疫消毒、诊疗、死亡及无害化处理等记录。验收时应抽一个已关闭鸡群，从入栏凭据查到上述适用记录及原始附件。跨境公司另按所在地和经营类型核对，当前证据只支持功能覆盖判断。[《中华人民共和国畜牧法》第四十一条][law]
- **生产表现。** Hy-Line 将育成期体重、存活率、产蛋期 hen-day 和 hen-housed 指标分别列示，其管理指南还关注体重均匀度。建议按品系、饲养方式、指南版本和周龄显示适用目标；实测数据、历史未知值和目标值分开。指南中的示范周龄和目标值不宜成为所有鸡群的硬性过账条件。[Hy-Line Brown 性能标准][hyline]、[Hy-Line 管理指南][guide]

## 三、现有能力应保留什么

| 业务节点 | 当前权威记录与职责 |
|---|---|
| 新入栏与历史接续 | 新群核对来源交接单、有效品种、舍容量和清舍状态后建立群号与占栏。旧群经实盘基线接续，保留差异和证据。档案已禁止直接建群、覆盖存栏和直接换舍。[入栏与基线][admit]、[档案写入保护][archivepolicy] |
| 在栏变动与淘汰交付 | 死亡处置、淘汰移至待售、整群转舍、盘点调整分别产生事实。待售交付扣待售余额并形成待财务处理的结算凭据。制单、审核、过账以及历史冲销保留原单和审计。[业务动作][kinds]、[事务和独立审核][workflow]、[待售交付和转舍][transfer] |
| 产蛋与健康 | 班次日报记录生产，产蛋来源与发生时的占栏关联。疫苗执行、药品使用归兽医模块；转舍后仍可分别查询原发生位置与当前照管位置。受控库存来源用于追溯包装和子批，历史未知来源保留未知。[生产事实][facts]、[照管查询][care]、[批次来源追溯][trace] |
| 群关闭与鸡舍重用 | 关群已有存栏、最后产蛋、交接、未完单和健康检查。关闭后保留历史占栏；清洗和验收决定下一批能否进舍。[关群][close]、[鸡舍周转][turnaround] |

## 四、问题、影响与修改方案

### 第一批 · 修正数据和现场操作

| 发现 | 复核结果 | 应修改及验收 |
|---|---|---|
| **1. 转舍日目标舍日报多记死亡** | **PG18 实测。** A 舍 100 羽，死亡 10 羽，当天其余 90 羽整群转 B。B 舍首次正常日报及单独场景中的批准补录都落库死亡 10；B 占栏的死亡事件合计为 0。首报和补录取群日总数，重建与 BI 按事件占栏取数。现有转舍测试先手工插入日报、再触发重建，未检查两条真实写入路径的即时结果。[首报][first]、[补录][supplement]、[重建][rebuild]、[现有测试][testmove] | 三条写入/重建路径复用占栏损失计算，保留群日总数供整群报表使用。分别从首报、补录、重建、BI 验证 A 死 10、B 死 0、群死 10、存栏 90。加淘汰及冲销变体。历史缓存单独列差，先核对在途更正单及其原快照；处置规则见第 5.6 节 |
| **2. 手机死淘汇总会漏掉已过账事件** | **调用链核验。** 移动页仅累加当天最多 200 条日报；正式分班的死淘缓存有意为 0。当天只有早晚班日报、另有已过账淘汰 3 羽时，页面会汇总为 0；只有事件而尚无日报的舍也不会从这条查询出现。[移动汇总][mobileloss]、[移动请求][mobileapi]、[正式统计口径][facts] | 移动汇总优先复用现有 `mobileApi.getDailyHenReport(date)` 的 `rows/totals`，保留未接续历史日报的原单编辑入口。按发生日、占栏和基线边界合并事件与历史日报。验收早晚班、事件先于日报、超过 200 行及新旧群并存，逐舍对回 BI |
| **3. 更正日报切舍后沿用上一舍数据** | **Chromium 实测。** 选 A 舍原日报，再选另一舍，界面已切为“缺日报补录”，分级 77、饲料 8 和原备注仍在；桌面和手机结果一致。所选原日报为合成样本，检查止于保存前。提交逻辑会从这些状态构造更正内容；后台是否允许过账还取决于新舍的实际占栏、附件和审核。[切舍][switchhouse]、[组装请求][body]、[原日报选择][pickreport] | 将草稿绑定到业务类型、群、占栏、日期和原日报。改变身份时提示保留或放弃草稿，清空或重载全部来源数据及证据。验收切舍、切群、切日期、旧请求晚返回和保存后再次制单 |
| **4. 待审单被后来草稿挤出列表** | **PG18 实测。** 先提交一张待审单，再建 500 张草稿。列表返回 500 张、旧待审单消失，按 ID 查原单仍为 `SUBMITTED`。前端只在返回集合里筛选。原日报查询也只取最近 500 条，跨期更正依赖这份集合。[单据列表][queue]、[日报与占栏列表][reports]、[前端筛选][webqueue] | 服务端先按授权范围、岗位、状态和业务条件过滤，然后稳定游标分页；单据、历史日报及占栏支持按 ID 或群舍日期查找。验收第 501 张以后仍可找回、同时间戳翻页不重复、跨范围不可见 |
| **5. 日报快捷入口与实际制单权限不一致** | **调用链核验。** 桌面及移动日报都检查 `MENU_FLOCK_CREATE:C`；生命周期表单和写接口使用 `E`。现有 HTTP 夹具就有只授 `E` 的制单员。此外，页面只对部分专项动作检查权限，转舍目标选择只要求容量有值；如 800 羽选了容量 500 的空舍，完整数量检查到过账才触发。[桌面入口][pcperm]、[移动入口][mobperm]、[服务端动作][perm]、[转舍预检][pretransfer] | 复用已授权动作，不批量放宽角色。页面随动作显示专项权限、目标容量及不满足原因，服务端过账仍复核。验收仅 E、仅 C、专项审核、同人制审、同公司不同场，以及不足容量 |
| **6. 已关群仍可审批普通死淘单** | **PG18 实测。** 群已归零并关群，其后新死亡单仍能走到草稿、已提交、已审核，最后过账才被阻止。关群本身会检查未完单，两条命令对同一业务条件的保护时机不同。[制单][create]、[过账限制][closedgate]、[关群检查][close] | 普通活群动作在制单/提交时检查生命周期，制单与关群共用适当的群舍事务锁。关闭后的受控日报更正、历史冲销及待售交付按各自资格继续办理。验收“先关再制”和两者并发 |

### 第二批 · 完善档案和生产管理

- **先校准日龄、周龄和阶段。** 档案将入栏日龄和经过天数各自换算成整周再相加。以 118 日龄入栏、过 2 天为例，界面算 16 周，按总日龄 120 天应为 17 周余 1 天。保存处还会把合法的 0 日龄写为 1。新入栏一律初始为 `GROWING`，档案允许修改在产生长状态。建议统一业务日算法，保留零和未知；若允许外购已开产群，以交接确认的阶段记录入栏，支持可追溯的阶段变更。[周龄显示][age]、[档案保存][archivesave]、[新群初始状态][newstatus]
- **给场长一张按群的周期视图。** 首屏显示品系、入栏来源、日龄、当前舍、存栏、累计死淘和待办；时间线串起转舍、生产、养护和结束。生产趋势分别显示按在产母鸡和按入舍母鸡计算的指标，并明确各自分母。育成期可关联称重样本、均重和均匀度。对实盘接续且缺原始入舍数的群，累计入舍母鸡指标显示资料不足。在 farm API 和桌面 breeding 页面按 `uniformity|均匀度|body_weight` 检索无匹配，是否已有其他系统的称重数据待现场确认。[现有档案字段][age]、[品系性能标准][hyline]
- **把现场输入与审批反馈做完整。** 档案现可编辑鸡舍，保存时服务端会拒绝；入栏按钮打开通用页，默认业务类型是死亡。建议鸡舍只读并提供“办理转舍”，入栏入口直接选中入栏。现有动作先写入再整页刷新，读失败与命令失败共用提示。应先呈现已创建单号或动作回执，再单独提示刷新失败，避免用户重复操作。[档案入口][archiveentry]、[档案禁改鸡舍][nohouseedit]、[页面状态与刷新][refresh]
- **关群前展开阻断项。** 已有按占栏和日期查询交接阻断的 API，前端源码中检索 `close-blockers|closeBlockers` 无调用。建议接入该查询，再显示存栏、未完单和健康检查各自的结果；可访问事项提供办理入口，跨范围阻断提供转交说明。最终过账检查继续以事务内最新事实为准。[现有阻断查询][blockers]、[关群过账][close]

## 五、UI/UX 专项复核与页面重构方案

### 5.1 结论和实测依据

**主分支的生命周期主页面未达到项目对业务列表、单据详情及审批页面的分工要求，建议将前端页面拆分列为第一期交付。** 用户在同一条纵向页面中选择鸡舍、切换 13 种单据类型、填写条件字段、查找待审单、看免疫休药记录，再到页尾读单据和附件。公司、鸡群、单据、审核任务在页面上没有各自稳定的位置。已有品种确认是独立抽屉，统一选择器、受控附件和后端单据状态机可继续复用。[页面与数据加载][loadpage]、[单据与审核区][webqueue]、[品种确认抽屉][breedDrawer]

前期 UI/UX 专项在固定主线的真实 Next.js 页面和 Chromium 中，以同一制单员、12 个鸡舍、40 张已过账单据测量。登录与授权来自隔离夹具，列表及所选详情使用合成响应。两次均点第一张单据的“原单与事件”。下表前两列距离相对页面标题，第三列相对点击后当前视口顶部，单位为 CSS 像素。

| 视口 | 制单区起点 | 单据列表起点 | 已加载详情起点 | 用户实际看到的结果 |
|---|---:|---:|---:|---|
| 桌面 1440 × 1000 | 739 | 1,203 | 6,618 | 详情在屏外，键盘焦点未进入详情 |
| 手机 390 × 844 | 2,539 | 3,743 | 6,507 | 选第一舍后制单区起点仍在屏外；点原单后详情也在屏外，焦点未进入详情 |

这是同一组数据下可复查的导航问题。数字随记录数、岗位及设备变化，不作为生产延时或用户耗时指标。上轮“无横向溢出”的结果与本次纵向定位问题可同时成立。

### 5.2 与项目规范、已交付页面及 ERP 交互模式的差距

| 检查项 | 主线现状和影响 | 重构要求 |
|---|---|---|
| 页面骨架与导航 | 桌面和手机路由直接挂载同一组件。主内容以自建标题、全舍卡片和连续区块展开，入口同时出现档案、移动死淘和管理员权限注册。岗位任务难以定位 | 后台按台账、单据和审批选模板；移动按现场任务组织。权限注册迁至角色配置的管理员入口，既有注册和授权过程保留。[项目页面模板][pageGuide]、[现有导航][navAudit] |
| 列表与记录选择 | 单据用卡片逐条平铺，通常显示“群号或舍号”，缺少常规按单号、类型、状态、群舍和日期的组合检索。原单详情和图片预览追加在页尾。只读用户点“选择此舍”不会打开对象详情 | 提供业务列表、服务端检索、逐行详情入口及可分享的单据地址；只读人员能查对象、审计和授权证据。[单据列表][webqueue]、[原单详情与预览][currentDetail] |
| 表单与草稿 | 默认死亡单，选择业务类型后就地显示不同字段。切舍只清部分字段；从看板开始清舍使用原生 `window.confirm`，违反项目确认框规则。保存后表单重置，用户要另找草稿提交 | 从命名的业务动作进入独立表单，保存后直接定位这张草稿，支持有权限者提交。上下文变化、取消与未保存提示走统一交互。[草稿切换][switchhouse]、[原生确认][nativeConfirm]、[项目前端规范][frontRules] |
| 决策和视觉层级 | 单据列表同时呈现“原单与事件”、提交、审核、过账、取消。状态是普通内联文字，单据状态和舍状态各自含义难比较。列表上的不可逆动作缺少所影响对象及数量的就地核对 | 行首保留单据标识和详情入口，状态用带文字的统一徽标；主动作随单据状态和本人权限变化。取消单据、实际过账在确认层注明群、舍、业务日和影响。关闭弹层用“关闭窗口”或“返回”，与“取消单据”区分。[当前行动按钮][rowActions]、[状态组件][dsIndex] |
| 异常、空态与响应 | 七个请求通过同一个 `Promise.all` 应用结果；读详情也经全局刷新。列表加载中和确实为空早期都使用空数组；局部失败与写入成功后刷新失败共用页顶消息 | 列表、详情、提交回执分别管理加载/空/无匹配/无权/失败状态。只刷新受影响列表与详情；旧请求不得覆盖新选择。保存成功先显示单号，即使刷新失败也能找回。[初载][loadpage]、[命令反馈][refresh] |
| 可访问性、语言和字段含义 | 详情展开缺焦点转移。动态群号、数量单位及固定中文日期格式需要三语核对；详情将数值零也显示为缺失。使用者可能误读入栏日龄 | 对话框有名称、首焦点、关闭后焦点回到调用行；字段错误就地读出。用翻译参数组织单位和日期，以空值判断缺失。分别命名“已关群”和“淘汰移至待售”。[详情格式][currentDetail]、[档案周龄][age]、[项目注册表][dsRegistry] |

**对标依据。** 项目模板指南分别定义了台账的筛选、表格与详情抽屉，单据的明细、附件与审批轨迹，以及审批待办和移动作业骨架。仓内“门店补货编排”已实际采用筛选列表、单据抽屉和按动作打开的确认弹窗，可作为实现参照。SAP Fiori 将查找多条记录、处理待办、管理单个对象分配给不同页面类型；Dynamics 365 把对话框用于用户可明确提交或取消的单项任务。以下六个业务列表及交互分配是针对本项目的设计提案。[项目模板指南][pageGuide]、[补货列表与抽屉][storeList]、[补货确认弹窗][storeModal]、[SAP Fiori 页面选型][sapUX]、[Dynamics 365 对话框][msUX]

### 5.3 目标导航及功能列表

后台侧栏保留“生产管理 → 鸡群生命周期”一个模块入口，在模块内给出六个有独立 URL 的业务列表和一个跨业务“我的待办”。每个列表可以收藏、刷新和返回。样板期间旧根入口继续服务未迁功能。全量切换后，桌面无参根入口进入“入栏与接续”，手机无参旧地址保留“办理死淘”的用途。审批人的待办快捷入口直达“我的待办”；生产入库的指定舍日复核入口保留独立筛选。以下地址均为**拟建**，相对前缀为 `/breeding/flock-lifecycle/`。

| 业务列表及路径 | 一行代表什么、常用列 | 用户可直接办理的事 |
|---|---|---|
| 入栏与接续 · `admissions` | 一张入栏或实盘接续单。分视图“新入栏 / 历史接续”，列出群、鸡舍、来源、交接号或实盘差异、羽数、状态 | 新建入栏、历史实盘接续；品种未核实时进入已有确认抽屉，再返回原单 |
| 转舍 · `transfers` | 一张整群转舍单。来源舍和目标舍并列，显示群、交接数量、目标容量、业务日、状态。待过账数量标为预计，已过账从事件读取 | 新建转舍、检查目标舍能否接收、查看转出和转入事件 |
| 死亡与淘汰 · `losses` | 一张死亡处置或淘汰移出单。显示发生舍、群、类型、数量、处置方式或待售位置、日期、状态 | 分别提供“登记死亡”“淘汰移至待售”；从已过账原单发起符合条件的冲销 |
| 待售交付 · `held-deliveries` | “待售批次”一行一个位置批次，显示来源、位置和当前余量；“交付记录”一行一张交付单，显示客户、交付数量、币种金额及已过账结算凭据 | 从批次行办理交付，余量和历史交付可追查。过账后的结算依据标示“待财务处理”；应收、实收和收款深链另需财务权威记录 |
| 关群与清舍 · `turnaround` | “鸡舍周转”一行一个鸡舍，显示当前群、余额、清舍状态、最近验收和可办动作；“单据记录”一行一张关群、清洗或验收单 | 查看阻断项；授权范围内可定位的事项支持跳转，其余显示转交方式，分别办理关群、开始清舍和清舍验收 |
| 盘点与更正 · `corrections` | 一张盘点、冲销、更正补录或历史授权单。子视图按这四类筛选，列出原单/日报、占栏、原业务日、差额、授权状态和单据状态 | 盘点调整、由原单冲销、由原日报更正或选缺报日补录、为指定来源申请期间授权 |
| 我的待办 · `inbox` | 一张本角色有资格处理的单据。分“可提交 / 可审核 / 可过账”，按本人权限、专项权和相关鸡舍范围筛选；缺资料、容量等阻断另行标识并禁用对应动作。“我创建的”是可选筛选条件 | 打开该单核对证据、审核或过账；办结后回到原队列，定位下一条。保留独立审核人限制 |

公共列表工具栏按业务需要提供公司/场、鸡舍、群、业务日期、状态和单据号；转舍另有源/目标舍，交付另有客户。每页只有一个主要创建入口，数量型操作始终展示单位。筛选、排序与当前视图进入 URL；返回恢复页码或游标、滚动位置和选中行。所有查询使用授权范围，用户缩小筛选只会进一步收窄范围。

**列表交互示例 · 转舍**

```text
生产管理 / 鸡群生命周期 / 转舍                         [新建转舍]
公司/场  来源舍  目标舍  群号  业务日期  单据状态       [查询] [重置]
单据号   业务日   鸡群   来源舍 → 目标舍   羽数   状态   操作
…       …       …      A 舍 → B 舍       90    待审核 [查看]

查看 → 当前行的详情抽屉：单据与状态 / 两舍及数量 / 证据 / 审核轨迹
      → 审核成功：显示回执 → 关闭抽屉，回到同一筛选、同一行
```

### 5.4 全部 13 种单据的办理容器

后台短任务用表单弹窗；需要同时参考原列表或查看多组字段用侧抽屉；有跨单对比、重算或多项阻断的业务用可直达的独立单据页。本期单据号采用现有完整 UUID `documents.id`，支持复制、精确搜索和深链；`source_key` 仅用于幂等与授权绑定。列表均可通过单据号打开详情抽屉，复杂单据提供“打开完整单据”。下表中的“保存”指创建草稿；提交、审核、过账各自返回独立回执，遵守现有状态机。[后端单据分类][kinds]、[受控状态迁移][workflow]

| 单据类型 | 从哪里发起 → 办理容器 | 办理时必须看清的事实 |
|---|---|---|
| 入栏 `ADMIT` | 入栏列表“新建入栏”或可入栏舍 → 制单抽屉 | 来源、交接号、日龄、实入羽数、验收与容量、证据；保存后打开新草稿 |
| 历史接续 `BASELINE` | 历史接续视图选旧群 → 独立核对页 | 旧余额、实盘数、差异、证据及责任人并列；缺品种转交合资格实名审核人，返回原单；基线日切线见第 5.6 节 |
| 整群转舍 `TRANSFER` | 转舍列表或鸡群详情“转舍” → 制单抽屉 | 源舍、整群可转数、目标可用容量、最早业务日；过账前复核两舍及数量 |
| 死亡处置 `MORTALITY` | 死亡列表或手机选定鸡舍 → 短表单弹窗；手机单任务页 | 当日占栏、死亡数量、处置方式、接收人、责任人、证据 |
| 淘汰移出 `CULL` | 淘汰列表或在栏群 → 短表单弹窗；手机单任务页 | 移出羽数、待售安置位置、证据；保存和过账各显示实际完成步骤 |
| 待售交付 `SELL_HELD` | 待售批次行“办理交付” → 交付抽屉 | 批次余量、客户、币种、单价及其小数位数、结算总额、接收回执及休药阻断；财务凭据取实际过账值 |
| 关闭鸡群 `CLOSE` | 鸡舍周转行或当前群详情 → 独立关群核对页 | 存栏、最后产蛋/零产蛋依据、交接、养护及未完单逐项核对；跨范围事项转交，仅授权且可定位的事项可打开 |
| 开始清舍 `CLEAN_START` | 待清舍或首次清舍的鸡舍行 → 短表单弹窗 | 明确鸡舍、清洗业务日和作业依据，清洗与可入栏显示不同状态 |
| 清舍验收 `CLEAN_ACCEPT` | 清舍中的鸡舍行 → 验收弹窗 | 对应清洗、验收人、实际日期、证据；过账后更新周转行 |
| 盘点调整 `ADJUST` | 盘点视图选群 → 调整抽屉 | 系统余额、实际盘点、带正负号的差额、预期结果与依据；接口沿用有符号差额 |
| 冲销更正 `REVERSE` | 可冲销的已过账原单 → 独立原单对比页 | 原事件、冲销及可选重记、数量影响和待售去向；依赖后续转舍时展示阻断 |
| 日报更正/补录 `REPORT_CORRECTION` | 原日报行“更正”或选定群舍日“补录” → 独立差异页 | 已有原日报按 ID、占栏、班次核对原值/新值；整舍日无记录才可补 `DAILY`。缺一个正式班次按第 5.6 节分流 |
| 历史期间授权 `HISTORY_AUTH` | 需跨期处理的更正单行 → 绑定原单的授权抽屉 | 当期签发并绑定原草稿来源、群舍和受影响原日期；授权过账后继续原草稿。重制产生新来源，重新授权 |

**其他现有功能的归位。** 鸡群身份和周期时间线归现有鸡群档案，鸡舍卡片成为周转视图；档案、桌面日报、移动日报及移动死淘页用深链带入群舍和日期。免疫计划、疗程结束与休药核查分别回到免疫、用药和质量页面，群详情仅展示摘要和关联入口。配置页负责管理员注册动作和分配权限。附件从所属单据详情受控打开，返回原单保留位置；交付单详情展示本单的结算依据。未来如展示实收，须先建立有权限的 ERP 财务回执关联，涵盖部分收款及冲销。每项功能保留原有角色和数据范围。[档案入口][archiveentry]、[兽医处理区][careArea]、[用药页][medicineOwner]、[质检页][qualityOwner]

### 5.5 完成交互所需的组件和接口

- **列表。** 从项目页面模板起步，使用共享页头、筛选栏、文本状态徽标及反馈组件。项目当前导出明确区分 `CrudTable` 和接收业务查询结果的 `PresentationalTable`。生命周期单据使用专用受控接口。给展示表或模板增加可选的服务端排序和分页模式，保留现有前端数组用法；模板在已取回的数据上切页不能解决第 501 张旧待审单。列表只取摘要，打开某一单再加载明细和附件。[页面模板][pageGuide]、[当前组件导出][dsIndex]、[展示表分页][tablePage]
- **弹层。** 复用 `ModalV2`、`DrawerV2`、`ConfirmDialogV2` 及已有品种确认抽屉。公共组件当前的 Escape、遮罩关闭与焦点管理需要逐项验收。打开时聚焦标题或首个可编辑字段，Tab 在模态内循环，Escape 只关闭最上层，返回时聚焦原行按钮；保存中禁用重复提交，关闭按钮、Escape 和遮罩统一保护正在发送的请求；表单有改动时通过确认层决定是否放弃。移动端长流程单页处理，软键盘弹起后仍能看到错误和主要操作。[共享弹窗][dsModal]、[共享抽屉][dsDrawer]、[确认组件][dsConfirm]
- **数据接口。** 六个列表中的单据视图共用现有单据资源，新增按单据类型、状态、群舍、日期、单号等过滤和稳定游标。待办服务端判定角色、专项动作、自审限制与数据范围。待售批次、鸡舍周转依各自对象查询。选中对象才拉有效候选、原日报或历史占栏；关群调用已有占栏交接阻断查询，并补足其他阻断原因。创建后返回并展示单号、版本和下一步允许动作；过账仍以事务内复核为准。[控制器][controller]、[单据列表][queue]、[关群阻断接口][blockers]
- **异常与草稿。** 单据持久化后按现有规则留存原内容，需修改时按许可取消并新制。交互中仅清除或恢复当前任务自己的未保存字段。版本冲突提供重读和差异；创建和状态动作分两种恢复协议，见第 5.6 节；命令已成功而刷新失败时仍显示上次成功回执。附件预览失败仅在当前单内重试。[内容幂等][create]、[事务版本][workflow]
- **视觉与语言。** 单据状态列使用草稿、待审核、已审核、已过账、已取消；群阶段、鸡舍状态与财务状态各列独立。主按钮用动词标明影响，危险操作核对对象；数量右对齐、带单位，缺失值与真实零分别显示，日期按当前语言和业务时区解释。沿用选择器、字典与上传组件，覆盖中文、英语及老挝语；颜色之外保留文本含义。[项目视觉规则][frontRules]、[项目补货页][storeList]

**开发职责。** 前端按业务路由持有筛选、选中行和返回位置，单据表单分别管理本任务的字段、校验和草稿，详情与回执可跨列表复用。后端在现有 farm 模块内将列表/待办查询、动作资格判定、过账编排分开。资格规则同时服务列表提示和写入校验，过账服务在同一数据库事务内重新取数、加锁、写事件和审计。日报写入、重建和移动汇总复用相同的占栏损失定义。兽医、库存、财务继续提供各自的原始记录；单据详情按授权引用。首期以现有命令入口及测试固定行为，再逐项抽出查询与规则。

### 5.6 接口契约、业务例外与验收反例

以下条款是实现与验收的共同依据。“拟增”表示需要开发，既有服务的测试结果只证明当前行为。

**一、区分查单、待办和过账。** 业务列表回答“我能查哪些记录”；我的待办回答“我能以哪个身份处理哪些记录”。入库工作台另有“本舍日生产复核”，供跟踪跨人处理的关群及更正单。以下路径相对 `/api/v3/farm/flock-lifecycle`。新列表建议单独提供 `GET /documents/search` 和 `GET /inbox`，静态路径优先于 `documents/:id` 匹配，响应为 `{code, data: {items, nextCursor}}`。原 `GET /documents` 继续返回 `{code, data: Doc[]}`。查询先裁剪范围、状态和类型，再按 `created_at DESC, id DESC` 稳定翻页；游标绑定查询条件，每页校验当前授权。首期用完整 UUID 精确查单。浮动队列办结后可刷新首页，返回已有列表时恢复原筛选，原行离队则聚焦下一行或队列标题。[现有读写路由][controller]、[原列表][queue]、[原单 ID 与来源键][docid]

| 用户要做的事 | 权限、范围与界面反馈 |
|---|---|
| 查看原单、附件及跨场转舍记录 | 现状为列表按制单归属筛选，详情按原舍当前授权检查，已有转舍详情包含两条事件；附件须属于原单并通过受控校验。首期沿用既有原单可见范围；目标舍筛选仅收窄既有结果。只有目标舍权限时可查本人范围内的占栏事实。拟扩大的跨场字段或历史原单访问另由数据负责人签认。验证仅源舍、仅目标舍、双舍及归属变化，分别检查列表、详情和附件。[详情与证据][readEvidence] |
| 创建/提交、审核、过账、取消 | 通用权限分别为 `MENU_FLOCK_CREATE:E`、`MENU_FLOCK_APPROVE:A`、`MENU_FLOCK_POST:E`，叠加该类型的专项 A。本期沿用同范围具备制单权者可提交他人草稿，制单人不能审核自己。取消已审核单还需审核权。转舍动作核两舍；更正、待售交付、冲销过账另核群当前舍。个人待办只列本人承担的动作，并标出当前业务阻断。可查看但须他人处理的单据留在业务列表或指定舍日复核视图，详情注明下一处理岗位。审核人发现资料有误，保持原状态并显示制单人供联系，由有权人取消重制；当前状态机无驳回动作。缺少合资格人员时由权限管理员按既有流程分配。[动作目录][kinds]、[事务授权][actionScope]、[当前舍校验][closedgate] |
| 确认历史品种、办理跨范围关群阻断 | 品种确认须实名账户同时具备审核与基线专项权限。关群交接查询会检查旧占栏，并将无权查看的事项合并为 `OTHER_SCOPE_REVIEW`。对该项只显示“其他授权场区待核”及转交说明，隐藏原单号、链接及对象明细；无专业写权限时保留只读提示。验收 A 转 B 后 A 遗留未签交接，仅管 B 的场长请求协作，有权人员解决后场长刷新预检再过账。[品种确认][breedAction]、[阻断项脱敏][maskBlocker] |

**二、把超时恢复写成协议。** 创建前暂存当前登录人、授权范围、`sourceKey` 和第一次发出的完整请求，包括原版本和附件 ID；验证能跨刷新恢复，限制保存期，办结/退出清理，切换账号不展示他人数据。创建响应丢失时原样重发，同公司同键同内容找回原 ID；同键异内容返回冲突。恢复结果前禁止静默换键。余额或鸡舍版本随后改变时，先找回原草稿，再按取消重制处理。状态动作以单据 ID、动作和版本发送：重复 `post` 已过账可回原单，其余动作超时先查详情和审计。若其他人已推进状态，展示实际执行人、状态与时间。验收分别在创建和提交事务完成后丢响应并刷新，核对一张草稿、一条相应动作审计和一次实际入账。[创建幂等][create]、[状态版本][actionScope]、[审计回执][readEvidence]

**三、以实际业务边界分流。**

| 情形 | 实施规则和验收样本 |
|---|---|
| 历史实盘日与新入栏日 | 当前受控日报把历史基线日归于只读历史，普通事件过账允许等于基线日。建议按日终实盘签认：旧日报死 3、日终实盘 100，该日沿用旧 3，次日新增死 2 后余额 98。上线前须由场长确认；未签认群保留历史流程。若确属日内盘点，另设计可证明的盘点时点与事实去重；不得猜测哪笔已含在实盘。正式新入栏后同日损失仍可记录。移动汇总复用现成的 `/api/v3/farm/daily-hen-report?date=…`，区分历史、已结束占栏及无日报事件，逐舍和总数对回 BI。[业务日汇总][henReport]、[基线日报边界][baselineWindow]、[过账日期][closedgate] |
| 已有日报更正、整日无报、缺一个正式班次 | 原日报按 ID、群舍、班次、占栏、原值哈希绑定；同舍日多条时必须选择。仅整舍日无记录才按 `ABSENT` 补建 `DAILY`。正式早班已报、缺晚班时，当月走有资格的正常班次入口补实际晚班；跨月普通首次录入被拒，受控整日补录也不适用。显示明确原因，交主管专项处理，继续阻断关群。若经营方确认要补单班，另立受控班次补录契约。关群须查齐有效班次，已有非零产蛋不得改以零产签认。验证同一组早晚班的当月与跨月两种情况。[首报期间][periodFirst]、[更正和竞争][snapcheck]、[整日补录][supplement]、[正式关群][close] |
| 跨月授权 | 先创建待处理的原草稿，授权单在当前期签发，针对已结束月份，绑定原 `source_key`、公司、群舍与受影响旧日；冲销取被冲销原单的业务日期。由合资格人员签发、审核、过账授权后回原草稿继续，无需修改原负载。取消重制产生新来源时重新授权。验证同舍同日错来源不放行。[期间授权][periodAuth]、[原影响期回归][periodTest] |
| 关群与普通制单竞争 | 创建先保留同来源已成功请求的幂等回执，再对新增普通活群动作复用按确定顺序获取的鸡舍/群锁，在同一事务核当前归属和关闭状态。普通草稿先创建成功则关群受阻；关群先完成则新普通草稿被拒且无新增审计。保留已有所有未完单的关群阻断，包含另一张关群单；两张相遇显示有权人员可取消其中一张。现有关闭后合资格的交付、冲销、日报更正及其历史授权继续按各自门槛办理。是否允许部分在途单跨越关群属另行签认的规则变更。[加锁与状态机][workflow]、[关群未完单][close]、[授权过账][periodAuth] |
| 待售余量与财务依据 | 以待售记录 ID 和版本选定批次。10 羽交付 6 羽后余 4，原群存栏不再扣；过账凭据列出币种、存储单价和结算金额。建议在写入前校验可存储单价精度（当前六位）、以同一单价计算两位金额且金额须为正；页面及凭据能复算。结算表默认 `PENDING_FINANCE`、禁止更新/删除。首期只承诺待财务处理，实收/部分收款/冲销以后按有权限的 ERP 财务回执关联。[结算写入][transfer]、[不可变结算凭据][financeFixture] |
| 历史日报缓存纠错 | 写入逻辑修复后，历史存量单独只读列差。死淘缓存包含在原日报快照哈希内；改变缓存会使哪怕只改饲料的在途更正单失效。先列关联未完单和归档边界，再选择暂缓修整该行，或经授权取消、按事实修整并重制。保存原审计，严禁改旧单哈希、用新数覆盖原声明。验收同日目标舍死亡 10→0 后，群日仍为 10，BI 和两舍明细一致，在途单按选择的方案有可追查的结果。数据修复另审，不随 UI 启动自动执行。[快照字段][snapFields]、[过账比对][snapcheck]、[归档过滤][rebuild] |

## 六、实施顺序、兼容和审查验收

| 顺序 | 交付与切换方式 | 通过条件 |
|---|---|---|
| 1 · 先交付一条走得通的流程 | 将“死亡与淘汰”及“我的待办”作为样板。同步修占栏死淘取数、移动汇总、动作权限，补服务端分页；交付从列表、新建、查回、审核到过账的完整链 | A 舍死 10 再转舍，A/B 日报与 BI 对账；第 501 张以后的待审单可找到；从手机选定舍登记并找回原单；审批人无需滚过制单和养护区 |
| 2 · 完成其余功能列表 | 迁移入栏、转舍、待售、关群清舍、盘点更正；用专属表单替换通用业务类型选择。保留原单号、证据、权限、数据和记账事务；专业模块接收带上下文的办理入口 | 13 种单据逐项验收新建/查单/可用状态动作、受限角色、撤销未保存输入和失败恢复；关群和普通制单并发符合第一批验收 |
| 3 · 兼容与切换 | 原桌面/手机 URL 解析现有 `kind`、`houseCode`、`date`、`dailyLogId`、`shift`、`review=pending` 等上下文，转入相应业务列表、制单界面或指定舍日复核视图。无权、对象不存在或日期与占栏不符给出原因及返回入口。新旧界面共用写接口 | 从旧收藏、档案、普通日报、历史补录、移动死淘和审核链接分别进入；直接打开单号、刷新和浏览器前进/后退均恢复对应对象，跨范围请求被拒 |
| 4 · 现场验收 | 场长完成整群转舍、受阻关群及跳转处理；饲养员在手机完成死亡登记、上传和找回；审核人从老单核对证据并处理。抽一个实群串查入栏到关闭和一批蛋的来源 | 记录成功率、错误和耗时；核对每笔羽数的原占栏、原单和回执。是否开放部分转群、同舍多群，及历史实盘当天的业务截止时点，仍需运营签认 |

### 6.1 分批切换与恢复

| 入口/组合 | 路由或数据契约 | 验收与停用条件 |
|---|---|---|
| 桌面档案 / 侧栏 | 第一批发布时保留旧根页；优先从已迁移操作显式进入 `losses`、`inbox`。入栏列表交付并验收后才将桌面无参根页改到 `admissions`。档案“办理入栏”显式带入该动作 | 只读账号、制单员及管理员分别访问旧收藏与新入口，未迁功能可继续办理 |
| 手机死淘 / 桌面与移动日报 | 旧手机无参 `/mobile/flock-lifecycle` 进入死淘选舍；新的现场入口有可靠舍日时直接带入。日报的死亡或更正深链保留 `kind/houseCode/date/dailyLogId/shift`。历史日按当日占栏解析；已换群时不得自动选择今天的群 | 无参旧手机收藏、已有原日报、同舍日两班、过期或无权的 ID 各测一次；解析失败给返回入口，不能自动变成新补录。[移动旧入口][legacyMobile]、[日报链接][pcperm] |
| 入库工作台的“待复核” | 兼容 `review=pending&houseCode=…&date=…#flock-documents`，定位指定舍日的 `REPORT_CORRECTION/CLOSE`、状态 `SUBMITTED/APPROVED`。这是查阅队列，不当作个人可办动作过滤。保留工作台入口本身的权限判断 | 核验可查看且有审核权、无过账权的人仍能看到已审核单；自审被禁不影响其依权限查看。其他舍日、死亡单不混入。[入库复核链接][legacyWorkbench]、[原筛选][webqueue] |
| 新旧 Web/API 配合 | 先验旧 Web＋新 API：返回数组、详情、附件、原命令均兼容，并能继续办理新版创建的单；再启用新 Web。新 Web 遇未具备查询契约的 API 时保持旧入口或提示该功能暂不可用。每个新 URL 在退回旧界面后仍有可用落点；保留带业务 ID 的只读查回能力 | 在隔离环境演练新入口停用、旧链接及已办回执找回。若已发生写入，保留事件、审计、草稿和结算凭据，按受控流程停写或前向修复；迁移有业务事实时不以结构 down 恢复。若实际需要迁移或发布，使用此次实际版本、迁移清单和备份核验。[运行手册的恢复条件][restoreRun] |

### 6.2 本次请审查的决定

- **建议批准第一期。** 六类业务列表和一个个人待办为目标结构；先验收死淘与待办的完整办理链。沿用原单 UUID、现有单据状态和财务结算凭据。正常制单、独立审核、专项权限和数据范围均纳入放行条件。
- **需运营或数据负责人签认。** 历史实盘采用日终还是可证实的日内时点；单舍授权在跨场转舍原单中可见的对方字段；是否存在能分开计量的部分转群。出现未确认的实际情况时，先展示受阻和有权岗位的处理路径。
- **需单独立项才承诺。** 跨月补缺单个正式班次、财务实收跟踪、新增驳回状态及调整未结单跨关群规则。保留各自现有的查阅、联系、取消重制或专项核对路径。

**候选版本的界面验收用例。** 使用同一套 12 舍、40 单的合成数据在桌面和 390px 手机回归，另用 500 张以上历史单核验服务端查询。以下为拟交付功能的验收条件。

1. 各业务列表默认显示筛选和记录，无需经过全舍卡片和制单表单；新建时业务类型已确定。手机选舍后直接进入当前任务或显示下一步。
2. 点任意行的详情，标题和单据号立即可见，键盘焦点在详情内；关闭回原行、原筛选和滚动位置。处理完待办后，已办单从当前待办视图退出，回执仍可打开。
3. 切舍、切群、切日期、已有日报切补录均不会带入上一对象的分级、料水、附件或备注；慢响应不会覆盖当前对象。已提交命令遇到列表刷新失败，仍可按回执查原单。
4. 只读、制单、审核、过账及管理员各自可见正确的动作。测试无权、自审、过量、过期版本、未清舍和关群阻断；行内说明原因，后台再次检查。
5. 测明暗主题、键盘单独操作、弹层关闭时焦点恢复及手机软键盘；三种语言检查日期、羽数、状态、动态反馈和长标签，运行项目三语键与硬编码文案门禁，浏览器结果记录候选 SHA。[现有 i18n 门禁][i18nGate] 分别演示加载、空列表、筛选无结果、权限拒绝与局部重试。
6. 从浏览器网络记录验证列表翻页、打开详情及预览附件只读相应资源；访问转舍列表不以读取全部历史日报、养护数据或旧鸡群档案成功为前提。关闭详情不触发全模块重载。

## 七、本次实际验证

| 检查 | 结果 |
|---|---|
| 主分支与隔离 | 历次 fetch 得到同一 SHA。在项目内另取该提交的源码，避开当前工作树未合并内容；使用 Node 20 和依赖清单匹配的本地依赖 |
| 前期类型与定向回归 | API、Web 的 `tsc --noEmit --incremental false` 退出 0。原有 PG18 鸡群账测试 52/52、真实 HTTP/JWT/PG 范围与流程测试 13/13、Web 定向测试 12/12 通过。HTTP 测试含同公司其他场、空范围、跨公司、证据归属及制审分离 |
| 前期补充审查场景 | 在仅供本次验证的隔离副本运行。目标舍首报、目标舍补录两项均以期望 0、实得 10 失败；旧待审单可达性以期望可见、实为不可见失败；关群后普通死亡单到已审核、过账被拒的行为已实测 |
| 前期真实浏览器 | Chromium 运行本提交桌面和移动路由，1440px 和 390px 各复现一次切舍残留。登录、角色、页面和舍列表使用隔离夹具，原日报查询注入相同的合成样本；未提交该草稿。两种宽度这一次均无横向溢出 |
| 前一轮 UI/UX 专项 | 再次 fetch 核对相同主线。重跑桌面、手机两条浏览器任务路径，记录 12 舍、40 单场景下的区块距离和焦点结果，见第五节。逐项核对 13 个制单类型、项目模板、现有范例与 SAP/Microsoft 官方指南。本轮改动仅为审查报告，未实现新页面，未将上轮类型或业务回归计为本轮重跑。 |
| 本次独立复核 | 三名子代理分别只读核对现场操作、服务端契约、切换验收；主审回查源码、原用例和运行手册，修订第五、六节。本轮在隔离 PG18 重跑主线 `flock-ledger.pg.spec.ts`，52/52 通过。新增查询、入口、闭锁和回退场景是候选版本的验收项，尚待开发验证。 |
| 验证边界 | 未跑全仓 `pnpm verify`、全量浏览器回归、生产规模压测或现场跟岗。未连接生产数据库、查询客户实账或执行部署。结论用于评审主线设计；实际部署 SHA、地区法规落地、历史群启用和现场操作体验另需相应证据 |

[woah]: https://www.woah.org/fileadmin/Home/eng/Health_standards/tahc/2024/en_chapitre_biosecu_poul_production.htm
[law]: https://nync.yn.gov.cn/html/2022/gongshigonggao_1101/391897.html?cid=3001
[hyline]: https://www.hyline.com/filesimages/Hy-Line-Products/Hy-Line-Product-PDFs/Brown/BRN%20STD%20ENG.pdf
[guide]: https://www.hyline.com/varieties/guide?languageid=3e6be941-6e5a-42f7-9809-09da73b29164&productid=453f0529-af2d-4f2c-8257-b6fe7b491d9f&typeid=3b213ee1-e07a-4485-a539-b8bef7de5694
[admit]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L585
[archivepolicy]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/generic-crud/flock-write-policy.ts#L16
[kinds]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L24
[workflow]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L480
[transfer]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L654
[facts]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/production-report-facts.ts#L1
[care]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L429
[trace]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/traceability/traceability.service.ts#L177
[close]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L687
[turnaround]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-house-turnaround.ts#L69
[first]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle-daily.ts#L43
[supplement]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L339
[rebuild]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L811
[testmove]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-ledger.pg.spec.ts#L425
[mobileloss]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28mobile%29/mobile/mortality/page.tsx#L138
[mobileapi]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/lib/mobile-api.ts#L343
[switchhouse]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L100
[body]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L157
[pickreport]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L220
[queue]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L378
[reports]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L293
[webqueue]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L242
[pcperm]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/breeding/daily/page.tsx#L82
[mobperm]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28mobile%29/mobile/production-reports/page.tsx#L34
[perm]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L54
[pretransfer]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L522
[create]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L228
[closedgate]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L630
[age]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/breeding/flock/page.tsx#L158
[archivesave]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/breeding/flock/page.tsx#L209
[newstatus]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L611
[archiveentry]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/breeding/flock/page.tsx#L358
[nohouseedit]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/generic-crud/flock-write-policy.ts#L64
[refresh]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L145
[blockers]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L408
[controller]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.controller.ts#L7
[loadpage]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L69
[runbook]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/docs/flock-lifecycle-activation-runbook-20261117.md#L22
[pageGuide]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/docs/ui-ux-page-template-guide.md#L22
[frontRules]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/docs/frontend-design-rules.md#L54
[dsRegistry]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/docs/design-system-registry.md#L56
[breedDrawer]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/breeding/FlockBreedConfirmation.tsx#L69
[navAudit]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L186
[currentDetail]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L270
[nativeConfirm]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L123
[rowActions]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L254
[careArea]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/FlockLifecycle.tsx#L263
[storeList]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/store/replenish/page.tsx#L730
[storeModal]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/store/replenish/page.tsx#L971
[dsIndex]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/design-system/index.ts#L27
[tablePage]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/design-system/tables/DataTableV3.tsx#L67
[dsModal]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/design-system/dialogs/ModalV2.tsx#L24
[dsDrawer]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/design-system/drawers/DrawerV2.tsx#L19
[dsConfirm]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/design-system/dialogs/ConfirmDialogV2.tsx#L36
[medicineOwner]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/breeding/medicine/page.tsx#L297
[qualityOwner]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28admin%29/quality/farm/page.tsx#L53
[sapUX]: https://www.sap.com/design-system/fiori-design-web/v1-142/page-types/floorplans/when-to-use-which-floorplan
[msUX]: https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/dialog-form-pattern
[docid]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L258
[readEvidence]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L460
[actionScope]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L498
[breedAction]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L87
[maskBlocker]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-handover-blockers.ts#L76
[henReport]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/farm.service.ts#L695
[baselineWindow]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle-daily.ts#L12
[periodFirst]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/farm.service.ts#L410
[snapcheck]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L303
[periodAuth]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L552
[periodTest]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-ledger.pg.spec.ts#L515
[financeFixture]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/database/migrations/1794902000000-FlockActivitySources.ts#L14
[snapFields]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/api/src/modules/farm/flock-lifecycle.service.ts#L275
[legacyMobile]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/app/%28mobile%29/mobile/mortality/page.tsx#L265
[legacyWorkbench]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/apps/web/src/components/breeding/ProductionInboundWorkbench.tsx#L233
[restoreRun]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/docs/flock-lifecycle-activation-runbook-20261117.md#L56
[i18nGate]: https://github.com/ivanzhao299/phoenix-erp-v3/blob/d7474f0a33fdc08d6d8e7091889c05b2964bd5fd/.github/workflows/ci-security.yml#L74
