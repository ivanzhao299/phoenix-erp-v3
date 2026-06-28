# 宋雷 权限审计 — 2026-06-28

> 触发:昨日宋雷多个"无权限"(403)报错。经只读生产审计(audit-songlei workflow)定位。

## 一、宋雷 账号 / 角色（生产实勘）
| 项 | 值 |
|---|---|
| user_id / username | 157 / `songlei` |
| 姓名 / 状态 | 宋雷 / 启用 |
| 角色 | **ROLE_FACTORY_MGR（场区经理）** 单角色 |
| 数据范围 | COMP-LAO-AGRI（老挝凤凰农业发展有限公司）· COMPANY 级 · 主组织 |

## 二、根因：403 此前**根本没记日志** → 查不到他昨天报错的端点
`all-exceptions.filter.ts` 原逻辑:HttpException(含 403 ForbiddenException)**直接透传不写 `sys_error_logs`**("4xx 不写避免噪音")。
→ 宋雷昨日的 403 一条都没入库，错误日志页查 403 = 0 行，无法定位他到底在哪个端点被拒。

**已修复（本批）**:filter 增 403 专门记日志(`error_type=FORBIDDEN`，带 user + method + path)。
本地 smoke:cashier 越权 POST /api/uat/feedbacks → 已记 FORBIDDEN/403/cashier_smk，错误日志页 `httpStatus=403` 可筛。
→ **部署后，宋雷(及任何人)再遇 403 会被完整记录**，`/system/error-logs` 按 403 过滤即可精确定位"谁在哪个端点被拒、缺哪个菜单"。

## 三、宋雷 现有 31 项菜单授权（生产实勘）
养殖/场区:MENU_BREEDING(VCE)、MENU_FARM_DAILY(ACDEV)、MENU_FARM_DATA(VCEDA)、MENU_FARM_MASTER(VCED)、MENU_INV_SOURCE_MODE(VA)
包装/生产:MENU_PACKAGING(ACEV)、MENU_PKG_MGR(VCEA)、MENU_PKG_OP(VCEA)、MENU_PKG_PACKAGING(VCE)、MENU_PKG_COMPLETE_INVENTORY(VC)、MENU_PROD_COLLECTION(CEV)、MENU_PROD_INBOUND(VCE)
质检:MENU_QA_OP(VCEA)
库存:MENU_WMS_INOUT(CEV)、MENU_WMS_VIEW(V)
主数据(只读):MENU_MASTER_PRODUCT/GRADE/PACKAGING/SKU(V)
追溯:MENU_TRACEABILITY_VIEW/EXPORT(VX)
工作流/审批:MENU_APPROVAL(AV)、MENU_WORKFLOW_TODO(VA)、MENU_WORKFLOW_*(V)、MENU_WORKFLOW_CONFIG/RULES(V)
看板:MENU_DASHBOARD(V)、MENU_SHAREHOLDER_DASHBOARD(VX)

## 四、候选缺口（待生产 403 日志确认后精修，不擅自放权）
场区经理职责覆盖较全。对照其岗位，**最可能的缺口**:
- **MENU_DEVICE_MONITOR（设备监控/运维）** — 未授权。场区经理需看本场 IoT 设备(环境/告警),`/breeding/device-ops`、`/system/*` 设备页用此菜单 → 极可能就是昨日 403 来源之一。
- 其余:其库存为 MENU_WMS_INOUT/VIEW，若他需要盘点/调整且这些走独立菜单(如有)可能缺。

> ⚠️ 不在本批擅自放权(改 RBAC=安全敏感)。建议:**待 403-logging 部署后**，让宋雷复现操作 或 直接看 `/system/error-logs` 筛 403 → 拿到确切端点，逐条映射到所需菜单后**精确授予**(走 sys_role_menu_permission 迁移)。或你直接确认是否给 ROLE_FACTORY_MGR 补 `MENU_DEVICE_MONITOR:V`。

## 五、结论
1. **已修根因**:403 现在会被记录 → 此类问题从"查不到"变"可精确定位"。
2. **待确认**:宋雷确切 403 端点（部署后即可见）→ 再精修授权，避免盲目放权。
