# 包装 SKU 就绪与终端班次修复（2026-09-10）

状态：代码已提交至草稿PR，发布暂停；未合并、未部署、未做生产主数据写入或业务 POST。原单 33 未入库，不能宣称业务闭环。

## 授权与基线

本轮仅两项代码修复、验证、PR/CI/full deploy及只读生产验收；主数据仅允许身份明确后的必要产品及一条 GRADE_5 + PKG_PACK_SPEC_3 SKU。明确排除包装33确认/幂等重放、业务POST冒烟、历史清理、其他GRADE补录、编号和唯一约束治理。

初始分支 audit/packaging-confirm-failure-20260910，HEAD 1b92d4a1；唯一工作区文件是既有未跟踪全屏调查报告，保留。远端最近 PR228 已合并，main=492ba3c3a67b477e2240b7b5a8762164a80bfd7e，未发现后续修复PR。本轮分支 fix/packaging-sku-shift-context-20260910。

只读 run 34462955412：三端 revision 一致于上述 main；包装33仍30枚1盒，batch/ledger/handover均0。只读 run 34463062878：精确主数据preflight。两次双层 READ ONLY，HTTP manifest为空，无应用bootstrap或认证写入。

## 根因与改动

- 原异常已由此前报告及留存日志证实：GRADE_5 / PKG_PACK_SPEC_3 SKU缺失，旧解析又盲拼 PRD-EGG-GRADE_5；未重放生产POST。
- 新解析器统一验证已注册 ACTIVE 产品、等级、规格与唯一 SKU；明确 missing/inactive/ambiguous/mismatch；新包装 JSON保存产品/SKU身份，旧单仅唯一匹配兼容，不修改原载荷。
- submit同事务预检，confirm二次校验；全部产出先解析后写；库存、ledger和交接同manager。幂等逐SKU比较原量、规格、日期、归属、库位和交接，不以available作原量；部分证据拒绝。
- 失败抛出既有全局异常记录通道，结构化日志带单号、用户、阶段和可用SQLSTATE；不以历史committed覆盖本次失败。非业务错误返回通用消息，不暴露SQL/栈。
- 班次Provider共享状态，version/user/real隔离缓存；旧无身份缓存要求重选。hydration核验精确ID/日期/权限，未就绪不挂业务页；切班换账号重挂消费页并清交互状态。
- 交班summary与active核验精确班次、real/test、权威farm/company及来源范围；显式非法ID拒绝；dashboard保留无参用途；读取失败传播。页面generation/cleanup保护旧响应，按钮绑定成功加载的当前OPEN班次。
- 旁项仅展示改为现有服务端 shiftWarehousedBoxes/Pallets，不修改业务数量或推算托盘。
- 独立PG18发现 DATE对象转UTC在+08环境错日，包装日期改SQL ::text读取。
- 无schema迁移。部署workflow增加 preserve_artifacts 选项，以避开本轮禁止的reset/备份删除/镜像清理；最终发布必须显式full，并另核三端revision。

## 主数据决策停止项

run 34463062878（09:53:42 UTC）实查：

| 对象 | 精确现态 |
|---|---|
| mst_products | 10条，10 ACTIVE；唯一已注册蛋产品 id10 EGG / Chicken Egg / 鸡蛋，has_grade=true，has_spec=false |
| product_master | 全表0 |
| mst_products PRD-EGG-5 | 0 |
| mst_products PRD-EGG-GRADE_5 | 0 |
| GRADE_5现有SKU | 7条ACTIVE，id3953/3958/3963/3968/3973/3978/3983，均引用未注册PRD-EGG-5 |
| GRADE_5 + PKG_PACK_SPEC_3 | 全产品0条 |
| 规格 | 已存在，30枚，不重建 |
| 包装33 | ACTIVE/real，shift56，30枚/1盒，三类入账证据0 |

EGG是可分级的鸡蛋主产品，但历史SKU按独立“5号蛋”产品字符串命名，不能仅凭该字符串注册产品或沿拼接模板造码。复用EGG还是新建独立5号蛋产品需要业务定权。已报告并暂停此数据项；**本轮主数据新增/更新ID=无，生产恢复仍未完成。**

已知发布影响需复核：旧GRADE_1/2礼盒SKU也有未注册产品字符串；新的权威产品门禁会阻止其新包装，而不自动补录越权产品。不得把人工fixture的通过当作生产全部组合就绪。

## 验证与独立复核（持续更新）

- 初轮双端 NODE_ENV=test tsc通过；原Web577项通过；API12项契约测试失败已逐项改成注册产品、精确身份与异常抛出断言，定向30项通过。
- 新React DOM/effect 21项通过，覆盖全屏重入、hydration、非法缓存、CLOSED、切班换账号、乱序/卸载、服务失败及真实入库展示。
- 新PG18真实事务30项通过；完整迁移+应用bootstrap后，原保护与新SKU PG套件合计43项通过。测试使用独立本地容器/数据库，无生产fixture。
- 初次本地迁移运行失败：同一个测试DB的多个隔离schema触发历史SQL information_schema未限定schema判断；换到独立空数据库后完整迁移通过。不是生产schema问题，不改冻结迁移掩盖。
- 静态主数据引用门禁曾因新增3个brd_farms直接引用失败；改为复用OrgOwnershipService.FARM_TABLE权威入口，未提高baseline，门禁通过。
- 旧全仓 apps/api/test/scope-audit.sh 已实际执行但失败：固定测试用户不存在，且旧 /api/finance/summary、ar-aging 路由404；不能报PASS或仅以未改文件称噪声。本轮还需任务级权限/SQL复核与真实窄正则scope统计留档。
- 独立API复核确认事务/解析主线，指出旧Admin公司fallback、旧site/context全局读取、TEMP宽匹配等边界；没有把无公司维度的共享产品目录错误认定为公司数据泄漏。跨班消耗按grading引用扣减是既有授权语义，不能简单加本班过滤制造虚增余量。
- 独立Web复核发现grading WIP仅按班次、同账号logout可恢复旧选择，已补用户/mode隔离及logout清理。仓库交接允许原CLOSED班次有意保留；QC/异常的独立业务状态机不扩成OPEN强制门禁。

