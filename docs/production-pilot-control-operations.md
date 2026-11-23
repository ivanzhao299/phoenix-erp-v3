# 试点受控启停与结果查回

软件部署后默认关闭。结构迁移只创建启停回执、不可变保护和原生结果的受限关联视图。没有新增角色、权限分配、准入、启用舍、期初或库存。

## 场长与仓管

在「生产 → 盘点交接」打开已执行的原盘点。已签待执行的盘点需先走下述宿主流程。查看运行控制沿用实际公司和仓库的读取授权。执行暂停或恢复需要现有 `MENU_PROD_INBOUND:A` 和单独登记到实名账号的有效 `ROLE_PRODUCTION_PILOT_CONTROL`。既有系统管理员、审批人和财务签认不会自动取得此项授权。使用现有角色管理流程单独建立并分配试点控制角色。

- 选择「仅此鸡舍」用于舍内问题，保持同仓其他舍及实物域原状。只能选择原盘点覆盖的舍。
- 选择「共享实物域及所有关联鸡舍」用于实物范围问题。系统沿产品域与鸡舍的实际关联显示全部影响行。预览的版本、范围或当前状态有变化必须重新核对。已单独暂停的舍和共享域遇到重叠操作时，保留已有暂停并先协调原负责人。
- 上传本次操作人所属公司的仓库受保护凭证，填写原因。恢复还需核清未办交接、实物、下游引用与修复结果，提交与暂停不同的凭证。系统核对原生已执行记录、原期初、最近暂停操作号和范围版本。任何不一致维持当前状态。
- 页面回执列出操作号和影响的鸡舍。超时或刷新后使用「查回本设备上次启停回执」。跨设备可由授权人使用原单及原操作号查询 `GET /api/v2/inventory/production-cutovers/:id/state-receipts/:intentKey`。原盘点及入账回执继续可查。
- 提供给集成方的预览入口为 `GET /api/v2/inventory/production-cutovers/:id/state-boundary`，按单舍操作时加 `?houseCode=...`。变更入口为 `POST /api/v2/inventory/production-cutovers/:id/state`。提交 `state`、原预览的 `boundaryHash`、唯一 UUID `intentKey`、`reason`、`evidenceFileId`，单舍操作带 `houseCode`，恢复必带原 `pauseIntentKey`。同一实名、同一操作号、相同参数返回原回执。

## 受控宿主

执行使用保护宿主原有的 root / 固定目录 / FD9 排他锁，代码必须为干净 main 和指定发布 SHA。通过 `node scripts/ops/production-cutover-host.mjs execute` 处理已经批准的原意图。该命令没有传入连接串、任意命令或审批覆盖选项，也不安装网络围栏或切换部署。使用 `recover` 只读查回同一原意图；二者都保留外层围栏。

现场前置材料由相应负责人交接，软件不会自行生成。以下是宿主固定状态目录的输入契约。

1. 原 `cutover-pending.json` 为 PREPARED，purpose 为 PRODUCTION_CUTOVER，绑定 run owner、相同 floor/target SHA、manifestId、manifestVersion、admissionId、INIT/ATTACH、contentHash、snapshotSha256。核实真实当前鸡群、实物、在途、预占、首日、来源、仓库与财务双签。受控外层先完成入口围栏、原业务排空、后台参与者 FENCED，并保有原代次。
2. `cutover-source-attestation.json` 使用 schema `phoenix.cutover-source-attestation/1`，含 revision、imageId、treeSha256、reviewedBuildDigest、nativeAbiRehearsalDigest。由独立责任方对实际构建和该镜像内运行的工作器完成来源、ABI 复核。在原 API 运行镜像上按已有 runtime-bundle 准备和复验。使用不可变镜像、非 root UID、只读根、无容器网络和唯一 PG 套接字挂载运行。
3. `cutover-drain-attestation.json` 使用 schema `phoenix.cutover-ingress-drain/1`，包含 owner、generation、manifestId、inFlightDrainDigest、approvedIngressCoverageDigest、networkId、interfaceIndex、ruleScope、kernelIdentitySha256。ruleScope 是现有受控 IPv4/TCP3100 围栏的 owner、bridge、subnet、port；内核标识是按 inet、bridge 顺序读取原始已安装表，经 maintenance-ingress-policy 的投影和 ingressIdentity 后的 canonicalDigest。记录实测入口覆盖、数据库在途和其他写入者清场凭证。宿主复查原内核规则与句柄、容器网络、API 代次、原后台参与者和注册 API 在途事务。
4. `cutover-host-authority.json` 使用 schema `phoenix.production-cutover-site-authority/1`，包含原 binding、fenceGeneration、environmentId、environmentGeneration、operatorId、deploymentEvidenceSha256、project、database、executorRole、clusterIdentifier、peerUid、peerGid、windowStart、windowEnd、bundle、treeSha256、sourceAttestationSha256、drainAttestationSha256。bundle 复用 bundleId、imageId、revision；摘要使用 production-maintenance-receipts 的 canonicalDigest。真实维护窗口最长 180 分钟。文件由既有独立信任链登记，专用签发人必须核对其摘要与现场许可，登记动作不由此命令授权。
5. 数据库使用原控制环境、独立签发和执行角色。现场需提供受保护的 `/run/phoenix-cutover-postgres`，固定 public schema / 5432，以 peer 身份只映射到专用执行角色；挂载中只允许专用 socket 和锁文件。不得使用 API 登录、共享密码或超级用户。现有控制环境须允许应用读取 origin 视图和读取／插入启停回执。首次注册在迁移之后时由 DBA 按既有治理规则配置相同最小权限。
6. 唯一尝试先写入 root 私有 `cutover-host-<admissionId>-attempt.json`。原执行后端取得两把会话锁后，宿主核验并写入同前缀的 `-backend.json`。独立原签发方按已有 admission 契约，仅对这个空闲后端和已登记的相同 admissionId、操作者、authoritySha256、围栏与盘点摘要投递。签发方须使用 DBS 原始 backend_start、pg_postmaster_start_time（或无损转换记录的微秒值）；许可有效期至多十分钟，工作器等待独立签发至多九十秒。任何一个环节未就绪，保留围栏并记录阻断。宿主不会自己签发。
7. 结果不明只执行 `recover`。它建立新连接，以只读一致快照核对原准入、APPLIED 原生结果、舍域和期初申领、原始入库流水。ATTACH 使用已有期初。精确成功为 COMMITTED，缺少证明为 UNPROVEN 或 HOLD。结果写入私有 `-execute-result.json` 或 `-recover-result.json`。禁止重发新准入、删除 attempt、人工改状态、重复建期初。业务放行需现场发布负责人按批准的独立围栏恢复流程处理。

## 验收范围

隔离 PostgreSQL 18 测试覆盖真实独立数据库角色、实际 INIT/ATTACH、COMMIT 后断回执、核对原记录、共享域与单舍的暂停和恢复、真实库存可写判定、查看既有回执和 HTTP 请求格式。人工真实审批、宿主安装、独立签发、正式入账和首日两次交接均是现场验收项。
