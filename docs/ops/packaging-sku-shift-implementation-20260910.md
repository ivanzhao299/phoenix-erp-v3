# 包装 SKU 就绪与终端班次修复（2026-09-10）

状态：授权实施中；未合并、未部署、未做生产主数据写入或业务 POST。原单 33 未入库，不能宣称业务闭环。

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

PR/run/revision待最终验证补齐。尚未声称CI全绿、合并或full deploy。生产仅允许GET/schema/主数据校验；无真实浏览器上下文，不声称浏览器已验收。

下一待批：确定5号蛋权威产品身份；原单33实物30枚、接收人和库位及一次入库动作另批。旧污染链、新依赖、其他GRADE补录均不在本轮。
