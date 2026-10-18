# 隔离数据库夹具的最终主进程准入

PR #418 的 hosted run 39114864381 attempt 1 在 PG16 初始 facts 查询处返回通用命令错误。原日志没有原始错误分类，因此该次失败的精确根因仍 UNVERIFIED。本修复不以推断代替历史根因证据。

独立核对发现真实准入缺口：PostgreSQL 官方镜像初始化阶段的临时数据库同样可以令 `pg_isready` 返回成功，health-only 判定不能证明最终服务已启动。夹具现要求 healthy 且容器 PID1 的 comm 为 postgres，随后才查询身份。该条件只用于本测试已固定的官方镜像入口，不推广为任意生产服务排空或启动证明。

测试给自有 PG16.14/PG18 容器挂只读、唯一临时初始化 SQL `SELECT pg_sleep(3)`，强制暴露 `healthy && PID1!=postgres`。必须实际观察这一反例，再观察最终 PID1 与成功 facts 查询；原先只读观察、真实连接、事务、prepared transaction、身份漂移、权限不足和清理反例均保留。

Node 20 实跑两个镜像共20 PASS/0 SKIP。容器网络 none、无hostport、数据只在临时tmpfs；不连接生产。测试结束先核完整容器ID与随机owner标签，再停止并移除其容器，确认owner清单为空；删除唯一测试SQL与空临时目录。独立只读复核无P0/P1，未冒充复跑Docker。原失败日志和新成功收据分别保留。

本变更只有隔离测试和报告，不改生产观察器、安全门禁、生产数据库或发布授权。
