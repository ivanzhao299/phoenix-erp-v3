# 主数据治理阶段 5：包装计量、共享实物库存与产品/物料边界

日期：2026-11-10。基线为阶段 4 `26487279e8530b461e0e365909ade0d9af0ea4f1`，分支 `codex/master-data-governance-20261110`。只在指定隔离工作树开发和验证；不连接生产、不回填历史业务、不合并档案、不推送或部署。协调矩阵由主协调维护，本报告不改写该文件。

## 1. 业务确认与最终模型

用户确认：**30 枚/托和 360 枚/箱是同一商品的单位换算；报价按所选规格分别维护每托价、每箱价。** 新建价格和销售界面默认 PACKAGE。现存无计量记录的价格不会被自动解释为每枚价或每箱价。

- 产品/SPU 是商品主体，`mst_products.unit_zh` 是现有 Runtime 对外维护的基本单位；仅为空时回退历史 `unit`，与已有 ProductPolicy 顺序一致。二者及规格基本单位差异列入只读预检，不能据当前主档反推旧批次单位。
- SKU 继续是产品、等级、销售规格的身份及价格/历史追溯键。托、箱本身不强制形成互斥库存池，不删 SKU 中心，不改旧 SKU 编码。真正不同产品、标准等级或基本单位不会混池。
- `packaging_specs.qty_per_unit/base_unit/display_unit` 是服务端换算依据；已修正规格中心原先使用的无效 `unit_count/pack_type` 字段。产品/SKU 界面说明基本库存与销售规格关系。
- 新交易显式指定 `quantityBasis=BASE/PACKAGE`。服务端生成 `quantity_snapshot`：版本、产品/等级/SKU/规格、基本/交易单位、交易倍率、主档包装倍率及基础数量。客户端不能指定可信倍率或快照。
- 交易数量/分配链按最窄的两位小数限制；“枚”基础量必须整数；拒绝 NaN、Infinity、非正数、单位不匹配和存储精度溢出，不使用 Math.round 吞掉半枚。非蛋物料保持其自身单位，未套用 30/360。
- 新生产及带明确计量的 WMS 入库才生成 `inv_batches.base_quantity_version=1`。共享池同时要求该标记、批次保存的产品/标准等级/单位、公司、明确授权仓库、AVAILABLE、未过期、无 legacy_source/物料编码。**只有单位/等级看似相同的旧批次也不能自动入池。**

