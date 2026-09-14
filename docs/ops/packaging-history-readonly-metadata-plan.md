# Review31：metadata-only bundle 实现与 baseline-only 受控执行输入

本地实现，**未 push、dispatch 或访问生产**。父级 review31 已覆盖 review30 的“仅计划”限制；使用远端通道仍待父级审定代码/ref。审计34818687355仍只有 protected exit1/空日志证据，原因未知；没有重试，也不将本地复现当远端根因。

## 固定输入（交父级审，不是已执行命令）

```text
audit_object = deployed-baseline-only (SHA must equal 69d89dd44b8e1461d7eaf5193e60c994255aed2c)
workflow = production-readonly-audit.yml
ref = audit/packaging-history-metadata  # 尚未 push；须父级先审定实际提交
approve_production = APPROVE-PRODUCTION-READONLY-AUDIT
audit_mode = packaging-metadata
expected_deploy_sha = a53d91f33ff733bf28e19ca11d7491f1bfd46922
backup_directory = deploy-backups
assertion_sql_path = ""
http_assertions_path = ""
```

三文件 bundle 由来源 commit checkout 固定；workflow 传入 github.sha 作为 BUNDLE_SOURCE_COMMIT，并传 helper/SQL/manifest 的 SHA256，helper 逐文件校验后才运行。三文件不能 require/eval 任意 TS。

两项 path 必须显式为空（legacy 默认路径不适用于 metadata）。expected SHA 固定为上述审定 baseline；不接受其他 SHA 或 shell 文本。读得合法 actual SHA 时先输出真实值，不匹配立即停止，无 Docker/DB 后续探测。没有发布或修改生产工作树的步骤。

## 全 workflow 触发条件

