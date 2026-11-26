# 库存管理优化方案 · 独立复核修订稿

2026-11-26 ｜ Phoenix ERP V3 ｜ 供仓储、销售、质量、财务和研发审议

**建议批准第一批修复开发和隔离验收。** 保留现有批次、流水和业务单据模型，在现有 Nest 模块内统一关键过账规则。扩仓、历史数据处置及财务计价分别验收。审查基线为远端主分支 22dfbcad84d4ed145a9286a18f1f87d4a923f585（PR #642）。

## 一、复核后改变了哪些决定

| 原方案的不足 | 修订决定 |
|---|---|
| 将标准收货作为兼容接口可直接委托的目标 | 标准收货自身存在零实收回退计划量、持久行覆盖及锁顺序问题。收货升为首批，先修权威命令，再接入旧路由 |
| 建议统一调整实存与可用，未区分正式库存来源 | 普通批次、正式采购/期初、转换/原蛋派生、质量留置分别决定允许的动作。正式批次的盘盈先完成来源证明和复核 |
| 日结只强调仓库范围和预留误计 | 同时解决业务日、截止时点、单位、历史快照及新旧写入互斥。隔离 PostgreSQL 已确认历史查询会读到次日库存 |
| 将桌面差异签收与仓库实存视图列为已有能力 | 桌面签收固定“全收”，当前批次查询排除可用量为零的现存批。需要补录入、权限和读取契约 |
| 召回主要关注 POS 漏批 | 同时校准批次数量、销售订单实际发运、质量页面、遗留 API、分页及不完整提示。保留正式退货的数据库限制 |
| 上线按入口回退、冲正的表述过宽 | 依据业务对象确定唯一写路径。每一类已过账动作分别演练补偿；无法证明可安全补偿时，暂停受影响动作并保留回执 |

