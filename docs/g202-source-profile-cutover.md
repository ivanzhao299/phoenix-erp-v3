# 多公司 SKU 来源档案与受控切换（发布前验收）

## 1. 用户已经确认的业务事实

| 公司/农场 | 来源 | 商业产品口径 |
|---|---|---|
| COMP-LAO-AGRI / LPH_MENGSAI / SITE-MENGSAI-LAYER | HOUSE_MS_01～06 | STANDARD：沿用原“鸡蛋”目录，variety明确NULL，不强改为红壳或粉壳 |
| COMP-LAO-XINGCHI / FARM-DP / SITE-DONGPENG-LAYER | HOUSE_DP_01、03、05 | VARIANT：EGG_PINK粉蛋 |
| 同上 | HOUSE_DP_02、04 | VARIANT：EGG_RED红蛋 |

东鹏公鸡舍HOUSE_DP_06与调试舍H-DEBUG-A01不在启用清单。用户另明确确认：东鹏分舍颜色**至少自老挝业务日期2026-11-10起**就已如此，支持该日起尚未入库的记录，不改写既有库存。0号蛋恢复为GRADE_0，重量边界待核实；不根据行业经验填≥66g，不修改既有GRD-001及其历史SKU引用。旧零号别名不静默重分类，遇未授权旧grade需明确治理后再新入库。

组织/鸡舍编码来自生产只读审计42983144676与42985302335；颜色和STANDARD口径来自本会话用户明确答复，而非从鸡种名称推断。

## 2. 为什么增加独立来源档案

`md_product_varieties`只表达红/粉两种商业变体，不应强迫所有普通鸡蛋都属于某个壳色，也不能把白壳鸡种硬映射为粉蛋。新增`md_egg_source_profiles`将商业口径按company/farm/site/house及生效区间配置，生物品种留在养殖追溯域，二者不混用。

- STANDARD必须variety NULL，且SKU、产品也都明确NULL。
- VARIANT必须是有效商业变体，SKU、产品、来源档案三者相符。
- company+house+effective_date唯一，日期重叠在读、运维写入时都拒绝。所有维护写者使用`phoenix:egg-source-profile`的company:house独占锁；业务读持共享事务锁。
- 所有新生产/包装批次绑定来源与真实仓库/库位，并验证仓公司和用户数据权限。配置公司不能再走旧无来源生产旁路。
- `inv_batches.source_profile_code/source_profile_snapshot`只写新事实；多舍合并记录完整来源数组且模式/变体一致。历史NULL原样读取/幂等重放，不回填、不按今天主档重推。

结构迁移为`1794400001000-EggSourceProfiles.ts`：仅DDL、真实down、幂等、无历史业务DML。TS链变为95条，固定ledger审查清单同步新增这一条，不放宽未知迁移断言。

## 3. 启用数据范围

审查清单固定在`scripts/ops/manifests/sku-two-company-source-activation.json`，CLI必须明确传入用户已确认的来源生效日2026-11-10，不能任意推算过去日期；实际启用时间另由数据库审计时间记录：

- 11个来源档案。
- 孟赛42个exact COMPANY SKU授权：沿用原1～5号×7规格的35个稳定SKU；0号×7规格新增，保留原普通产品与名称。
- 星驰84个授权：红/粉2产品×0～5号6等级×7规格。
- 91个新SKU（红/粉84＋新0号普通7）授权`sale_enabled=false,stock_enabled=true`，并设置`org_context_required=true`；35个既有普通SKU保留旧交易模式与销售许可，不改旧SKU身份。包装明确验证等级可售/可库存后使用库存授权，不把“允许工厂包装”误当“已开放销售”。
- 未改造的旧销售/POS不能显式选择或经泛蛋FIFO/quantity pool绕用这91个新SKU；WMS SALE按销售用途校验，仓储/调拨按库存用途校验。移库原样复制品种及完整来源快照，不从今日主档重推。
- **用户随后明确选择：把必要销售/POS接入提前，联动验收后才启用新SKU，避免星驰新产销售中断。** 因此下述阶段3工具/授权清单目前仅为安全准备版，不能单独用于生产业务切换；须在报价、计量、组织范围和实际扣库联动验证后补齐销售就绪清单。不得自行猜价格、抄不明单位报价或先切生产再补销售。
- 不创建ALL、不建立鸡种推测映射、不修改鸡群、不改历史库存/订单/价格或旧SKU身份。
- 目录碰撞、冻结、依赖缺失、旧授权冲突、来源日期重叠一律停止，不自动修复历史。

