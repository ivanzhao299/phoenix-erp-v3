# 393条entity漂移最小正确闭环方案（仅调查，待父级审定）

2026-09-14；调查HEAD `3a43829eca84aa3ae45fde12ca292a5faca762c4`。本轮不改entity/schema/业务代码，不执行生成diff，不启动DB、不做生产访问，不改300/allowlist，不任意移除entity。以下消除数量是对现有具体SQL的候选归属，**不是已经消除的实测值，也不是为满足门槛承诺的数值**。

## 证据与分类

已逐类读取 `artifacts/packaging-history-compatibility-1789365718577/gate-analysis.json` 中393条SQL及行号；参照真实候选生成文件 `artifacts/packaging-candidate-1789366801706/generator-artifacts/entity-gate.XCboimSD/1789366812000-EntityDrift.ts`、正式DDL/TS迁移及下列ORM调用。生成文件up/down仅作差异线索，绝不执行；其down甚至会丢失GIN索引类型等语义，不能代替正式DDL。

| 原分类 | 条数 | 正确处理方向 |
|---|---:|---|
| DROP_CONSTRAINT | 79 | 包含额外CHECK/FK、类型变化牵连重建、命名差异；不能统称无用约束，更不能删除 |
| DROP_INDEX | 37 | 保留真实索引/partial unique/GIN；用实体准确表达能表达的结构，复杂索引由正式迁移权威管理并验证保留 |
| COMMENT | 50 | 原表注释被提议删除；元数据对齐可研究，但不以删除注释/凑50条作为过门禁方案 |
| CREATE_TABLE | 1 | biz_store_daily_close缺表；先判定退役契约，不盲建、不随意移除entity |
| DROP_COLUMN / ADD_COLUMN | 74 /45 | 相当部分是varchar长度/ID类型不匹配的成对重建，另有真实缺列；两类必须分开 |
| ADD_CONSTRAINT | 27 | 部分是错误PK/FK目标/名字造成的重复重建，保留既存约束名称、动作及列集合 |
| ALTER_COLUMN | 58 | nullable/default语义与表示归一化混合，不能统一SET NOT NULL或直接接受DROP DEFAULT |
| RENAME/COPY/generated metadata DELETE | 各1 | 同一unpaid_capital生成列误表达引发，禁止照提案复制/删除财务数据 |
| CREATE_INDEX / CREATE_UNIQUE_INDEX | 18 /1 | 检查与DROP是否成对、列顺序/表达式/名称是否正确；不直接新建重复索引 |

现有新83/旧81的393条SQL多重集合相同，但都是超过300的真实红灯；修复新门禁后正常CI仍必须失败，不能据旧库也393豁免。

## 推荐先审的最小两组：审批元数据 + 身份关系元数据

这两组是一条完整的审批/身份ORM依赖链，优先级来自真实调用及错误关系目标，**不是挑93条删掉**。先A、后B，每组独立差异再生成与行为回归。按现有不重叠SQL归属，A的明确类型/唯一约束44条+B的sys_user36/sys_user_role15条共95条候选，理论剩298；这只是静态上界测算。任何消除不符或新增diff都暂停分析，不能临时拉入注释、放宽阈值或删保护补数。

### A：4张审批表，保留数据，仅实体表达对齐

正式源 `apps/api/ddl/24_approval_engine_tables.sql:17` 起明确这些列为 **VARCHAR(255)**，当前实体省略length产生无限长varchar；不是text与varchar的业务转换。实际ORM使用见 `approval-engine.service.ts:148` ruleRepo.find、330 mgr.find(rule steps)、384/455 mgr.save(instance/steps)、621以后审批状态事务。