**行业判断为部分符合。** 批次库存、按效期选批、调拨在途与收货差异、移动端操作均符合常见设计方向。GS1 的关键追踪事件和数据元素可用于检验蛋品收货、混包和销售去向。Dynamics 365 的盘点任务、移动实盘、差异复核，以及 Odoo 按移除日选批，是工作流参照。到期日、最低剩余货架期、审批容差和跨公司计价仍取决于本企业规则。本文未进行法规或标准认证。[GS1 全球追溯标准](https://ref.gs1.org/standards/global-traceability/) · [Dynamics 365 周期盘点](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/cycle-counting) · [Odoo FEFO 策略](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/removal_strategies/fefo.html)

## 二、优先级、负责人和先后关系

P0 表示扩大相应入口使用前必须验证；P1 表示下一批交付。负责人为建议的业务验收方，研发负责实现、数据库变更与自动化。不同业务链可并行，下面的依赖用于确定放行顺序。

| 工作包 | 优先级与验收方 | 前置与交付边界 |
|---|---|---|
| A 收货与发运 | P0 · 仓储、采购、销售 | 明确整单或分单履约。收发各自有一条权威命令，各入口按持久明细过账，提供可重读回执 |
| B 盘点、报损与留置 | P0 · 仓储、质量 | 明确单位精度和批次来源。收口终端、桌面和通用 CRUD 的状态写入，补审批职责及并发控制 |
| C 日结 | P0 · 仓储、财务 | 先定业务日、范围和事件分类；历史读、快照和写入同批交付。确立旧全局记录与新仓级日结边界 |
| D 效期、召回与质检 | 销售扣减和召回 P0，普通质检处置 P1 · 质量、销售 | 先统一销售扣减及召回事实。首批对质量不能判定的批次设置明确的待核流程，普通复检放行在质量规则批准后实施 |
| E 调拨、查询与作业体验 | 按仓授权和差异签收影响试点时前置，其余 P1 · 仓储 | 同仓实存/可用、双仓角色、签收差异有独立验收。查询聚合可并行建设 |
| F 计价、来源配置与历史治理 | P1 · 财务、主数据及运维 | 扩大调拨计价或来源模式切换前核验成本及权限。历史修正以逐笔证据及签认为前提 |

## 三、业务发现、修改设计与验收样例

### A · 收货和发运应以保存的业务单行为准

**收货。** 兼容确认仅改单头并吞异常，能留下“已完成、无过账”的单据。标准批量确认比较数组长度和 ID 隶属，却未验证 ID 不重不漏，且显式实收 0 会回退为保存的计划数量。单条确认按请求明细循环，批量和单条获取头、行锁的顺序也不同。兼容收货列表已用仓范围，明细还须从同一有权头单进入。固定提交的 Web 中未找到对这条兼容确认路由的直接调用，外部客户端待盘点。[兼容读写](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2448) · [批量合并与零值](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L738) · [单条头锁与过账](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L833) · [持久化明细](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L884)

**改法。** 统一先锁头、再按稳定次序锁行。提交绑定保存的行 ID、单位、品目和仓，明确区分“未填、实收零、全损”；按业务规则决定留待收还是结短收。成功后原子保存实收、破损、库存流水和回执。兼容路由只在满足同一过账条件时适配；无合法明细的旧单进入人工核对。

**发运。** 现场 PDA 丢弃零数量行和未配批行，发运请求没有订单行 ID。订单推进服务锁单头后按来参扣库，没有核对整单应发明细。同状态重试直接返回已发运。其他已具备逐批分配的销售装车链应继续复用。[现场提交](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28terminal%29/terminal/wms/outbound/page.tsx#L127) · [头状态与扣减](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L1398) · [销售装车流水](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/egg-inventory.service.ts#L1302)

**改法。** 默认整单发运，服务端校验每行的应发数、已发数、批次品目、履约仓和单位换算。支持一行多批及同 SKU 多行。整单模式也应保存逐行实际发运和逐批回执；批准分批发运后，再加欠发量和可继续拣货的状态。把业务状态转换限制在允许的前序状态。

**交付验收。** 两行 A、B 分别应收 10，收到两次 A 或显式 B=0 时不会把 B 按计划入账。两个确认入口竞争同单只有一份实物过账；缺单和数据库错误明确失败。两行相同 SKU 各应发 10，仅第一行填 20 不能完成整单；一行 10 分两批 6+4 可以完成。重放同一提交返回原回执，修改数量后复用同键应返回冲突。

### B · 盘点与报损须保留实物、预留、来源和单据证据

**普通批次。** 上轮隔离 PostgreSQL 已确认，实存和可用均为 10 时，PDA 盘至 8 被数量约束拒绝；盘至 12 后实存为 12、可用仍为 10、流水 +2。PDA 同时使用整数读写，结果中允许逐行报错，页面成功分支清空已录行。历史盘点列含整数，后续迁移另加了三位小数列，两套字段需要明确映射。[终端提交与回执](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28terminal%29/terminal/wms/stocktake/page.tsx#L103) · [PDA 入账](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3182) · [数量约束](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1794879957217-InvBatchesIntegrityConstraints.ts#L30) · [盘点数量列](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1787731200000-AlignWmsTransactionForms.ts#L28)

**审批与来源。** 盘点、报损共享单表。服务锁取仓和状态，但接收客户端批次、差额或数量。单据仓和批次仓分别可操作，也不能替代两者一致。桌面以出入库菜单的审批权限显示按钮，API 却以批次菜单编辑权执行。通用 CRUD 对盘点单的改删还需要状态约束。正式采购/期初及受控转换批次有数据库来源数量、正向信用或守恒限制；质量留置另有专项保护。[盘点批准](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3084) · [报损批准](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3303) · [审批权限](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/inventory.controller.ts#L99) · [桌面权限](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/stocktake/page.tsx#L32) · [通用更新](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/generic-crud/generic-crud.controller.ts#L761) · [正式来源守卫](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1794976000000-ProductionCutoverManifests.ts#L398) · [转换守恒](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1795011331222-OfficialInventoryConversions.ts#L492)

**改法。** 实盘结果记录行 ID、批次、仓位、单位、基准数量、版本与提交键。服务器计算差额，提交时检查期间移动与有效预留。普通可售批次在预留不变时保持实存与可用的差额；如实盘低于有效预留，转冲突复核。隔离批不因盘盈增加可售量；正式批正向差额单独证明来源。盘点、报损、日结分别校验单种及状态；已过账记录只读，审批只能按已保存明细进行。确认操作、库存和回执同事务。把字段精度按单位贯穿录入、数据库、展示和导出。

**交付验收。** 覆盖 10→8、10→12、零差、0.125 kg、整枚限制、有预留、冻结及正式来源；实盘后发生销售时不得用旧差额覆盖。零差盘点成功后销售 1，再重放原盘点，库存应保持 9。两行一行失败时，成功行有回执，失败行保留可重试；若产品选整单原子策略则全部回滚并保留输入。审批、编辑和只读三种角色在页面和 API 上结论一致。

### C · 日结应反映指定仓在业务日截止时的实物

当前读取所选日期的流水，却汇总查询时刻的库存；限制仓库的上下文没有应用到四项日结查询。预留与实际发运都是负流水，被重复计为实物出库。提交按服务器当前 UTC 日期、先查后插，用随机单号存入盘点表。页面“锁定当日、生成快照”的文案超出当前落单行为。故障时服务还可把失败聚合转成成功零值。[日结查询](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3231) · [落单](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3277) · [页面日期与提交](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/daily-close/page.tsx#L69) · [页面承诺](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/daily-close/page.tsx#L260) · [流水类型](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/inv-ledger-change-types.ts#L1)

**改法。** 建议将公司、仓和本地业务日组成非空唯一键，前后端同传日期、范围和版本，服务端认定操作者。按单位登记期初、实物入、实物出、调整、冲销和期末。预留/释放单列。分类需按事件和实际写入语义核对；历史不明数量或归属列为待核，禁止默认为零或并入任一仓。在数据库一致性快照内计算并保存核对结果，在同一事务确认日结。流水 ID 为 SERIAL，分配顺序不能代表事务提交顺序。需要与该仓业务日的过账并发协调，或明确把截止时仍在途的事务作为可审计的迟到过账处理。[流水主键](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/migrations/v3_schema_complete.sql#L67) 回看已关日期读快照；财务明确跨日、迟到过账、关账后是否禁止写入，以及需要更正时的授权和版本。

**交付验收。** 期初 100 枚，预留 10、发运 10，当日实物出库应为 10、期末 90；次日入 5 不改变昨日快照。甲仓和乙仓可分别日结，同仓同日并发只有一张原单。并发测试要让先取小 ID 的事务在关账后才提交，而后取大 ID 的事务在关账前先提交；两笔按既定规则各归属一次，快照可重读。同一仓含枚与 kg 时输出两行。限制角色、集团汇总、缺仓历史、跨时区零点、获取数据失败和提交后断线均有明确结果。

### D · 易腐销售与召回要覆盖拣货、实扣和反向查询

**效期与质量。** 共享分配及独立出库的部分按品目分支有日期过滤。仓储指定批次的最终扣减缺少同等效期条件，订单推进的 SKU/商品备选分支也可能仅按到期日排序。专项兽医留置另有数据库保护。普通成品质检 CRUD 和 NCR 建档不等于批次已隔离，通用状态机也没有普通隔离批的放行出边。[共享分配](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/product-master/services/quantity-contract.ts#L102) · [自动选批](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2148) · [备选批次](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2190) · [扣减谓词](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2250) · [成品质检](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/quality/product/page.tsx#L35) · [状态机](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/inventory-status-machine.ts#L52) · [兽医保护](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1795478400000-EggWithdrawalReview.ts#L223)

**改法与验收。** 从单据的真实业务来源决定适销条件。候选和最终扣减共用业务日、效期、留置、渠道和可用量口径；否则可能因最前一批过期而拒绝整单，即使下一批合格。验收手选、扫码、自动跳过过期批、跨日草稿、售出与隔离并发、仍在休药时普通复检通过也不能放行。质量与销售决定最低剩余货架期、缺失效期及既有预留处置。普通质检失败应能建立有凭证的隔离，复检、放行、报废分别留痕并幂等。

**召回事实和读取入口。** POS 按批写分配，但销售行只保留最后批号。统一追溯用该单值和整行数量查去向，且有固定条数上限、异常回空段。销售订单追溯也应区分已预留与实际发运。质量模块已注册的正反向 API 仍读旧 POS 表，部分召回评估取当前可用量。质量桌面正向页经 CRUD 查批次、质检和订单；反向页列库存批次并显示增改删按钮，后端禁止对批次做通用写入。消费者扫码页尝试无凭据请求需要登录及菜单授权的质量正向 API。质量正反向 API 未将已解析的范围用于相应查询，外部客户端调用情况待核。[质量路由](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/quality/quality.controller.ts#L17) · [通用写限制](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/generic-crud/generic-crud.controller.ts#L88) · [门禁上下文](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/org/guards/data-scope.guard.ts#L41) 正式库存已有带归属语义的来源查询，可复用。[POS 分配](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/store-pos/services/store-pos.service.ts#L1060) · [行批号回写](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/store-pos/services/store-pos.service.ts#L1098) · [追溯去向](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/traceability/traceability.service.ts#L213) · [查询异常](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/traceability/traceability.service.ts#L28) · [质量召回判断](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/quality/quality.service.ts#L166) · [正向页](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/quality/forward/page.tsx#L104) · [反向页](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/quality/backward/page.tsx#L13) · [扫码查询](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/trace/%5BbatchNo%5D/page.tsx#L26) · [正式来源归属](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/production-stock-trace.ts#L137)

**改法与验收。** 内部按授权读取“来源/转换→库存批→调拨→逐批发运或 POS 分配→客户/门店→可证退货”。逐边应用公司、仓等范围；未获授权的明细不外露。每条业务行、批次及事件有稳定标识；混批可显示所有来源，无法分摊的数量标“混批/待核”。已售完仍能查到去向。分页返回总量、续页标识和查询完整性，查询失败不得签作“全部查清”。独立决定消费者扫码允许的公开字段。

验收一行 10 枚分 A6、B4，两批各查到同一销售及实际数量；同单两条同量明细不可去重丢失；覆盖 51 笔以上、两父批一输出、调拨后售出及权限边界。退回隔离与仍在外分列。正式 B2B 成功样例使用同公司、原发货仓、LAK 原单及单一已发分配：发 40、退 15，退回明细全部验收合格，回库后仍隔离。正式来源的多已发分配、合格与破损混退、受控来源 POS 退货均保留数据库拒绝。普通 POS 退货按其既有业务类型验收。[转换与退货规则](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1795011331222-OfficialInventoryConversions.ts#L927) · [正式 POS 限制](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1795011331222-OfficialInventoryConversions.ts#L852)

### E · 调拨和日常作业界面

**调拨。** 桌面列表和扫码均固定提交全收，后端支持实收、破损、短少，但差异完结仅检查处理类型和非空单号。源、目标仓本应分别发运和签收；通用列表为受限账号附加单一仓字段，而调拨表和投影使用源仓、目标仓。按提交的迁移结构，受限账号列表有查询失败风险，应在全链迁移库验证。快捷入口和路由的菜单要求也需一致。[桌面签收](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/transfer/page.tsx#L216) · [服务端实收](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2913) · [差异结案](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L3055) · [通用仓过滤](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/generic-crud/generic-crud.controller.ts#L254) · [源、目标仓表结构](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1787731200000-AlignWmsTransactionForms.ts#L10)

**改法与验收。** 源仓看待发，目标仓看待签收，有跨仓职责的主管能查全过程。扫码打开单据、核对实际数量后再确认，提供“全部相符”和“录入差异”两个动作。差异凭证在提交时核验存在性、状态、数量和业务来源；短少已随发运扣除，破损已形成目标库存，结案须避免重复扣减。验收发 10、正常收 7、破损 2、短少 1，及 0.3 kg 拆收 0.1+0.2；数量比较使用定点数。分角色验收列表、详情及动作，权限范围由服务端执行。

| 页面与角色 | 当前断点 | 修改与可检查的结果 |
|---|---|---|
| 仓库查询 · 仓管/主管 | 默认列表只取可用量为正的最新 200 批；搜索在客户端，404 才回退。全预留批虽有实物却消失 | 服务端按批号、品目、仓、状态检索及稳定分页。展示实存、有效预留、隔离/冻结与可用。按单位汇总且避免重复归类。实存 10、全预留、可用 0 仍可查；第 201 批能按码直达。[查询页](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/query/page.tsx#L36) · [服务范围和限制](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2365) |
| 仓库看板 · 主管 | 只取入/出各 200 单、批次 500 条。“可用库存批次”直接数样本行，“本月汇总”和“今日动态”也未按标题过滤 | 在后端按仓、业务日、单据状态和单位统计，卡片与下钻共用条件。使用跨月记录、取消/草稿单和第 501 批核对；失败、无权限、真零分别展示。[看板取数](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/page.tsx#L142) · [动态与汇总](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/page.tsx#L177) |
| 临期工作队列 · 仓管/质量 | 在受限批次集内筛未来 14 天，数量固定标“枚”。“安排出库”的请求缺业务类型、有效去向类型及仓；创建草稿后界面还会移除告警 | 按效期在服务端分页；从预警带批次、仓、可处理量和单位进入标准草稿，显示关联单进度。未发运仍能看到待处置，已过期另列。验证 kg、仅查看账号、重复安排及真正处置后的结果。[临期动作](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/expiry/page.tsx#L73) · [单位显示](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/expiry/page.tsx#L216) · [出库政策](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms-outbound-policy.ts#L252) |
| 库存分析与销售可售 · 主管/销售 | 分析已有服务端全量聚合，但混用原始数量和 kg、效期字段拼写、按 SKU 文本猜等级。销售摘要与明细对旧来源、类别及农口仓的筛选不同 | 复用过滤器，按实际单位及标准等级聚合；定义销售适售与仓库实存各自的分母和数据权限。不能安全换算时分单位列示。验收相同维度下明细合计=摘要，并核对仓储角色进入销售视图的授权边界。[分析汇总](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2382) · [销售明细](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/egg-inventory.service.ts#L762) · [销售统计](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/egg-inventory.service.ts#L1904) |
| 日常作业工作台 · 各岗位 | 盘点列表和导出共用盘点表，易混入报损、日结。调拨待签收及月完成数为占位。PDA 需要逐行回执 | 桌面保留建草稿、确认、复核分工；现场只显示本岗位待办及可执行动作。按单种筛选列表、KPI、导出；从差异或异常行回到原任务。按角色检查侧栏、快捷入口、扫描和服务端权限。[盘点列表](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/stocktake/page.tsx#L343) · [调拨指标](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/web/src/app/%28admin%29/warehouse/transfer/page.tsx#L259) |

### F · 调拨成本和来源配置

两种调拨路径均要核验发运快照、正常子批和破损子批的成本传递。批次成本默认零，正式派生资格还可能默认为 UNKNOWN，补上子批单价也不代表成本已经核定。同公司同币种传递发运时已知成本、精度、核定状态及证据；未知保持待核。跨公司尤其涉及正式加工来源时，保留独立接收及来源资格限制，再由财务确定币种、汇率和计价。验收在途、正常、破损、短少及其单独入账后数量与价值都能解释。[即时调拨子批](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2680) · [发运快照](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2837) · [签收子批](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L2938) · [跨公司与资格](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/derived-inventory-qualification.ts#L68) · [估值待核](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/official-inventory.ts#L27)

来源模式是治理配置。列表、评估和切换需明确由集团统一管控还是授予特定公司/场区。当前配置和审计是两次独立写入；配置已生效而审计失败时，应有可恢复的回执。建议由同一事务锁定目标配置、核对批准风险快照、切换且记审计。没有已签认的现场前置条件时，停止在只读对照阶段。验收审计保存失败、并发切换和重试，确认配置与回执一致。[配置读取](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/inventory-source-mode.service.ts#L120) · [配置与审计写入](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/inventory-source-mode.service.ts#L252)

## 四、后端契约与兼容过渡

| 边界 | 建议由谁负责 | 接口验收 |
|---|---|---|
| 库存写入 | WMS 管实物变化、批次和流水；采购/销售管来源单及履约；质量管处置决定；财务管估值。保留模块化单体和共享流水写入器 | 每种业务动作只有一个过账实现。请求带来源单、行 ID、期望版本、提交键；授权仓、操作人、实物量、可用量和流水由服务端核定。单据、库存、流水、回执同一事务提交。[共享流水写入器](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/inventory-ledger.writer.ts#L153) |
| 可重试命令 | 在首次提交前由客户端生成稳定提交键。服务端绑定授权范围、业务对象及内容摘要，并支持按对象读回执 | 同键同内容返回原结果；同键不同内容或过时版本返回冲突。相同业务事实通过不同入口也不能重复过账。断线后先读回执；库存改动成功但响应丢失属于正常演练。[已有回执参考](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/sales-v2/services/production-inbound-documents.service.ts#L670) |
| 查询和授权 | 服务端统一构造仓范围、期间、状态、单位及资格条件。授权解析、菜单动作权限和数据行过滤分别核查 | 分页列表、聚合、导出、明细使用同一数据定义。销售可售、现场可拣货、仓库实存与财务估值分视角提供。错误有明确响应，受限账号不显示越权数据。[范围 Guard](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/org/guards/data-scope.guard.ts#L41) |
| 持久化和迁移 | 先对照实体、两份冻结基线、TS 迁移末态和写入路径，明确精度、唯一键、时间和归属。新增 schema 在 TypeORM TS 迁移中带 down | 演练新旧读写共存、具有旧整数列或缺来源资料的历史单，以及完整迁移库上的立即和延迟约束。生产数据修正独立 dry-run、签认、复核。 |

### 11 月 17 日方案承接

| 状态 | 事项及本轮处理 |
|---|---|
| 已交付并复用 | 手工无归属预占入口已移除；流水门店列、明细旧来源/重复过滤、共享流水写入、状态机、FIFO 锁、变动类型字典、蛋品批次成本和估值已有实现。旧采购收货路由已返回 410。旧余额 provider 有注册，在非测试业务模块中未检出调用；不计作现行第二套过账系统。[上期交付](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/docs/inv-opt-execution-report-20261117.md#L21) · [旧采购确认](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/procurement/procurement.controller.ts#L77) |
| 已加基础控制，仍需验收 | 数量 CHECK 和流水 FK 以 NOT VALID 加入，线上历史存量验证状态未知。部分查询已有错误日志，前端仍会收到成功空集。FIFO 同仓并发 PG 用例有开关，实施阶段应输出实际运行和跳过数。已有只读预检可发现负数、超可用和孤儿流水，需要补预留对账等业务差异。[完整性迁移](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/database/migrations/1794879957217-InvBatchesIntegrityConstraints.ts#L28) · [现有预检](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/scripts/check-inv-batches-invariants.sql#L24) · [并发测试开关](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/inventory-fifo-lock.pg.integration.spec.ts#L13) |
| 按业务范围承接 | g15 仓映射、O1 现场演练及 issue532 回填由对应运营范围提供证据，扩点前验收；冻结审批、标签与 QR、itemCode 收口、生产成本/COGS/月结留给质量、主数据及财务专项。当前其他仓的 P0 修复可独立开发。成本试点不外推为所有品类已核价。[历史待办](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/docs/inv-opt-execution-report-20261117.md#L64) · [现场依赖](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/docs/inv-opt-next-steps-handoff-20261117.md#L175) |

## 五、发布、历史核对和停止条件

1. **先建相同基线和事实清单。** 在隔离环境使用候选提交和完整迁移链。业务方确认仓映射、操作角色和业务日。按公司、仓、批、原单行、单位只读列出已发但明细不足、已完成无入库流水、盘存与有效预留不符、历史全局日结、成本待核及缺少谱系的单据。区分可证事实、原始资料缺失、需人工核对；历史全局日结保留原记录，不推造仓级历史快照。
2. **并行开发，按依赖验收。** A/B/C 和 D 的只读追溯、效期规则可并行；C 先交付事件映射和快照。试点前查清兼容收货客户端，关闭或适配影响同一单据的旧写入口；仓级日结与旧全局提交互斥。调拨受限角色列表、差异签收或成本处理若为试点必需，随试点提前交付。
3. **先做影子核对，再单仓启用唯一写路径。** 读侧并行比较新旧结果，逐笔解释口径差异。写侧只有一方提交。仓储、质量、销售和财务按工作包核对单据、逐批流水、回执、实存和待办。覆盖至少一个完整业务日及一次真实设备的收发盘流程，保留提交 SHA、迁移版本、角色、请求标识和结果。
4. **停止和恢复。** 发现越仓、缺行仍发运、重复实物移动、账量不守恒、召回漏批或历史快照漂移时，暂停该仓相关命令并保留待办和回执；已验证的只读查询继续服务。对已提交的业务分别操作：查原回执、确认真实物动、按该单种支持的冲正/退货/调整处理。无法安全自动补偿的单据由仓储、质量或财务签认后处置。切回 UI 或代码无法撤销既有库存移动。[已有专项冲正示例](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/apps/api/src/modules/wms/wms.service.ts#L202)
5. **扩大范围。** 建议放行条件是本方案 P0 场景实际执行，批次、单行、仓和单位四个维度差异均已解释，阻断级异常为零，重试和恢复演练通过。读侧只可切至已验证具有相同授权、历史快照和错误语义的实现。没有等价实现时暂停该查询。写入回退需先验证新字段、旧消费者及原回执可读，且相关旧入口不会造成重复过账。跨公司或正式受控域单独签认。

**审查会需决定的业务规则。** 仓储与销售确定整单/分批履约、谁接手欠发；仓储与财务确定业务日时区、迟到过账、重开、差异容差及跨公司计价；质量确定普通批隔离/放行、已预留批、有效期边界与召回待核处置；集团决定来源模式和跨仓召回的授权粒度。无决定时，候选实现按整单、明确仓域和可证来源保守验收，保留需复核的任务。

## 六、验证记录

| 证据层次 | 执行与结果 | 能支持的判断 |
|---|---|---|
| 本轮独立审查 | 四位新审查者分别复核事务与数据库约束、质量召回、页面/权限及上线治理；四份结论均返回。主代理复查争议路径、行业资料与远端主分支 | 方案中的范围、依赖和验收条件已修订。源码推导不代表现场已发生或已修复 |
| 本轮日结实测 | 在临时 PostgreSQL 18.6 调固定提交的 getDailyCloseSummary。单仓同批写入预留 −10、发运 −10，返回出库 20。次日入库 +5 后重查前一天，库存由 90 变成 95 | 两个会计口径反例在服务层成立。最小测试表把正式库存资格函数固定为允许，只验证聚合与历史读取；跨仓授权和正式资格须在完整迁移库另验 |
| 本轮临期契约与工程检查 | 固定提交的真实出库政策函数拒绝当前临期请求的缺类型形态。该项与日结用例合计 2 项通过。API、Web 的 tsc --noEmit 均通过，WMS 写入范围静态门禁通过 | 门禁只检查列出的写入代码片段。临期验证是函数级，未操作真实仓库单据。[静态范围门禁](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/scripts/ci/check-wms-datascope-writes.mjs#L5) |
| 上轮同一提交实测 | 隔离 PG 确认 PDA 盘亏回滚、盘盈遗漏可用量；API 定向 6 套 87 项、Web 定向 6 套 32 项、模拟 API 的 Chromium 出库场景 4 项通过 | 这些通过数沿用上轮记录。本轮未复跑这些套件。上轮开发服务出现路由初始化异常，虽未影响四项断言，仍待定位 |
| 实施后验收 | 项目已有 verify:changed、约束漂移检查，以及部分真实 PG 回归。另需完整迁移 PG 测试、两仓多角色 HTTP、真实前后端联调和现场设备演练。记录实际执行、跳过和失败数，逐工作包签认 | 这组为拟增放行条件。全量 CI、生产部署、历史账差笔数、外部客户端清单及现场账号权限本轮均未核验。[工程基线](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/package.json#L28) · [真实 PG 回归](https://github.com/ivanzhao299/phoenix-erp-v3/blob/22dfbcad84d4ed145a9286a18f1f87d4a923f585/.github/workflows/regression.yml#L206) |

## 七、实施候选与放行记录

实施基线为 `origin/main` 的 `22dfbcad84d4ed145a9286a18f1f87d4a923f585`。开发分支为 `codex/inventory-management-implementation`。收发、盘点、日结、质量追溯、调拨与查询分别完成独立源码审查，候选再由另一位审查者复核关键事务、权限和兼容入口。

| 工作包 | 已纳入候选 | 现场仍需核对 |
|---|---|---|
| 收货与发运 | 收货按保存行核对，双入口共享事务和逐行流水回执。PDA 发运改用 Sales V2 配送单的真实分配，已实发订单禁止直接撤单 | 逐台确认旧订单号、现场扫码格式和外部收货客户端。确认整单范围、欠发转交和短收结单规则 |
| 盘点与报损 | 保留三位小数、实物与可用量、当前版本和提交回执，审批读取保存的单据。旧版日志同步入口返回 410 | 核对已有未审批单据刷新流程和正式库存的盘盈来源证据 |
| 日结 | 按公司、业务仓和营业日封存快照。预留、实物移动和更正分开。默认需仓级启用记录，旧伪确认入口返回 410 | 核对同仓截止、跨仓同事务、未归属仓流水的处理。批准试点首个营业日、时区、迟到过账和重开规则 |
| 效期与质量 | 效期取真实库存单位与标准出库草稿。质量工作台读取已核实的配送、POS 分配、返回数量与可见批次谱系 | 按单和批抽查普通及混合来源，核对旧资料缺口、隔离与放行职责。召回决策需要回收记录和人工核查 |
| 调拨与价值 | 源仓发运、目标仓收货分权，精确校验实收与破损。即时调拨要求稳定单号并保存原回执，同单须使用同一库存单位。破损留存结案核对原批和入库流水，手续本身不再扣减库存。缺乏计价证据的费用保留待核 | 财务确认在途短少、证据缺失以及跨公司币种与计价规则。原采购批首次在目标仓事务中取得正式来源资格时，验收能否在同次调拨确认成本。现场用真实单号核对正常、破损和短少数量 |
| 来源模式 | 集团范围管理，风险快照与切换审计同事务，旧版本拒绝切换并可重读原回执 | 签认适用场区和切换前置证据，验证配置对日产蛋、包装和正式库存的影响 |

### 候选阶段的兼容与回退

旧接口 `POST /api/inventory/sync-pda`、`POST /api/dailyClose/submit` 和旧订单推进接口返回 410。上线前按设备版本和外部调用方确认升级。旧 PDA 库存与盘点查询继续使用原 URL，并校验仓库授权。即时调拨调用须提交稳定单号，已成功且输入相同可查原回执。库存来源切换客户端须提交风险版本和申请标识。

冷库需要创建仓库收货明细表。已有整数数量列的环境升级时会拓宽到 numeric。放行前应核对目标环境表的实际约束、规模及迁移锁时长。回退保留已产生的实物流水和业务回执，通过对应作业的受控冲正处理。仅在候选环境验证迁移脚本，不在应用启动时执行生产迁移。

生产放行沿用第五节。仓级日结启用前核对影子结果和未归属仓流水。复核真实的双仓角色与设备，在试点仓走完整业务日，保留审签回执。待确认的试点公司、仓库、窗口和业务规则应随部署审批作为证据留存。

触及冻结和安全范围的代码需由有权限的维护者核准最终提交，并在 PR 登记仓库既有审查标签。生产 CI 和现场试点分别留存验证证据。
