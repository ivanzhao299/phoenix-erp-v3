# PKG_HISTORY_POLICY 旗标启用 runbook

本 runbook 只描述经批准后的操作顺序，不执行生产配置、不改变旗标，也不代表 Q/L4 已验收。

## 配置契约

`sys_dict` 中使用 `dict_type='PKG_HISTORY_POLICY'`、精确 `dict_code='<companyCode>:<siteCode>'`、`status='ACTIVE'`。`config_json` 必须是对象并至少包含：

```json
{
  "companyCode": "COMPANY",
  "siteCode": "SITE",
  "version": "2026-09-15.v1",
  "receiptMode": "C",
  "R": false, "B": false, "P": false, "V": false, "H": false, "Q": false
}
```

Parser 要求 company/site 与 `dict_code` 完全相等、`receiptMode` 为 `C`、version 非空、六个旗标为 boolean。Q 的有效计算还要求 `encodingVersion`、非空 `deviceProfile` 及 qualification 三字段；H 必须满足 R、B、P、V、Q。配置缺失为 `no_config`，非法对象为 `malformed`，任意真实启用旗标未经资格核验均拒绝。

## 启用顺序

1. 先在明确的 TEST company/site 建立隔离配置并运行 metadata-only 审计。
2. 观察只读接口、打印/扫码证据、错误率、事件和库存对账；无生产业务写入。
3. 每个正式 site 单独审批、单独变更、单独观察，不使用跨 site 继承或通配配置。
4. 只有 Q/L4 证据齐全并获得用户批准后，才可考虑 H；R/B/P/V 的启用也必须逐站审批。

## 每次变更前后检查

- 变更前 metadata 状态为 `no_config` 或 `valid_all_off`；记录 company/site 和配置版本。
- 变更后只读审计必须返回 `valid_all_off` 或经批准的精确有效状态；不得出现 `malformed`、`schema_not_ready` 或跨站匹配。
- 验证 `role_safe=true`、事务只读、PG major、pending migration、镜像 revision、dirty 和备份摘要；任何失败 fail-closed。
- 变更窗口保留事件、箱身份、claims、operations 和审计日志；不使用 down/覆盖数据库恢复来回退旗标。

旗标写入属于生产变更，必须由用户/维护者另行批准。本 runbook 不包含 SQL、dispatch 或 secret 操作。