| 表 / 实体 | 精确修改候选（不改DB） | 对应原diff |
|---|---|---|
| wf_approval_rules / wf-approval-rule.entity.ts | rule_code,module_code,biz_type,org_type,company_code,project_code,currency_code,approval_mode补length255；rule_code唯一约束使用既存wf_approval_rules_rule_code_key，去掉重复自动命名声明，保留唯一性 | L306–324中的18条 |
| wf_approval_instances / wf-approval-instance.entity.ts | instance_no,module_code,biz_type,biz_no,status补length255；唯一约束保留wf_approval_instances_instance_no_key | L326–339中的12条 |
| wf_approval_rule_steps / wf-approval-rule-step.entity.ts | approver_type,approver_role,org_scope补length255，nullable/default不变 | L342–347，6条 |
| wf_approval_instance_steps / wf-approval-instance-step.entity.ts | approver_role,approver_name,status,action补length255，nullable/default不变 | L348–356中的8条 |

A附带保护必须保留：`1788337017420-AddSalesOrderApprovalContext.ts:10–18` 的SALES_ORDER trigger_codes CHECK和GIN索引。建议补同名@Check；GIN不可用普通@Index冒充。原L340–341的`'{}'`/显式类型cast default是归一化疑点，须对pg_get_expr与TypeORM normalizeDefault做隔离证明后才改entity表达，当前不将2条计入确定消除。复合索引原生定义顺序以DDL为准，generated down显示顺序差异不证明需要重建；不为改变优化器路径改列序。

A测试：真实PG ORM创建规则→生成实例→分步审批/拒绝/撤回；字段NULL/255字符边界，事务rollback，唯一规则/实例号冲突；SALES_ORDER非法trigger仍CHECK拒绝；GIN pg_get_indexdef不变。新旧列值/约束/索引目录快照不变，生成diff中指定44条消失且无新增DDL。API/Web tsc及审批/销售回归按受影响契约执行。

### B：sys_user + sys_user_role成对修，不能只改一端

源 `apps/api/ddl/01_create_rbac_tables.sql:2–17,46–52`；末态还包括 `1782730000000-AddSysUserArchiveLifecycle.ts`、`1787299200000-AllowNullSysUserStoreCode.ts`，以及角色runtime迁移。当前SysUserEntity“与实际列一致”的注释并不成立。

- **sys_user（原36条候选）**：物理主键保留user_id BIGSERIAL/sys_user_pkey，实体可保留id属性但显式name=user_id/type=bigint；username VARCHAR64非空、同名既存唯一约束；password_hash VARCHAR256非空（任何测试不输出值）；real_name VARCHAR64非空；phone32、email128、locale8非空默认zh-CN；status为smallint默认1和(-1,0,1) CHECK，不能把DB改成ACTIVE字符串；store_code VARCHAR64、nullable=true、default ALL，以新TS末态为准。补齐last_login_at/created_at/updated_at/perms_version/archive三列/note等已有列装饰器，并保留真实索引。绝不DROP user_id或新造id列。
- salt/role/permissions/user_type/real_name_zh/real_name_lo/manager_user_id目前被错误声明为物理列。不是删除整个entity：先将物理列与接口适配明确分离，保留实际DTO兼容。AuthService:96–98用raw query的user_id AS id、real_name AS real_name_zh；PermissionsService:312同样别名；BFF:574从note投影user_type并从角色关系取role，均不要求对应物理同名列。manager_user_id的业务负责人解析在sys_organizations/prc2_projects，不能据用户entity幻影列新增第二权威来源。
- **sys_user_role（原15条候选）**：当前JoinColumn引用id属性，但该实体错误int主键覆盖了已声明bigint关联列，导致提议重建PK/列/FK。与sys_user物理ID映射一起修，保持user_id/role_id复合PK与既存名称，user/role ON DELETE CASCADE、granted_by既有NO ACTION，绝不通过删除外键解决。补is_visible既有列及迁移定义的partial unique元数据，不改实际可见/主角色语义。
- B的实际风险：bigint JS表示、身份DTO兼容、relation加载和删除动作；不要新增Number转换损坏大ID。即使AuthService多数raw SQL，relation也是真ORM，必须真实PG repo.find带user/granter relations验证，不以tsc替代。