运维工具`sku-source-activation.mjs`有inspect / dry-run / apply。inspect使用真实REPEATABLE READ READ ONLY；写入在SERIALIZABLE事务中独占锁定来源，重读完整相关主档/授权/来源及schema定义生成CAS哈希。apply必须显式确认、精确匹配inspect plan SHA且来源生效日精确等于用户确认的2026-11-10并不晚于数据库当日；不能把实际执行日混作鸡舍历史颜色证据。幂等重跑不追加副本；后置检查全部目标主档ACTIVE和授权一致；晚期失败整单回滚。

## 4. 发布顺序与安全门禁（尚未执行生产切换）

1. PR通过本次相关验证，合并精确main SHA，构建API/Web镜像。
2. 既有controlled-pending-migration-apply先inspect账本，再apply新增结构并记录源码/账本凭证。不能把CI数据库迁移日志当生产证据。
3. 新SKU Source Activation Inspect workflow只读取主档，输出该main的manifest/DB state/plan SHA；允许旧API提供pg依赖，不改checkout、floor、容器或数据。
4. API-only受控floor重锚：previous floor以生产实际值为准；run_migrations=false，结构已单独有凭证。明确传source有效日及inspect plan SHA。
5. 在现有后台fence与FD9之内，容器切换前先只读preflight验证plan仍匹配；若数据漂移，不能先切API再发现问题。
6. API已切到精确target且healthy之后，才通过容器stdin执行同target的启用工具，仍再次CAS。**绝不能在旧API缺少公司品种门禁时先激活新品种SKU。** 不复制脚本进容器、不要求生产host有pg、不把数据库密码放命令行。驱动仅使用API真实DB_*，不让DATABASE_URL覆盖不同的实际DB。
7. 启用提交后再smoke、POST/log evidence、完成state并由负责人协议OPEN。随后Web同SHA单独部署并核验精确版本；floor重锚的API-only约束不绕过。
8. 只读核对profile/授权/目录及生效日期、API/Web健康和版本。生产验收不编造1枚蛋入库或试卖单。

preflight后的API切换/业务启用失败仍须受控恢复或前进修复，不能强删transaction marker、回滚数据库或自动恢复旧API。部署过程需要计划内短维护窗口；旧Web的新包装选择可能短暂不可用，待同SHA Web切换完成后验收。

## 5. 验证事实

- 来源服务及核心生产三套专项179项通过（后续又补仓/库位与CLS反例，最终以集成日志为准）。
- WMS真实SkuPolicy严格SQL矩阵覆盖19条入口；9 suites / 153 tests通过；源/目标公司均校验同一SKU，入库UPSERT不能跨身份累加。
- 最新生产来源/数量PG专项：STANDARD NULL来源及既有普通身份保留、VARIANT公司绑定、日期生效、历史重放均有真实PG覆盖。
- 包装PG readiness74 / protection13 / history51，相关unit38，共176通过；工厂sale=false/stock=true、库存禁用与等级不可售反例保留。
- 启用工具真实PG测试25项通过：只读inspect、dry-run回滚、CAS数据/schema漂移、完整主档/0号7SKU、幂等、来源重叠、公司/库位分类、旧身份冲突、冻结/ALL拒绝、晚期插入失败整单回滚及既有0号重量保留。
- 全链空库195 SQL +95 TS真实重建，复现旧late fixture字段缺失，修复canonical fixture后真实鸡群写入和包装式克隆通过；新增日期JSON/历史编辑断言通过。
- 公共readiness在本轮恢复核查时为READY/db connected；这不代表新版本已部署。

## 6. 浏览器CI存量与本次回归必须区分

PR524早期浏览器21失败中，2项是本次breed必选契约未同步fixture：已补标准breed/ACTIVE字典并保留无有效品种不能保存的负例。其余19项有base/head相同blob及既有引入提交证据：15项旧日报modal/双班次合同、3项仓库批量表单权限/去向缺口、1项replenishment缺父档（该seed已顺带补齐）。不通过更改预期或删除测试假装全绿；最终CI新结果逐项分类。

当前代码和工具尚需集成后的最新CI与受控发布实际回执，不能把本文件当作生产完成报告。
