# Review30：只读审计诊断修复与 metadata bundle 待审计划

本地方案，不是 dispatch 指令或生产执行记录。34818687355 仅 known protected exit1/空stdout，原因未知；本轮未重试。现本地代码增加输入/目录/revision/SQL/日志/归档阶段失败码，workflow显式捕获stderr并给cd/runner缺失固定诊断；不打印BASH_COMMAND、环境或secret。15本地shell fixture覆盖原空日志复现、修后阶段、早期install/runID、输入文件/HTTP方法、日志读取失败、wrapper路径和stderr。另用cd函数fixture验证默认路径~/phoenix-erp的引号不会触发tilde展开；现只展开开头~/为既有HOME，不eval、不猜host。静默git失败是可重复反例，**不是远端根因结论**。

另核实既有HTTP validation在相对bundle='.'时用require('scripts/...')不能按文件加载，现path.resolve后校验真实文件；原Docker logs失败曾被`|| true`当零，主通用计数现保留原退出码、仅内存计数不输出日志payload。其他legacy HTTP bundle仍需要各自独立安全审查，不能把本轮诊断修复当全库审计安全认证。

## 新 metadata-only 入口拟议契约（未实现/未执行）

父级审完整shell/SQL内容与ref后方可实施/使用新入口。现已存在的远端main没有这些能力；不得为了启用它提前push main触发部署。当前本地诊断workflow变更也未上传。若将来需新增远端审计ref，应先确认分支push是否触发其他workflow，父级明确批准该ref/bundle后才能推进。

拟新增workflow输入：`audit_mode` choice=`legacy|packaging-metadata`（默认legacy保持兼容），metadata模式强制SQL/HTTP path inputs为空；`expected_deploy_sha`要求40hex，`backup_directory`只能从维护者预先登记白名单选一个逻辑名称，不能输入任意shell。runner固定调用审定metadata helper；HTTP/AppModule/login/TypeORM migration:run禁止执行。SCP只传审定helper及SQL文件，不上传auth/env/业务payload。

固定输出契约：

| 阶段 | 只读命令/精确字段 | 失败行为 |
|---|---|---|
| CHECKOUT | `git rev-parse HEAD`，与expected_deploy_sha精确比较；`git status --porcelain --untracked-files=all`仅在内存计数，输出dirty:boolean、count；不输出文件内容/路径 | 非0或SHA不符终止，不自动切分支/reset/清理 |
| IMAGES | `docker inspect --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}' phoenix-v3-api`及web；仅image ID、revision；另以固定image ID做image inspect仅RepoDigests | 缺容器/label未知明确UNKNOWN，不dump .Config/.Env |
| CAPACITY | `df -B1 --output=size,used,avail`对已审部署目录和backup目录，仅3个数字；备份目录只stat经登记普通文件的size/mtime和计数，总bytes/maxmtime，不读dump内容、不跟随任意symlink | 无目录/无备份单列FAIL/NO_BACKUP；不得据free bytes自动宣称可恢复 |
| DB_IDENTITY | 通过现有DB容器内POSTGRES_USER/DB运行`psql -X -v ON_ERROR_STOP=1`，PGOPTIONS default_transaction_read_only=on，BEGIN READ ONLY，timeout30s/lock5s | 两个read-only设置必须on，否则fail；不打印凭据 |
| MIGRATIONS | DB只SELECT migrations.name ORDER BY name；宿主仅读取`apps/api/src/database/migrations`文件名清单，API固定容器仅`dist/database/migrations`文件名；用审定候选manifest的TypeORM类名与DB名字集合做差 | TS文件名不直接等于类名，不拿目录数相等当零pending；不加载AppModule或执行migration命令；manifest未知则partial |
| FLAGS | 只查`sys_dict`中`dict_type='PKG_HISTORY_POLICY' AND status='ACTIVE'`的count、每个R/B/P/V/H/Q的any-true及非boolean/重复key计数；不输出config_json、qualification、evidenceRef、company/site文本或其他字典 | 缺配置输出configured=0且effective_default_all_off=true；任一true/类型未知/重复记录均阻断，不开旗 |

审定SQL模板仅输出metadata（具体helper和参数化路径必须实现后再审，不可直接拿本页执行）：

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('default_transaction_read_only') AS default_read_only,
       current_setting('server_version_num') AS server_version_num;
SELECT name FROM public.migrations ORDER BY name;
SELECT count(*) AS configured_rows,
       count(*) FILTER (WHERE jsonb_typeof(config_json->'R') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(config_json->'B') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(config_json->'P') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(config_json->'V') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(config_json->'H') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(config_json->'Q') IS DISTINCT FROM 'boolean') AS malformed_flags,
       COALESCE(bool_or(config_json->'R' = 'true'::jsonb), false) AS any_r,
       COALESCE(bool_or(config_json->'B' = 'true'::jsonb), false) AS any_b,
       COALESCE(bool_or(config_json->'P' = 'true'::jsonb), false) AS any_p,
       COALESCE(bool_or(config_json->'V' = 'true'::jsonb), false) AS any_v,
       COALESCE(bool_or(config_json->'H' = 'true'::jsonb), false) AS any_h,
       COALESCE(bool_or(config_json->'Q' = 'true'::jsonb), false) AS any_q
FROM public.sys_dict WHERE dict_type='PKG_HISTORY_POLICY' AND status='ACTIVE';
SELECT count(*) AS duplicate_policy_keys FROM (
  SELECT dict_code FROM public.sys_dict
  WHERE dict_type='PKG_HISTORY_POLICY' AND status='ACTIVE'
  GROUP BY dict_code HAVING count(*)>1
) d;
ROLLBACK;
```

Flags结果仅证明“无已存true新写开关”的保守门禁，不推导所有config合法或物理Q合格。类型/公司场匹配/版本等完整策略仍按现应用解析；不得输出原JSON来诊断。未配置默认全关依据已验应用逻辑，不凭缺行虚构生产代码版本。

候选迁移manifest应由被审构建的tracked TS类名/时间戳静态导出，记录文件hash；DB已有类名与manifest逐项比对，多余/缺失分别输出名字，既有冻结SQL桥接项不能直接与文件数量比较。PG major不是18时停止评审，不随功能升级DB。

本页不含任何现有host/key/token/password值，不读取旧认证artifact。下一阶段只有在父级审定helper源码、输入、remote可用ref之后才能dispatch；本轮仅本地诊断测试和方案交付。