`artifacts/review31-workflow-triggers.json` 列出全部60个 workflow 的完整 `on` 和 job `if`（基于本地源树，不声称远端已更新）。push 只有：deploy/main；ci-build、ci-security、ci-web-tests/main或w5/**；regression/v3-admin。其余没有 push。没有 tag、workflow_run 或 schedule 触发。专用 `audit/packaging-history-metadata` 分支 push 不匹配这些条件；PR 到 main 会触发相关 CI 和 deploy workflow（各 job 条件仍适用），不能把 PR 当无副作用动作。本轮未 push/开 PR/dispatch；是否允许上传工具分支由父级审定。

## 实际实现与安全边界

- `scripts/ops/readonly-audits/packaging-metadata.cjs`：独立 Node >=20、仅内置模块；不 import AppModule、不登录、不读 .env/auth/secret、不执行迁移。宿主 Node 是否已可用未知；缺失时固定错误退出，不安装或借用其他通道。
- workflow 在 legacy `exec 2>&1` **之前**进入独立 metadata 分支，stderr 指向 `/dev/null`；helper 子命令 stdout/stderr 只在内存，失败只输出固定 stage/class/exit。未知路径、运行时或 Node 语法错误也不能把原始 stderr 写进 artifact。legacy 行为单独保留，不能据此认定 legacy 全部 bundle 安全。
- metadata SCP source 精确限定 helper、SQL、manifest 三文件；不发送 legacy HTTP assertions。SSH/SCP 仅引用原有配置的 secret 名称，本轮未读取其值。
- `git rev-parse HEAD`、`git status --porcelain --untracked-files=all`：输出 SHA、dirty 布尔及数量，不输出文件路径或内容。
- `docker inspect --format` 仅固定 `phoenix-v3-api/web` 的 `.Image` 和 OCI revision label；imageID须sha256格式，label缺失/格式不符为UNKNOWN。不会 dump Config/Env；PG major 通过只读SQL `server_version_num` 取得，非18拒绝。镜像label与源码SHA的关系由审阅者判定；METADATA_COLLECTED不是“可发布”结论。
- `deploy-backups` 固定映射 `/opt/phoenix-erp-backups`，依据现有 deploy.yml 路径；不接受任意目录。逐级 lstat 拒绝父目录及条目 symlink，只 stat 根目录普通文件及一层子目录普通文件，超深或特殊文件拒绝。仅输出数量/bytes/maxmtime；不 mkdir、不读dump、不做恢复。无文件明确NO_BACKUP。df仅size/used/avail数字；容量不等于备份可恢复证明。
- 固定 DB 容器 `phoenix-v3-db`、DB `phoenix_erp`、角色 `phoenix_metadata_readonly`。通过 `docker exec ... psql -X -w` 使用现有本地连接能力，不读密码；角色/认证不存在即固定DB失败。**该角色在生产是否存在及能否无交互连接尚未知；本实现不创建角色、不改认证。**
- 每次查询均由 `packaging-metadata.sql` 开始 `BEGIN READ ONLY`、PGOPTIONS default_transaction_read_only=on、15s statement/2s lock timeout，最后ROLLBACK。先独立查询确认两个只读设置、PG18和role_safe，之后每个事务再次核验。role_safe排除超级/建库/建角色/复制/BYPASSRLS及危险文件执行角色成员、DB CREATE/TEMP、用户schema CREATE、表写/序列写和可执行用户 SECURITY DEFINER 函数；任何其他角色成员关系也拒绝，防止 NOINHERIT 隐藏 SET ROLE 写能力。有这些能力就拒绝，即使当前事务只读。
- 不执行任何生产权限反例写SQL；写权限反例只在本轮 network=none 的独立 TEST PG18 实测。

## Flags 与正式 parser 的精确关系

已读正式 `apps/api/ddl/19_seed_sys_dict.sql`，config_json 是 TEXT；全 `*.entity.ts` 搜索没有 sys_dict entity，不能凭空声称其为JSONB。实际 `PackagingWorkflowPolicy.get` 直接读取 pg 返回值，未 JSON.parse TEXT。

helper 通过 information_schema 验证四列存在且为普通无RLS表；缺表/列或RLS隐藏风险为 **schema_not_ready**，不会当全关。只读取 ACTIVE PKG_HISTORY_POLICY 的 dict_code/config_json 到内存，输出不含公司/场/原JSON/qualification/evidenceRef。

| 状态 | 含义/动作 |
|---|---|
| schema_not_ready | 无法证明配置全集可读，停止 |
| no_config | 表/列可读、零配置，effective_default_all_off=true |
| malformed | TEXT、字段类型/范围/版本/模式不符、H依赖失败或重复key，停止 |
| valid_all_off | 每条配置符合实际parser且R/B/P/V/H/Q均false |
| any_true | 原配置任一旗标true，停止；仅输出raw/effective布尔 |

Q有效值按真实嵌套 qualification.accepted/evidenceRef/acceptedAt（JS Date.parse）、PBX-v1、deviceProfile共同核验。原Q=true但资格无效仍以any_true阻断，不将其伪称全关。重复key在应用会返回disabled；metadata更保守拒绝重复，不将重复记录包装成有效配置。TEXT即便字符串内容看似JSON也malformed，与实际驱动/parser一致；本轮不改业务parser/schema。

## 迁移 manifest

`node scripts/ops/readonly-audits/packaging-metadata.cjs --manifest apps/api/src/database/migrations` 静态提取83个TS export class、显式name（若有）、timestamp及源文件sha256。禁止 require/eval TS；类名/显式name/文件timestamp不一致、空或重复均拒绝。此命令仅本地导出，不运行业务迁移。

固定候选manifest随三文件bundle传输；运行时也静态读取实际checkout TS目录，分别逐名对比 public.migrations.name：candidate pending、checkout pending、appliedOutsideCandidate（含历史SQL桥接）。不以数量相同当无pending，不调用migration:run，不推断镜像内未检查目录已经一致。

## 验收与仍待远端证据

实时测试结果/前后源码指纹及失败历史见实施报告 review31。测试覆盖实际parser、独立PG18只读设置/42501权限拒绝/25006事务拒绝、配置缺schema/类型/RLS/嵌套策略、名称对账、数据/catalog不变、注入/路径/symlink、错误SHA、UNKNOWN label和stderr隔离。Docker/image/df外部查询在组合测试中使用受控fixture，DB SQL真实执行；不得称生产容器/路径实测。

应用源码、迁移和官方Dockerfiles未改；review30的f8624273测试及Node20候选映射仍仅证明其原revision，不追認发生在本轮新SHA。生产 actualSHA、imageIDs、PGmajor、角色、目录容量、迁移与旗标仍UNKNOWN，须审定工具ref/bundle后通过合法通道取得；本轮不会dispatch。