## 发布与验收

PR [#229](https://github.com/ivanzhao299/phoenix-erp-v3/pull/229) 为草稿；初轮 commit 5ea95f60 的 regression 34465286042、Web 34465286178、CI/CD 类型回归 34465286056 通过。security 34465286063 失败原因已核实：冻结/安全复核标签缺失，以及两个翻译键前缀不属于运行时桥接范围；已完成独立复核、加标签并修复翻译前缀，待后续commit的全部CI结果。尚未合并或full deploy。生产仅允许GET/schema/主数据校验；无真实浏览器上下文，不声称浏览器已验收。

下一待批：确定5号蛋权威产品身份；原单33实物30枚、接收人和库位及一次入库动作另批。旧污染链、新依赖、其他GRADE补录均不在本轮。

## 复核修正与最终本地验证（18:29 SGT）

- 独立 SQL 复核发现 submit 目标班次 DataScope 缺口，已在同事务锁班次后调用 exactShift，首次写入及幂等响应均先核权。真实PG用例验证拒绝跨场及撤销权限后的重放。
- 统一库存入口缺权威日期现在明确拒绝；不再以当天兜底、不跳过幂等日期比较。主数据行使用 FOR SHARE，防事务中既有身份被并发停用/改写。
- 复核提出 active 扣减应仅限本班的建议不采纳：现有跨班消费带审计原因，必须按 grading 引用扣减。新增真实PG测试证明后班已消费30枚后，原班60枚仅余30；加本班筛选会虚增。
- 部署脚本独立复核确认 preserve_artifacts=true 绕过 reset、备份删除和镜像清理。未运行该部署。
- 双端 `NODE_ENV=test tsc --noEmit` 通过；API全量100套833项通过（2套PG集成默认不接DB跳过，已另跑），Web全量109套614项通过。
- React DOM/effect共37项，真实挂载10页面+layout+导航全部12个context消费方，验证hydration前不挂业务页、换账号清状态；并覆盖精确核验不匹配、StrictMode、旧响应不覆盖新失败。不是仅源码字符串断言，也不是生产浏览器验收。
- PG18专项47项通过（原保护13+新34），含多输出第二组失败回滚、并发/幂等、CLOSED原单日期、SKU和逐项冲突、受限公司/场/仓、VOID/test、summary精确ID/日期/mode/SQL失败传播、dashboard无参兼容。
- 约束门禁0新漂移，nullable唯一、W5静态门禁均通过。窄正则实际扫描 terminal/packaging 全目录：裸主数据input 0、主数据onChange 0，rg退出1表示无匹配、stderr空；12个context引用文件均列入DOM覆盖。
- **全仓运行时scope-audit仍失败**：固定身份fixture缺失、旧finance接口404。本轮没有修造该脚本的历史业务fixture或把失败降级成噪声，不能声称完整scope-audit通过。此项与生产主数据影响一起列为未满足的发布条件。

日志保存在本机 `docs/ops/runs/packaging-sku-shift-20260910/`；只提交报告与相关代码，不提交大日志、凭据或无关生成报告。生产主数据写入前后差异仍为0；包装33仍以最近只读run为准，无任何业务POST。

## 收尾只读现态与交付边界

代码修订 `d4ce392ff5a9fa19645933e5ebfc046110dec7dd`：

| 验证 | run / 结果 |
|---|---|
| 静态安全/冻结 | [34466318247](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318247) 通过 |
| Web Vitest | [34466318189](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318189) 通过 |
| PG及模块回归 | [34466318179](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318179) 通过 |
| CI/CD类型与回归 | [34466318258](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318258) 通过；build/push/deploy均跳过，不是部署 |
| Runtime smoke | [34466318267](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318267) 通过 |
| 构建 | [34466318203](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466318203) 记录时仍在执行Web build；收尾文档提交后的检查见PR实时检查页 |
| 生产收尾只读 | [34466357760](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34466357760) 通过 |

收尾只读双层保护均on，HTTP manifest空，不启动应用、不登录或调用业务POST。主数据计数与前次完全一致；未新增/修改产品或SKU，精确写入ID=无。包装33 `PKG-20260910-163616` 仍ACTIVE/real/shift56、30枚1盒，库存batch=0、ledger=0、handover=0。

三端revision一致断言通过，仍对应原main `492ba3c3a67b477e2240b7b5a8762164a80bfd7e`（Actions日志中段自动掩码）；没有新full-deploy run，因此不能将本轮代码称为线上版本。

未完成条件：①5号蛋归属EGG还是独立产品需要业务定权；②GRADE_1/2孤立产品SKU在新权威门禁下不可用，不能越过本轮“仅GRADE_5”授权补录，发布前需处理/明确接受影响；③旧全仓scope运行审计实际2通过/28失败/1跳过，固定fixture及退休路由需使审计重新有效，不能用当前任务专项通过替代。未满足条件前保留草稿、不合并、不执行full deploy。

下一待批业务动作仍为原单33实物/接收人/库位核实后的独立入库授权；本轮没有请求、模拟或重放该动作。没有真实浏览器上下文，不宣称生产DOM已验收。主数据恢复与业务闭环均未完成。
