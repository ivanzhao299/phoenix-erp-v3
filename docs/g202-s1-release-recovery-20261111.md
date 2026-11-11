# G202-S1 发布恢复与二次安全核查（进行中）

## 状态更正

本记录取代首版实施报告中“阶段0+2+3已全部闭环/可直接启用”的表述。代码合并、镜像构建、CI数据库迁移、生产数据库迁移、生产容器切换、业务主数据启用是不同事件，必须分别验证。

- PR522已合并：`22f28e8d1f328b18d33c543c20d1eb007f4beeb4`。
- PR523已合并：`147f56d924bff1aae47740e104977dc4ac5bb9b4`，修改发布包装函数；它在 criticalFiles 中，仍需要受控 floor 重锚，不能仅靠普通发布。
- 旧记录将 CI job `Type-check & Regression / Run DDL migrations` 的成功误称为生产迁移成功，不成立。生产迁移必须看受控 apply/ledger/receipt 证据。
- 旧记录把业务页面 E2E 超时直接认定为主分支存量故障，证据不足；不能以此跳过全部验收。
- 初版种子脚本未经业务确认把白壳品种映射粉壳、LOCAL映射红壳，以及默认为全部新SKU创建ALL授权，不应执行。

## 遗留事务恢复（已完成）

### 只读核查

[生产状态取证42978600759](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/42978600759) 显示：

- `transaction.json` owner=`42967344262-1`，phase=`IN_PROGRESS`。
- 对应 deploy record outcome=`PREPARED`，`switched.api=false`、`switched.web=false`。
- previous API/Web revision 均为 `28142f9f2553b5445c563ef72443de751758c53a`。
- floor READY，同一SHA，Chanjet policy HOLD，后台控制 OPEN。
- `policy-transition.json` 不存在。

### 受控恢复

[受控恢复42978755928](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/42978755928) 使用既有 `production-background-reconciliation.yml / rollback-dead-transaction`。恢复 helper 再次核对实际API/Web镜像ID与revision均等于previous后，仅关闭未切换代码发布事务：

```
BACKGROUND_RECONCILIATION=TRANSACTION_ROLLED_BACK;run=42967344262-1
runtimeApi=28142f9f2553b5445c563ef72443de751758c53a
```

这不是数据库回滚，也不是新版本部署；没有删除生产表、恢复数据库或强制重启容器。

[恢复后取证42978959678](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/42978959678) 确认 transaction/policy marker 均 MISSING，后台仍 OPEN，floor未改变。

## 当前补强（未发布）

新工作分支 `sku-release-hardening` 从 main `147f56d92` 开始，按不相交文件分工：

1. SKU可用性：公司授权必需；子层不能覆盖父层禁用；没有品种不再猜全局SKU；显式SKU校验用途/品种；鸡群按组织及业务日期解析，不丢弃未知来源。
2. 核心生产批次：新增变体不可绕过company/variety/scope校验，快照取验证后的主档值；TEMP_PRODUCTION不能缺SKU/variety。
3. 生产入库传递权威farm及eggDate，保留历史幂等重放，不按今天主档改写既有批次。
4. 包装options/submit/REGISTER/交接/库存统一使用来源context；前端ready-combinations补shift及grading参数。
5. 目录脚本仅准备DRAFT；不推断品种映射、不默认ALL、不改写历史主档；实际启用需审核公司—农场—鸡种—壳色—SKU配置。
6. 鸡群前端不默认未知品种为字典首项；后端写入事务校验ACTIVE BRD_BREED和权威house/farm/company，已有日报不能直接改写来源身份。

## 已实际执行的专项验证（非完整发布验收）

- availability service单测69项通过。
- availability + 核心egg-inventory专项共105项通过。
- flock写入策略单测6项通过。
- production-inbound编排单测16项通过（策略本身另有真实PG测试）。
- PostgreSQL18 production-inbound + farm pending通知：25项通过，包含公司禁用与场站放行冲突、未知群不可被过滤、补录日期不可使用后续群、并发/幂等/回滚。
- seed纯测试12项通过；集成后API/Web `tsc --noEmit --incremental false`均exit0。
- 完整API单元套件显式NODE_ENV=test：142 suites通过、23 skipped；1596 tests通过、409 skipped。首次失败包含本地bcrypt native binding未构建，构建依赖后真实重跑通过，不记为主分支缺陷。
- 包装真实PostgreSQL18：history 51/51、readiness 48/48；包装相关5-suite专项158/158。Web专项43/43。
- quantity专用PG fixture 23/23；farm HTTP/PG 5/5。farm嵌套Web live DOM 3/4，老挝语日期范围项返回37而预期9，尚未证明属于基线或本改动，必须保留为未解决测试项，不能报全绿。
- 迁移DML/down/nullable-unique/constraint drift检查通过（94条迁移，未新增schema迁移）。

## 用户补充业务事实与发布前置

- 老挝凤凰农业发展有限公司：用户称“正常壳颜色”。不能自行等同红壳或粉壳，先保留原描述。
- 老挝东鹏县星驰农业发展有限公司：同时包含红壳、粉壳，必须继续按鸡舍/鸡群或明确分批来源分配，不能公司级默认单品种。
- 0号蛋重量边界：用户明确“待核实”，不写入≥66g的未经确认规则。
- 详细待填配置见同目录 `sku-company-variety-activation-template.json`（DRAFT_NOT_EXECUTABLE）。

当前严格运行时代码会拒绝没有品种或COMPANY分配的新增入库；生产现无经确认的全量配置，因此**本分支不能直接全集团部署**，否则会阻断既有业务。现有库存来源模式开关不是SKU rollout开关，不能借它绕过严格校验。安全下一步是明确试点公司与来源映射，并完成启用预检；或先实现精确公司级发布策略（只允许冻结的旧目录继续原协议，新变体只在STRICT公司可用，异常不回退）。

仍需：提交补强PR并监控CI，收口未通过的live DOM场景，确认公司/鸡舍品种配置及试点发布策略后，再按受控floor/API/Web流程发布。没有审核配置前，不执行新SKU业务启用。