B测试：普通账号登录/JWT身份形状、角色关系查找/添加/撤权、perms_version刷新、归档(-1)/禁用0/启用1、store_code NULL；多角色visible/primary唯一冲突、删除约束动作仅在隔离fixture验证；无权限角色/公司/仓/场范围矩阵；包装接收员撤权与旧操作key回归。所有数据/约束先后快照不变，只有entity映射修改时不应需要新业务DDL。

**B唯一需父级明确的语义停点**：sys_user.note当前被不同旧入口用作不同含义：`master/system-users.controller.ts:226–236`把real_name_lo写入note，BFF将note当TEST/REAL类别。不能在本次元数据对齐中迁移/回填或宣称解开历史含义。建议本轮B仅按实际note存储映射，保留原接口适配，单列冲突待治理；不创建user_type/real_name_lo新物理列猜历史。若父级要求同时纠正该业务语义，则拆出独立批准的数据治理，不计入95候选承诺。

## 真实缺列/缺表及其余候选（不隐去，不纳入凑数）

| 表 | 已证实的契约/故障 | 非破坏性修复方案与预计diff | 风险/裁定 |
|---|---|---|---|
| prc_purchase_orders | 隔离SELECT contract_no为42703；ProcurementController:36公开create路由，Service:29调用prc_contract_no_seq、47 em.save，提交亦使用审批/附件列 | C单独补正式TypeORM TS：contract_no varchar128、contract_note text、pay_deadline date、contract_url text、approver_id int、approver_name varchar64，均nullable、不伪回填；序列缺失才CREATE。这6 ADD列有明确业务理由。另entity id恢复int/SERIAL和原PK名，store_code恢复varchar64/default ALL/nullable，时间戳按实际nullable/default表达，可候选消除剩余10条；不改变DB id类型 | 来源是archive/v10、v11 SQL，不在migrate.cjs根目录195执行枚举中，不能把archive当已执行正式迁移。需明确批准活跃旧入口继续支持；建议支持并补链，不为消除6条去删业务字段。序列若已存在不能重置；若缺失需先核验旧合同号，不能START1碰撞。新增非空数据后的down应拒绝丢列 |
| sys_user被旧采购raw SQL引用 | ProcurementService:67、GROUP BY均写不存在的real_name_zh；catch把42703藏成200空审批人 | C同时把查询改为实际real_name/username，保留响应别名；不新增假历史姓名列。真实普通账号approvers与故障分类测试 | 这项修的是活跃业务bug，可能不减少entity diff，不因此省略 |
| sys_user_orgs | 实体未声明org_code/role_scope，但@Check引用role_scope；is_primary/data_scope_level缺默认，FK删除动作未表达 | 按20260530_create_missing_sys_tables与role_runtime_phase_c末态补实体列/default、原CASCADE；保留CHECK，不删DB列。该表9条候选 | 权限枚举TS union与DB CHECK同步核对，不能缩到现有union的5态；真实Scope回归。建议在B后独立小提交 |
| shr_project_equity | unpaid_capital真实GENERATED；entity只有insert/update false。正式20260601_shareholder_runtime_phase1.sql:48及phase2a明确保留 | 声明STORED/asExpression为正式计算表达式，仍禁普通写入；4条表diff+1 metadata DELETE候选 | PG计算值/NULL语义/ORM save+reload及TypeORM metadata需真验；不执行rename/copy/drop，也不修改公式补数 |
| wms_stock_balance / wms_locations / wms_stock_ledger | nullable/default差异，非已证明缺列；balance含VersionColumn | 分别9/7/6条候选；先按正式04_create_p3_tables/末态确认实际允许NULL，再选entity忠实nullable/default表达；VersionColumn并发行为必须真测 | 不直接SET NOT NULL、更不能数据清NULL来凑数。若业务确需非空约束，应另审数据质量+迁移，不纳入A+B快捷范围 |
| biz_store_daily_close | 42P01；StoreDailyCloseEntity仍注册，旧controller三个写入口已410 | 本轮保持1条未闭；检索完整provider/内部调用及V2替代后，父级裁定退役还是恢复旧ORM契约 | 不凭差异创建空业务表，不任意取消注册entity；不纳入预计消除 |
| 其余表/注释/保护 | 包含bug_reports、销售/现金/畅捷通CHECK/FK/partial索引等 | 按原393逐条清单继续独立治理；本轮没有足够业务契约证据给这些表逐列改动许可 | 所有未列明字段保持不动；本方案不是393条全部可安全自动修复的宣称 |

