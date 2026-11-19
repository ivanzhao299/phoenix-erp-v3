# 鸡群闭环发布前置：后代运行版本配置基线重锚定

状态：开发与隔离验证中，未据此执行生产写入。本文不把协议测试通过等同于业务审计通过或部署完成。

## 已取得的生产事实

2026-11-17 正式只读检查绑定当时 main `a7c0045b9f6d1a475b5a10710184e66d9c494aa0`：

- identity run `44099756016`：配置基线 F=`101916efbcd60956c9f8321d4859931049f966c3`；active API/Web 均为 R=`cb42966edfa717b0984936951143d84973c1a263`；生产工作区干净。该检查因合法旧生产 HEAD 尚未等于新 main 返回 HEAD_MISMATCH，不能以此启动状态修复。
- controlled migration inspect run `44099755930`：实际 API 镜像 revision 与 R 一致；ledger digest=`d29182e52966beed98d4f38f85c2e4e9add4edf9b732e64ce8dbefac0e1a2397`；既有三份库存约束、字典和成本迁移未应用。该摘要仅绑定观察时刻，后续 apply 必须重新 inspect。
- readonly preflight run `44100859989`：重复来源 0、日报重复 0、台账不平衡 0，但存在两组超日报等级额度，审计结论 HOLD。2026-11-17 / HOUSE_MS_01 的 GRADE_4 和 GRADE_5 各有 30 枚入库，而当前日报对应额度各为 0。需要核实原始分级和贡献单据，不能推定应改日报或库存。

本功能还新增五份迁移，最终候选需要评估完整的八份待迁移集合。现有迁移 apply 明确要求审计 GO；不得以 DDL 与这两组数据看似无关而跳过。

## 实际协议缺口

正式 full 发布允许 API/Web 更新至运行版本 R 并保留配置基线 F。然而 API-only 重锚定原要求当前 API revision 等于 F，因此 F≠R 的合法状态不能通过该入口。直接 full 又不能夹带基线晋级参数，而且本次触及受保护文件，无法保持旧 F 完成普通发布。

main push 只负责检测、测试和镜像构建。普通 API/Web/full 生产部署必须由 `workflow_dispatch` 显式批准；允许 push 的例外仅属于 fast-css job。此前侦察将 fast-css 条件误套到 full 的判断已撤回。

## 最小调整与不变量

沿用已有 full 协议的执行身份含义：`previousFloorSha` 表示旧执行版本 R。现代后代 API 重锚定额外携带私有的 `previousConfigFloorSha=F`，并要求 `deployMode='api'`；F=R 的历史 binding 原样兼容。

1. 新字段存在但为空、非法或模式错误时拒绝；禁止 full、legacy 或冲突的 `configFloorSha` 携带该扩展。F、R、T 必须区分，R=T 不作为本次新增操作。
2. 在发布 FENCE 前验证 F→R→T 祖先关系、实际运行 pins、旧配置守卫及 R→T 迁移应用回执。不能以授权字段代替实际镜像、控制端点或排空证明。
3. 私有 owner record、DRAINED proof、Compose 和最终成功核验保留字段存在性及精确值；不能在序列化时丢失 F 后降级成旧 binding。
4. participant、旧 OPEN target、部署 previous API、迁移范围均绑定 R。配置晋级批准和旧配置仍绑定 F。
5. 最终 owner 交叉核验本 run 的 `floor-promotion-<owner>.json`：旧 floor=F、旧 API/Web=R、批准目标=T、scope=R→T、marker owner/target/F 一致。
6. 公开 manifest 仍只包含执行协议字段与 participant，不新增私有 F；现有 root/FD9、advisory locks、generation、main 绑定、维护准入和失败 HOLD 不变。

## 生产顺序（尚未执行）

