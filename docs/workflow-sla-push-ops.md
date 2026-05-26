# Workflow SLA + Web Push 运维手册

> **适用版本**：Phoenix ERP V3 · Workflow 2.0 Phase F/G（2026-05-26+）

---

## 目录

1. [VAPID 密钥生成](#1-vapid-密钥生成)
2. [环境变量配置](#2-环境变量配置)
3. [Web Push 工作原理](#3-web-push-工作原理)
4. [SLA 调度器机制](#4-sla-调度器机制)
5. [PostgreSQL Advisory Lock](#5-postgresql-advisory-lock)
6. [多实例部署注意事项](#6-多实例部署注意事项)
7. [Push 订阅失效清理](#7-push-订阅失效清理)
8. [SLA 字段参考](#8-sla-字段参考)
9. [健康检查](#9-健康检查)
10. [常见问题 FAQ](#10-常见问题-faq)

---

## 1. VAPID 密钥生成

Web Push 需要一对 **VAPID（Voluntary Application Server Identification）** 密钥对。**密钥只需生成一次**，更换密钥会使所有已订阅设备失效。

### 方法 A — 使用 web-push CLI（推荐）

```bash
# 在 API 服务器或本地均可运行
cd apps/api
npx web-push generate-vapid-keys
```

输出示例：

```
=======================================
Public Key:
BG8zTHk7...（87 字符 Base64url）

Private Key:
abc123...（43 字符 Base64url）
=======================================
```

### 方法 B — 使用 Node.js 脚本

```javascript
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('Public :', keys.publicKey);
console.log('Private:', keys.privateKey);
```

### 安全注意事项

- **私钥**绝对不能提交到 Git 仓库
- 建议存储到服务器 Secret Manager 或 `.env`（.gitignore 已排除）
- 生产环境密钥和测试环境密钥应分开生成

---

## 2. 环境变量配置

在 `apps/api/.env`（或服务器环境变量）中设置：

```bash
# Web Push VAPID（必须三项均配置才会启用真实推送）
VAPID_PUBLIC_KEY=BG8zTHk7...
VAPID_PRIVATE_KEY=abc123...
VAPID_SUBJECT=mailto:admin@example.com   # 联系邮箱，推送服务商用于联系开发者

# 也可以用 https 格式
# VAPID_SUBJECT=https://yourdomain.com
```

配置后**重启 API 服务**，日志应出现：

```
[Push] VAPID configured — real push enabled
```

若未配置则输出：

```
[Push] VAPID not configured — push disabled (set VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT)
```

---

## 3. Web Push 工作原理

```
浏览器/设备                Phoenix API           推送服务（Google FCM/Mozilla等）
     │                        │                          │
     │ 1. 请求公钥             │                          │
     │ GET /push/public-key ──►│                          │
     │ ◄── publicKey ──────────│                          │
     │                        │                          │
     │ 2. 向浏览器推送服务订阅  │                          │
     │ (浏览器内部)             │                          │
     │ ◄── PushSubscription ───│                          │
     │   {endpoint,p256dh,auth}│                          │
     │                        │                          │
     │ 3. 保存订阅             │                          │
     │ POST /push/subscribe ──►│                          │
     │          (存 DB)        │                          │
     │                        │                          │
  审批事件发生               │                          │
     │         ◄── 业务触发    │                          │
     │                        │ 4. sendToUser()          │
     │                        │────────────────────────►  │
     │                        │   VAPID 签名请求          │
     │                        │ ◄──────── 201 OK ─────────│
     │ 5. Service Worker 收到  │                          │
     │ push 事件              │                          │
     │ 显示通知               │                          │
```

### sys_push_subscriptions 表结构

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| user_id | varchar | 关联用户 |
| endpoint | text | 推送服务 URL（唯一键之一） |
| p256dh | text | 加密公钥 |
| auth | text | 加密认证密钥 |
| user_agent | varchar | 浏览器标识（可选） |
| platform | varchar | 平台（可选） |
| enabled | boolean | false 表示已失效 |
| updated_at | timestamptz | 最后更新时间 |

---

## 4. SLA 调度器机制

调度器每 **15 分钟**（`:00 :15 :30 :45`）执行一次 SLA 检查，包含三个阶段：

### 阶段 1 — 标记新超期任务

```sql
UPDATE wf_approval_instance_steps
   SET is_overdue = TRUE
 WHERE status = 'PENDING'
   AND is_overdue = FALSE
   AND due_at < NOW()
```

### 阶段 2 — 发送催办通知

条件：`is_overdue = TRUE` 且 `reminder_count < max_reminders` 且距上次催办超过 `reminder_interval_hours`

每次催办：
- 创建 `TASK_REMINDER` 站内通知（`sys_notifications`）
- 向审批人发送 Web Push（若 VAPID 已配置）
- `reminder_count += 1`，更新 `last_reminded_at`

### 阶段 3 — 升级处理

条件：`is_overdue = TRUE` 且 `escalation_enabled = TRUE` 且距到期超过 `escalation_after_hours` 且 `escalation_level = 0`

升级动作：
1. 在 `wf_approval_instance_steps` 插入新行（`escalation_level = 1`，`source_task_id` 指向原步骤）
2. 向升级审批角色（`escalation_role`）发通知 + Web Push
3. 在 `wf_approval_instance_step_audit` 写入 `action = 'ESCALATE'`
4. 原步骤保持 `PENDING`（升级步骤通过后一并处理）

---

## 5. PostgreSQL Advisory Lock

为防止多实例同时运行 SLA 调度，使用 PostgreSQL Session-Level Advisory Lock：

```sql
-- 获取锁（非阻塞，返回 false 表示已被占用）
SELECT pg_try_advisory_lock(hashtext('workflow_sla_scheduler')) AS acquired;

-- 释放锁
SELECT pg_advisory_unlock(hashtext('workflow_sla_scheduler'));
```

### Lock Key 计算

```
hashtext('workflow_sla_scheduler') → int4（固定值，不同 PG 版本相同）
```

### 锁的生命周期

- Session-Level Lock 在数据库连接断开时**自动释放**
- 代码中在 `finally` 块显式释放
- 即使进程崩溃，连接池回收连接时锁也会释放

### 监控查询

```sql
-- 查看当前持有的 advisory lock
SELECT pid, pg_blocking_pids(pid) AS blocked_by,
       query, state
  FROM pg_stat_activity
 WHERE query LIKE '%pg_try_advisory_lock%'
    OR query LIKE '%pg_advisory_unlock%';

-- 查看所有 advisory lock
SELECT * FROM pg_locks
 WHERE locktype = 'advisory';
```

---

## 6. 多实例部署注意事项

Phoenix ERP API 支持水平扩展（多副本）。调度器的多实例安全通过以下两层机制保证：

| 层级 | 机制 | 范围 |
|---|---|---|
| 一级 | `running` 本地 flag | 同一进程内防并发 |
| 二级 | PostgreSQL Advisory Lock | 跨进程/跨容器防并发 |

**推荐部署策略**：

- **Kubernetes**：所有 Pod 均运行调度器，由 PG Advisory Lock 自动选主
- **PM2 多进程**：同上，无需额外配置
- **如需完全禁用某副本的调度器**：设置环境变量 `DISABLE_SLA_SCHEDULER=true`（需在代码中添加判断，当前版本未实现此选项）

---

## 7. Push 订阅失效清理

推送服务返回 `410 Gone` 或 `404 Not Found` 时，代码自动将订阅标记为 `enabled = FALSE`：

```typescript
if (status === 410 || status === 404) {
  await ds.query(`UPDATE sys_push_subscriptions SET enabled=FALSE WHERE id=$1`, [sub.id]);
}
```

### 手动清理过期订阅（运维脚本）

```sql
-- 查看失效订阅数
SELECT COUNT(*), platform FROM sys_push_subscriptions
 WHERE enabled = FALSE
 GROUP BY platform;

-- 清理 30 天前失效的订阅
DELETE FROM sys_push_subscriptions
 WHERE enabled = FALSE
   AND updated_at < NOW() - INTERVAL '30 days';
```

---

## 8. SLA 字段参考

### wf_approval_rule_steps（规则配置）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `sla_hours` | 48 | 步骤 SLA 时限（小时），超过后标记 is_overdue |
| `reminder_interval_hours` | 12 | 催办间隔（小时），每隔多久发一次催办 |
| `max_reminders` | 3 | 最大催办次数，达到后停止催办（不影响升级） |
| `escalation_enabled` | false | 是否启用升级 |
| `escalation_after_hours` | null | 到期后多久触发升级（小时），null 表示到期立即升级 |
| `escalation_role` | null | 升级后分配给哪个角色 |

### wf_approval_instance_steps（运行时状态）

| 字段 | 说明 |
|---|---|
| `due_at` | 该步骤的到期时间（`created_at + sla_hours`） |
| `is_overdue` | 是否已超期（调度器标记） |
| `reminder_count` | 已发送催办次数 |
| `last_reminded_at` | 最后一次催办时间 |
| `escalation_level` | 0=正常，1+=已升级 |
| `source_task_id` | 升级步骤指向的原始步骤 ID |

---

## 9. 健康检查

### API 端点

| 端点 | 说明 |
|---|---|
| `GET /api/notifications/push/public-key` | 获取 VAPID 公钥，`enabled: false` 表示未配置 |
| `GET /api/notifications/push/health` | Push 完整健康状态（需 MENU_WORKFLOW 权限） |
| `GET /api/workflow/metrics/overview` | Workflow KPI 汇总 |
| `GET /api/workflow/metrics/overdue-tasks` | 超期任务列表（Top 20） |
| `GET /api/workflow/metrics/escalated-tasks` | 升级任务列表（Top 20） |
| `GET /api/workflow/metrics/bottlenecks` | 瓶颈角色分析 |

### 前端健康看板

路径：`/workflow/metrics`（需 MENU_WORKFLOW V 权限）

功能：
- Push 健康状态卡片（绿色=已启用，红色=未配置）
- 6 项 KPI 卡片（待办、超期、今日完成、升级、平均时长）
- 超期 Top 20 明细表
- 升级任务明细表
- 瓶颈角色分析表

---

## 10. 常见问题 FAQ

**Q1：配置了 VAPID 但推送没有收到？**

排查步骤：
1. 确认三个环境变量均已设置，重启服务后日志有 `[Push] VAPID configured`
2. 检查浏览器是否授予了通知权限
3. 查看 `sys_push_subscriptions` 表，确认对应用户有 `enabled = TRUE` 的记录
4. 检查 API 日志有无 `[Push] send failed` 或 `[Push] subscription expired`
5. iOS Safari 需 iOS 16.4+ 且 PWA 安装后才支持 Web Push

**Q2：SLA 调度器多久运行一次，如何确认在运行？**

调度器每 15 分钟在整点触发（`:00 :15 :30 :45`）。查看 API 日志：

```
[SLA Scheduler] acquired advisory lock — starting SLA check
[SLA Scheduler] SLA check completed
[SLA Scheduler] released advisory lock
```

若看到 `skipped — another instance holds the lock` 表示其他实例正在运行，属正常。

**Q3：超期任务的 is_overdue 什么时候被设为 TRUE？**

由 `WorkflowSlaScheduler` 每 15 分钟扫描一次，不是实时的。最长延迟 15 分钟。
若需实时精确判断，可以用 `due_at < NOW()` 自行计算。

**Q4：Advisory Lock 的 key 是什么？如何防止冲突？**

Key 为 `hashtext('workflow_sla_scheduler')` 的 int4 值（PostgreSQL 内置函数）。
不同应用如果也使用 Advisory Lock，应确保使用不同的字符串以避免 hash 碰撞（极低概率）。
可通过 `SELECT hashtext('workflow_sla_scheduler')` 查看实际 key 值。

**Q5：升级后原始步骤还需要人工处理吗？**

升级步骤（`escalation_level = 1`）通过审批后，系统会同时将原始步骤标记为 `APPROVED`（通过升级关联 `source_task_id` 联动）。
具体联动逻辑在 `ApprovalEngineService.approve()` 中实现。

**Q6：如何彻底禁用某个实例的 SLA 调度？**

当前版本无开关，可通过在 `handleSlaCheck` 方法顶部添加环境变量判断实现：

```typescript
if (process.env.DISABLE_SLA_SCHEDULER === 'true') return;
```

**Q7：VAPID 密钥需要定期轮换吗？**

不需要定期轮换。密钥轮换会导致所有现有订阅失效，用户需要重新订阅推送。
只有在私钥泄露时才需要紧急轮换。

---

*文档维护：Phoenix ERP 平台团队 | 最后更新：2026-05-26*
