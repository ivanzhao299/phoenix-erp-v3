#!/usr/bin/env bash
# ============================================================
# Shareholder Runtime Phase 1 — 生产只读验收（在服务器 /opt/phoenix-erp 运行）
# 纯 SELECT，不写库、不开事务。用法：
#   cd /opt/phoenix-erp && bash scripts/shr-phase1-validate.sh
# ============================================================
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
psql() { docker compose exec -T db sh -c 'psql -tA -F"|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

echo "════ 生产 HEAD ════"; git rev-parse --short HEAD; git log -1 --oneline

echo "════ ② 5 表行数 ════"
echo "SELECT 'shr_projects',count(*) FROM shr_projects
UNION ALL SELECT 'shr_shareholders',count(*) FROM shr_shareholders
UNION ALL SELECT 'shr_project_equity',count(*) FROM shr_project_equity
UNION ALL SELECT 'shr_capital_contributions',count(*) FROM shr_capital_contributions
UNION ALL SELECT 'shr_shareholder_scopes',count(*) FROM shr_shareholder_scopes ORDER BY 1;" | psql

echo "════ ③ 项目 ════"
echo "SELECT project_code,project_name,project_type,capital_status,status FROM shr_projects ORDER BY project_code;" | psql

echo "════ ④ 股东(7) ════"
echo "SELECT shareholder_code,shareholder_name,status,(linked_user_id IS NOT NULL) AS has_user FROM shr_shareholders ORDER BY shareholder_code;" | psql

echo "════ ⑤ 股比合计(应 100/PASS) ════"
echo "SELECT project_code,sum(equity_ratio),CASE WHEN abs(sum(equity_ratio)-100)<=0.01 THEN 'PASS' ELSE 'FAIL' END FROM shr_project_equity GROUP BY project_code ORDER BY 1;" | psql

echo "════ ⑥ 查看范围(应 6 条，含朱召安东鹏) ════"
echo "SELECT u.username,s.scope_type,coalesce(s.project_code,'(全部)'),coalesce(s.scope_code,'-') FROM shr_shareholder_scopes s JOIN sys_user u ON u.user_id=s.user_id ORDER BY u.username,s.project_code;" | psql

echo "════ ⑧ 权限菜单注册 + 授权 ════"
echo "SELECT m.menu_code,m.route,count(p.*)::int AS grants FROM sys_menu m LEFT JOIN sys_role_menu_permission p ON p.menu_id=m.menu_id WHERE m.domain='SHAREHOLDER' GROUP BY m.menu_code,m.route,m.sort_order ORDER BY m.sort_order;" | psql

echo "════ ⑨ Finance V2 隔离(shr 独立，fin_shareholder_* 不受影响) ════"
echo "SELECT 'shr_capital_contributions',count(*) FROM shr_capital_contributions
UNION ALL SELECT 'fin_shareholder_contributions',count(*) FROM fin_shareholder_contributions
UNION ALL SELECT 'fin_shareholder_settlements',count(*) FROM fin_shareholder_settlements;" | psql

echo "════ ⑩ Scope fail-safe（无 scope 用户示例：随便取一个非股东用户，应无 scope 行）════"
echo "SELECT count(*) AS scope_rows_for_non_shareholder FROM shr_shareholder_scopes s JOIN sys_user u ON u.user_id=s.user_id WHERE u.username='liushanjun';" | psql

echo "════ 完成。核对：5表行数(3/7/12/0/6)、3项目、7股东、股比3×PASS、范围6条含朱召安、菜单5×授权、fin表不受影响 ════"