## 下一轮实施验收边界（待审，不在本轮执行）

1. 父级先批准A+B的元数据范围，以及是否把C旧采购真实缺列闭环并行纳入。建议C纳入正确性修复，但不要将其视为为300门槛补数。note历史含义、旧日结去留仅两个业务裁定点，均不阻碍A先行。
2. 隔离新空PG18全链重建（保留195 SQL/bootstrap/TS实际数量），另用现有恢复fixture验证；绝不执行自动生成diff。每组生成**只读差异文件**，显式当前artifact过300门禁，逐条验证消除项和新增项。
3. A/B仅映射改动：迁移schema/catalog与数据摘要应不变，真实ORM/事务/权限测试覆盖上述契约。C若新增迁移：新空全迁移、旧schema兼容窗口、事务/锁/非空down保护及真实普通账号旧采购HTTP；不执行生产业务写。
4. API/Web tsc、受影响unit/DOM与权限/审批/采购/WMS业务测试；包装原核心PG/HTTP/browser需因auth/关系共享变化再验，不能借本轮“应用没改”免后续回归。原scope红灯分类保留，门禁必须实际≤300才可绿；95静态预测不算完成。

## 正式Node20构建及远端只读状态路径调查

- 当前Docker目录仅node:22-bookworm-slim、node:22-alpine，没有本地Node20基础镜像；本轮只查catalog，未pull/build。前轮Node22候选不能替代正式Dockerfile Node20 Alpine。
- 合法下一步：专属仅tracked-source构建副本，包含原package/lock/workspace/API-Web Dockerfile与源码，排除.env、auth artifacts、历史dump、node_modules。仓库根**没有.dockerignore**，因此不能直接拿含大量证据的当前根目录作context。使用实际 `apps/api/Dockerfile` / `apps/web/Dockerfile`，正常取得官方node:20-alpine及pnpm9公开依赖，按原frozen-lockfile构建；不安装/修改生产或CLI配置，不用Node22或跳检查替代。记录基镜像digest、Node版本、源码/lock/Dockerfile fingerprint、pnpm build与镜像运行结果；候选以同镜像跑新83/旧81窗口及schema-first测试。此路径本轮未执行，不称Node20无法获取，仅其本地尚无镜像。
- 远端已找到 `.github/workflows/production-readonly-audit.yml:42–83` 的合法受控通道，但它需workflow_dispatch、environment production secrets，并先SCP审核bundle；本轮禁dispatch/生产写文件，不可调用。未读取secret、SSH配置或旧认证artifact，也不猜host/key。当前没有已明确且可在本session直接使用的纯只读连接路径，故DB major与实际部署ref仍未知，不用本地origin/main当远端部署证据。
- 一旦父级提供/确认已有无需dispatch/上传的合法只读通道，仅取 `git rev-parse HEAD`、`SELECT current_setting('server_version_num')`、已部署API/Web镜像ID；禁 `docker inspect` 全环境、禁读.env、禁HTTP登录。此处是待执行查询清单，不是已查结果。


## 已授权实施状态（2026-09-14，仍无发布）

A/B按父级批准实施：393→335→277，分别58/58条消除、无新增，替代本方案95静态预测。随后review27授权通用parser真实修复，28–29在逐列catalog和旧库存真实丢更新反例后追加仅三表十列nullable与旧InventoryService事务修复，277→267（10消除/0新增），没有实施本方案其余C。scope旧脚本仍FAIL，267非零差异保留；不称全部发布验收。精确独立证据、源码/测试映射、Node20候选与剩余风险见packaging-history-workflow-implementation.md末节。