计量原则参考 [SAP Units of Measure](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/b2dee5e83e2446149294f9860a7c08f0/2283c4530b29b44ce10000000a174cb4.html?locale=en)（主协调核验；本执行会话链接可打开但正文未返回）和 [Microsoft Dynamics 365 按产品变体换算单位](https://learn.microsoft.com/en-us/dynamics365/supply-chain/pim/uom-conversion-per-product-variant)（本执行会话读取到按 Pieces 库存、Boxes 销售及变体换算的官方示例）。它们支持基本库存量与销售单位分离，不构成删除历史 SKU 或按同名合并物料的依据。

## 2. 价格、金额与数量各自的职责

`sal_price_items.quantity_snapshot` 保存每一个报价单位所含基础量；价格、底价、最高价和 min/max 数量阶梯使用该报价单位。默认每个销售 SKU 分别维护 PACKAGE 价格；仍支持业务明确配置的 BASE 价格及有证据的比例转换。显式请求先把交易基础量除以报价倍率匹配阶梯，再把报价按交易倍率/报价倍率换成交易单价。PACKAGE 报价的规格倍率后来变化时，新交易拒绝并提示重新维护报价；已开单支付、出库和退货仍用原快照。

旧无 quantityBasis 请求只能沿用原无单位价格或明确 BASE 价格，不能直接命中 PACKAGE 价格。若匹配范围已有明确单位报价而旧调用无法表达单位，resolve/validate/create/update 均明确拒绝，不吞成 0 价；包括没有 SKU、按产品/等级/规格查价的旧调用。

销售行继续按 `qty × 交易单价` 得到金额，库存只用快照 baseQty。旧数值价格列保持原精度，新 `sal_order_items.price_snapshot` 保存精确成交/解析单价、价带、行金额及引用；退款以原行金额比例核算，因此旧 NUMERIC(18,2) 将微小基础单价舍入为 0 也不丢掉原行 1.00 金额。POS 主单合计以逐行舍入金额求和，与明细守恒。

两端新 POS 对未确认价格单位、无 SKU、无效/不一致换算商品明确禁售并提示维护价格；旧购物车缺确认信息也不能直接结账。新商品带交易单位、每托/箱基础量。更换报价 SKU 会清空旧单价/价带/阶梯；销售价格预览使用最新选中行及 SKU，避免旧闭包和迟到响应套入旧价，自动参考价不作为人工改价回传。

## 3. 实际调用链与用量矩阵

| 路径 | 交易/库存规则与证据 |
| --- | --- |
| 销售 createDraft / updateDraft | 原事务内校验 SKU、主档并保存数量/精确价格快照；未验证成功不删旧行。已有明确计量草稿不允许旧客户端在重建明细时丢掉单位。显式重新保存草稿是重新确认当前主档，批准后的扣账不再重取倍率 |
| 审批 → reserveInventory → allocateByFIFO | 使用 savedQuantity/baseQty；按同产品+标准等级+基本单位从多来源规格批次 FIFO 预占，保留每条 allocation 的来源 batch/SKU/数量 |
| 配送 create / load / depart | 订单总量、planned_qty、allocation.outbound_qty、部分出库及完成判定统一基础量。新已知单位计划拒绝不同基本单位或混入未知历史单位；前端数量/签收显示基础量 |
| 销售取消 → releaseInventory | 只释放 reserved−outbound−released；部分配送不恢复已出库量；原事务、条件余额、重试保护保留；无 mgr 的直接调用也包事务 |
| POS create → cash/credit/mixed payment | 保存数量/价格快照；原支付行锁、幂等键、班次、现金和 AR 流程保留。支付按保存数量扣 qty 与 qty_available，流水记录实际来源批次 SKU，销售行 SKU 保留销售规格 |
| POS void/refund | 现有整单反向，按原 allocations 恢复到隔离批次，传播来源产品/SKU/等级/规格/基本单位/计量版本及日期；无 allocation 历史单仍拒绝自动退款。没有在本阶段新建 POS 部分退款功能 |
| 原单销售退货 create → inspection → restock | 必须关联订单及原行，继承产品、成交价及原行金额，忽略客户端箱价。returned/accepted/damaged 都存基础量；原行锁串行检查累计退货不超过已出库分配。质检再锁原行，用累计合格基础量的应退总额减已分配退款，分配到分的尾差，避免180次小额退货超退 |
| 原单退货回库 | 合格基础量进入 QUARANTINE、qty_available=0；保存原 SKU 来源，实际降级标准等级独立写入，不被来源 SKU 覆盖。破损量按原有损耗路径记录，不成为可售库存 |
| WMS 独立/批量出库 | 新界面基础单位录入并显式 BASE；也接受专用接口明确 PACKAGE。保存计量，确认按基础量扣减；定批次必须核对实物池，非定批次走同一共享查询。批量全单先稳定排序池锁，逐行稳定处理 |
| WMS 入库 | 专用批量创建保存每行计量，确认按持久化 id 或唯一匹配查原行；同 SKU 多种计量没有 id 时拒绝，不能取第一行。actual_qty 保留交易量，库存写基础量；任何已有普通/破损批次均核对域、编码、单位、仓库，拒绝跨域累加 |
| WMS 调拨 | 按指定来源批次基础量，保留行锁/条件余额；两种调拨路径传播标准等级、规格、单位、计量可信版本、蛋日期/到期日、legacy_source、包装和集蛋引用。不会为未知旧源批次补可信标记 |
| 包装/生产 | 包装原来已按 boxes×qty_per_unit 形成基础枚量；新生产批次验证 ACTIVE 产品、等级与规格单位，保存单位和新计量版本，不重乘历史数量，不四舍五入基础枚 |

共享池 advisory 锁统一为公司+**单仓**+产品+标准等级+基本单位，先收集全单所有键去重排序。仓库集合 {A,B}/{B,C} 会共享 B 的锁；新路径不再同时套旧 SKU 锁，避免锁序反转。FOR UPDATE 和条件余额检查仍保留。旧 exact-SKU / product-grade 路径与固定批次调拨保留行锁及条件检查；不能据旧锁名不同就断言历史必然超卖。

新共享路径校验交易所选 SKU/产品/等级的当前可用性及批次实物身份/状态/保质；批次来源 SKU/规格停售不会自动阻断另一个在售规格取同池货。旧 exact-SKU 路径仍保留阶段 3 的原来源校验。调拨沿用既有 stock 可用性规则，不改写来源身份。

## 4. 兼容与失败边界

| 数据/调用 | 行为 |
| --- | --- |
| 旧单据 quantity_snapshot SQL NULL、旧客户端省略 basis | 保持原 qty 的既有扣量算法，不盲乘30/360；原数量单位没有证据时 UI 明示未记录 |
| 新显式 BASE | factor=1，单位来自真实主档；库存基础量与交易量一致 |
| 新显式 PACKAGE | factor 来自保存时主档；1托30、1箱360按配置换算，后改倍率不影响既有支付/预占/退款 |
| 非 NULL 的 false/0/空串/数组/坏对象 | 不能当旧单据；结构 CHECK + 服务端严格版本、字段、数值、精度/等式校验，明确拒绝 |
| 旧价格无单位 | 不回填；新 POS 禁售，价格册非 ACTIVE 时人工确认所选 SKU 的 PACKAGE 单位、价格与阶梯，再按原发布流程启用 |
| 旧库存无计量版本/单位/等级 | 不入新共享池；只读列为待治理，不按当前可变 SKU 推断 |
| 无原单退货 | 显式基础量兼容，不按当前包装倍率猜换算；回库缺可靠原单位时保持未知，不纳共享池 |
| 仅填写原订单号、无订单/行关联 | 明确拒绝；新退货界面可按完整订单号载入受权限保护的真实原单行与成交金额 |
| 同码 MATERIAL/SKU | 明确类型时分别解析；无类型且多域命中拒绝。选择器内部使用 type:code 复合身份，对 API 仍分开返回 type 与裸 code |
| 元数据/引用/主档查询失败 | 对本阶段的新计量、产品/物料归档失败拒绝；不吞成零引用或可信倍率 |

通用 CRUD 读继续保留；controller/service 双层禁止 wms_inbound_items、wms_outbound_items、inv_batches、inv_ledger 全部 CUD（包括管理员与只改普通字段/DELETE），库存事实及计量证据只能经专用业务事务。另禁止通用写 quantity_snapshot、base_quantity_version、price_snapshot、valuation_snapshot。SKU 身份保护也扫描新数量快照中的精确 SKU 引用。

## 5. 产品/物料治理

物料是采购耗材角色，产品/SKU 是商品/规格角色。没有可靠统一身份依据，不建立跨域共享库存，不因名称相同合并。当前材料主档没有可靠的 material barcode 或跨域对照表，名称+规格+单位只是候选证据。

交付 `scripts/audit-product-material-identity.sql`，BEGIN READ ONLY/ROLLBACK：输出规范化同名候选、双方角色/编码/名称/规格/单位、采购申请/订单/收货/批次引用，以及待确认 WMS 多态引用、同码歧义、旧库存计量、旧价格和主档单位差异。已在临时夹具执行验证只读与 SQL；**未扫描生产，因此无生产候选数量结论。**

MATERIAL 归档补采购申请/订单/收货 item_code、库存 material_code/流水、出库物料、待入库头/明细及出库明细引用。PRODUCT 补直接业务/库存/WMS 头行、包装 JSON 的精确 productCode/product_code 引用。多态旧列同码命中保守阻断，不能把这种统计宣称为已证明物料身份。归档同事务锁主档、NOWAIT 锁引用表、严格查询、状态与审计同提交；忙锁/查询失败不会放行。其他主数据沿用原生命周期。

采购请求/订单原本按材料主档显示；收货详情现同样用 mst_materials（保留现有 sku_name 响应别名供旧 UI），同码 SKU 歧义时不自动补另一域名称，保留原行名称快照。

## 6. 迁移与上线前只读检查

新增 `apps/api/src/database/migrations/1794268800000-PackageQuantitySnapshots.ts`，schema-only、up/down 幂等，无业务 DML、无历史自动修复。数量 JSON 列用于销售/POS/退货/价格和 WMS 独立出库/出入库明细；另加销售精确价格、退货原行金额快照及批次基础计量版本。没有新增装饰式 entity 字段，也未修改冻结 SQL 或 lint baseline。

受控上线前必须逐项复核：

1. 在已授权数据源只读执行候选/单位/旧批次/旧价格审计；核对产品 unit_zh、规格 base_unit 与真实业务单位，逐行确认托/箱报价，不批量按猜测改写。
2. 核对待出库/预占/在途/退货历史单，尤其无 allocation、旧多态编码与混合单位；新旧客户端能力和启用范围应同时审阅。
3. 新功能只使用新可信批次；若需要纳入旧库存，必须另行凭包装/生产凭证证明基础量，并经用户授权设计独立治理方案。本阶段没有这种回填脚本。
4. 受控部署执行 TS schema migration 后才启用新代码/界面，验证列/约束/运行角色权限、锁等待及实际 UAT。生产迁移不加入 verify，不由本会话执行。
5. **一旦产生新的 PACKAGE 单据，不能直接回滚旧代码或执行 down 删除快照。** down 只证明空/可丢弃夹具上的可逆 DDL；真实回滚须先保全并处理新交易语义，由受控方案执行。

## 7. 实际验证与限制

环境 Node 20.20.2 / pnpm 9，使用现成依赖；没有改共享 node_modules 或版本声明。

- API 回归覆盖阶段1–4 SKU/权限/管理、销售、配送、库存、包装、生产、物料引用、通用旁路及 POS 幂等/原子性；最终计数见本报告末尾验证记录。
- Web 行为覆盖计量单位展示、未确认选择、同码两域选择、每规格更换报价清值，以及阶段4产品/SKU关联与主数据选择器；未删除既有回归。
- `scripts/test-package-quantity-pg.sh` 仅创建本地 postgres:18-alpine 临时容器，127.0.0.1随机端口、tmpfs、固定空库名和随机归属标记，测试入口拒绝非该夹具；结束自动停止并移除。真实服务/SQL覆盖预占、出库、取消、POS基础扣账/来源退款、WMS竞争/入库/调拨、原单退货/金额尾差、旧兼容、引用失败、归档和迁移 up/down。夹具交易价格采用真实 NUMERIC(18,2)，库存 NUMERIC(14,3)，未放宽精度掩盖舍入。
- PG金融部分验证销售原行金额/退款分摊及实际库存 SQL；现金、AR完整财务集成与支付重试由既有服务替身回归覆盖，不能把它写成整个 HTTP→真实财务库端到端验证。
- 实际运行 API/Web tsc、修改文件 API lint、Web changed/ratchet、迁移 down/no-business-DML、约束漂移和 nullable unique 门禁、字段审计与 git diff --check。无降低规则、suppression 或 baseline 更新。
- 未执行全量 API/Web 测试、完整构建、浏览器人工 UAT、依赖运行 API/账号的全站 scope-audit.sh、完整迁移链重建/生产实体对账、生产数据/性能/部署验证。新接口公司/仓库矩阵由行为测试与真实 PG 候选隔离核验，不冒充全站 scope-audit。

## 8. 八题答复

1. **托/箱是否另一个制造产品或独立库存？** 不是仅因包装不同；保留销售 SKU，可信实物按产品+标准等级+基础单位共池，公司/仓库/质量/批次边界不变。
2. **是否删除或合并历史 SKU/批次？** 没有。原 SKU、规格、来源 batch/包装/集蛋证据继续保留。
3. **1托/1箱如何扣量？** 显式 PACKAGE、服务端读取真实30/360，保存快照，后续库存只按30/360基础量操作。
4. **价格如何维护？** 按用户确认每托/每箱分别维护，默认 PACKAGE；价带与阶梯同单位，未确认旧价不自动改释，新 POS 禁售待确认行。
5. **规格后来变化会改旧单吗？** 不会重算旧支付/预占/退货；新 PACKAGE 报价倍率过期需重新维护；旧客户端不能删除新草稿计量。
6. **如何防超卖、多退和金额超退？** 单仓实物池稳定锁序+行锁/条件余额；原行锁限制已出库基础量；退款按原行金额累计比例差额分配尾差，真实 PG 覆盖竞争和180次退款。
7. **同名产品/物料可自动合并吗？** 不可。只交付可审阅候选与引用证据；同码明确类型，歧义拒绝；采购/WMS引用或查询失败阻断归档。
8. **能否直接宣布生产完成？** 不能。本阶段实现、本地验证与本地提交完成；历史价格/库存逐行确认、运行角色/性能、人工 UAT 和受控上线仍待执行，不把未连接生产伪报为通过。

## 9. 最终验证记录

（提交前以实际命令结果更新，不将失败初轮或未执行项写为 PASS。）

| 检查 | 最终实际结果 / 证据（tmp 不提交） |
| --- | --- |
| API Jest | **20 suites，441/441 通过**，退出0；`tmp/phase5-final-jest.json`，含阶段1–4回归、POS支付重试/失败原子性、公司/仓库拒绝及新通用CUD保护 |
| Web Vitest | **5 files，50/50 通过**，退出0；`tmp/phase5-web-tests.json`，含每规格报价清空、计量选择/显示、同码类型区分及产品/SKU旧回归 |
| 真实 PostgreSQL 18 | **20/20 通过**，退出0；`tmp/phase5-pg.json`；包括真实 create/update→18,2 单价舍入→按原行1.00退款、180次部分退款累计1.00、并发双退仅一单占额度、确定性库存不足完全回滚、跨公司/仓库/等级/产品/单位候选隔离。临时容器已停止自动移除 |
| API / Web tsc | 两者 **退出0，0 errors**；现有 CLI `--noEmit --incremental false`；`tmp/phase5-api-tsc.log`、`tmp/phase5-web-tsc.log` |
| API 修改文件 lint | **31 TS files，0 errors / 510 warnings，退出0**；包括既有 any 与测试替身，未降规则；`tmp/phase5-api-lint.json` |
| Web changed | **PASS，134 errors / 31 warnings**，相对阶段4 HEAD 的修改文件无债务增长，新文件零错误；`tmp/phase5-web-changed.log` |
| Web ratchet | **PASS，822 errors / 472 warnings / 197 error files**；未更新baseline；`tmp/phase5-web-ratchet.log` |
| 约束漂移 | **0新增 / 0 warnings**；195冻结SQL、93TS、231表、512字面/null写值、60 DTO枚举、1505 entity列；**13个动态migration SQL跳过静态解析**，本次动态DDL由上面的PG执行补证；`tmp/phase5-constraint.log` |
| nullable unique / migration down / no-data-DML | 全部退出0；0违规（1既有白名单），93条down通过，93条DML检查通过（39既有豁免，本次无业务DML/豁免） |
| scope与字段审计 | 实际行为测试及PG隔离如上；8文件窄式扫描，身份input命中 orders=2、pricing=1、returns=1、其余0，裸身份onChange窄式均0。逐项核对订单/退货命中为readonly带出；价格页旧产品回退字段在选SKU时disabled，明确新计量报价保存强制SKU。不是用空正则冒充全站PASS；`tmp/phase5-field-audit.json` |
| 独立复核 / diff | 只读scout物料审计和reviewer两轮数量/金额/SQL审查，已修复其退货精度、来源SKU停售、表列名、报价/金额合计、跨域批次累加等发现；主协调另独立核验核心边界。`git diff --check`、staged diff检查通过 |

现有按SKU筛选的库存读取仍可表示**来源SKU台账视图**；实际新交易供货按本报告共享池执行，不能把来源SKU余额直接标成另一个规格的包数。本阶段没有把所有BI/历史库存报表重写为可售包数。

提交共 **54文件**：API 31（共享计量契约/测试/PG夹具、TS迁移、销售/配送/退货/价格/库存/POS/WMS及主数据/通用保护），Web 20（计量与报价辅助、两端POS、销售/配送/退货/WMS、产品/规格/SKU说明和回归），两个只读审计/临时PG脚本、本报告。仅显式stage本阶段清单；不包含协调报告、依赖链接、临时输出、冻结迁移或其他改动。提交名 `fix: unify package quantity and inventory identity`。未push、未部署、未运行生产迁移，不打额外历史tag。