1. 完成全部源码、独立审查及远端检查，正常合并至精确 main T；自动构建只证明候选可构建。
2. 对 T 重新正式 inspect。两组业务异常必须有可复核事实结论；若需业务更正，单独形成具体处理及审批，禁止在迁移中偷改数量。审计仍 HOLD 时停止生产 apply。
3. 审计 GO 后，用最新 ledger digest 执行现有受控迁移 apply，核验全部实际待迁移及其应用回执。
4. `deploy.yml` 显式 API-only 重锚定：`mode=api`、`run_migrations=false`、`approve_production=true`、`preserve_artifacts=true`、`approved_config_floor_sha=T`、`approved_previous_floor_sha=F`。本阶段 schema 已经受控应用；参数 false 不得被当成绕开应用回执。
5. 等该 run 的实际 API SUCCESS、完整 evidence 和 `BACKGROUND_DEPLOYMENT=SUCCESS` 后，再对同一 T 显式 Web-only 发布，`mode=web`、`run_migrations=false`。若 API 阶段失败，不得启动 Web。
6. Web-only 不走 API 后台 owner 路径，按其正式 PRE/POST/startup、运行镜像、健康和页面冒烟验收。最终 API/Web/floor 均为 T，才可给实际已部署的 T 打发布 tag。

API-only 完成时 API=T、Web=R，不应直接再走 full：既有 full 要求上一 API/Web 同版且目标不同于当前 API。两阶段期间不得为写发布结论另推 main，导致待发布版本漂移。旧群实盘签认缺失时继续保持未激活。

## 失败与恢复边界

- FENCE 后、尚未晋级：只有 floor 仍为 F、完整实际 API/Web pins 仍等于记录 R、无在途部署/晋级事务，才能由既有显式 reconciliation 处理 stranded record；不能自动清理或自动 OPEN。
- 晋级已准备、运行时尚未替换：`abort-prepared-promotion` 对本 run 的 promotion archive 核验 F/R/T/owner，并要求实际完整 pins 等于 archive 的 previousActive，之后才允许恢复原状态。
- API 正式 SUCCESS 但 owner OPEN 中断：`complete-background-open` 必须保留新的私有 F 绑定，并重新验证 archive、正式 evidence 和实际运行版本后才可 OPEN。
- 历史 `reconcile-prepared-public` / `production-prepared-transaction-recovery` 是 F=R 的专用档案协议。新后代扩展明确拒绝进入该分支，不能把 F 当作 R；使用上面适用的晋级恢复或成功验收路径。已经发生真实运行替换但未满足成功证据的情形继续 HOLD，另行形成具体恢复决策。

## 验证记录与限制

开发阶段已运行 API binding/owner/Compose proof/祖先/回执/legacy/reconciliation 等 75 项定向测试；其中一项旧源码正则预期已按新增后代分支更新，随后实际退出 0。新增测试含真实隔离 Git 历史及字段序列化丢失的拒绝。

自有 loopback PG16/PG18 隔离实例上实际跨进程锁测试共 9 项通过（无跳过），新增两项证明后代 API 排空时保留独立 F 授权并仍绑定真实 R 执行会话。该验证不是实际 ERP/Compose 全阶段发布。

真实组件的等价 Compose 串联现已完成三场景，实际退出 0，报告位于本地 `artifacts/flock-lifecycle-supervision-20261117/reanchor-compose-LQkVBo/report.json`：API 正文在晋级后故意失败，仍 FENCED、Web 不切且原运行 pins 的恢复授权核验通过；API 成功并 OPEN 后，Web 镜像缺失的实际发布尝试保持 PREPARED、API 不变；随后 Web 成功对齐，最终 owned active pins 与实际两容器一致。实际 `captureSnapshot/compareSnapshots` 分别核验了 API 阶段 Web/DB 不变、Web 阶段 API/DB 不变。该次容器和公共卷清理完整。

该串联使用真实编译的应用后台控制组件、TypeORM/PG18 会话、只读公共投影挂载和实际 Compose；Web 仅是 HTTP health peer，F/R/T 使用合成 fixture revision，私有 root 路径及最终正式发布证据为 owned adapters。因此它不是完整 ERP/Next 发布验收，也不是生产 receipt。先前测试环境自身的 Compose 查询缺少插值、host networking、数据库 readiness 和初始 generation 设置失败均未计通过；最终改为专属 bridge、显式 loopback 端口、真实健康等待及严格递增 generation 后才获得上述结果。

既有 e238 候选已独立取得两个真实 GitHub 宿主 PG16/18 首次切换 full factory 通过及其余业务回归；该证据与本次后代重锚定串联范围不同，不能互相冒替。最终协议候选仍需源提交后重新核验全套相关检查、独立审查和远端 CI。生产业务 HOLD 尚未关闭，不因此放行生产。
