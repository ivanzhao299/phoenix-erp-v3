#!/usr/bin/env python3
"""
Phoenix ERP — V2 SQLite → V3 PostgreSQL 智能迁移脚本
基于今天（2026-05-10）的字段审计报告，按实际字段映射规则迁移数据。
用法: python3 migrate_v2_to_v3.py --sqlite /path/to/phoenix.sqlite
"""
import sqlite3, argparse, sys
from datetime import datetime

try:
    import psycopg2, psycopg2.extras
except ImportError:
    print("请先: pip3 install psycopg2-binary"); sys.exit(1)

PG_CONFIG = dict(host="127.0.0.1", port=5432, user="mac", password="", dbname="phoenix_erp")

# ══════════════════════════════════════════════════════════════════
# 审计报告中的字段重命名规则 (V2字段名 → V3字段名)
# ══════════════════════════════════════════════════════════════════
FIELD_REMAP = {
    "brd_flocks": {
        "breed":        "strain",
        "hatch_date":   "placement_date",
    },
    "brd_immune_plans": {
        "vaccine_name": "vaccine",
    },
    "brd_medication_records": {
        "medicine_name": "drug_name",
    },
    "sys_users": {
        "real_name_zh": "real_name",   # V3 用 real_name，V2 用 real_name_zh
    },
    "ord_customers": {
        "contact_name":  "contact",
        "contact_phone": "phone",
    },
    "ord_prices": {
        "sku_code":   "product_code",
        "unit_price": "price",
    },
    "qa_non_conformance": {
        "nc_no":       "ncr_no",
        "issue_type":  "source",
        "action_taken":"description",
    },
    "qa_inspections": {
        "check_time":  "inspect_date",
    },
    "log_receipts": {
        "dispatch_no": "wave_no",
    },
}

# ══════════════════════════════════════════════════════════════════
# 表名映射 (V2表名 → V3 PostgreSQL表名)
# ══════════════════════════════════════════════════════════════════
TABLE_REMAP = {
    # V2 Express 复数名 → V3 NestJS 单数/重命名
    "sys_users":                    "sys_user",
    "sys_roles":                    "sys_role",
    # B2B 表 → 订单表 (V3合并)
    "b2b_customers":                "ord_customers",
    "b2b_orders":                   "ord_orders",
    "b2b_order_items":              "ord_order_items",
    # Farm IoT → mon_ 前缀
    "farm_device_property_dict":    "mon_device_property_dict",
    "farm_device_realtime_snapshot":"mon_device_realtime_snapshot",
    "farm_device_alert_event":      "mon_device_alert_event",
    "farm_device_property_daily_agg":"mon_device_property_daily_agg",
    "farm_house_interface_mapping": "mon_house_device_mapping",
    "farm_device_info":             "mon_house_device_mapping",
}

# 跳过这些 V2 表
SKIP_TABLES = {
    "schema_migrations", "sqlite_sequence",
    "b2b_customers",           # PK 与 V3 不兼容
    "crm_members",             # member_id 为 NULL
    "farm_device_alert_event", # bigint 字段存timestamp字符串
    "farm_device_info",        # 缺少 erp_farm_code
    "sys_audit_log",           # user_id NULL
    "sys_approval_flows",      # flow_code NULL
    "mon_device_alert_event",  # bigint字段存timestamp字符串
}

# 特定表的特定列跳过（类型不兼容）
TABLE_SKIP_COLS = {
    "sys_users":          {"status"},
    "sys_roles":          {"permissions"},
    "ord_orders":         {"sales_rep", "need_price_approval",
                           "need_credit_approval", "is_urgent"},
    # V2 存的是 "08:35" 时间字符串，V3 对应列是 DATE 类型，不兼容
    "wms_inbound":        {"arrive_time", "arrival_time", "inbound_time",
                           "receive_time", "time_in", "scheduled_time",
                           "plan_time", "expect_time"},
}

# 特定表缺少的 NOT NULL 列，提供迁移时的默认值
COL_DEFAULTS = {
    "sys_roles":   {"role_type":   "custom"},
    "wms_inbound": {"task_no":    lambda row: f"WMS-MIG-{row.get('inbound_no', 'NA')}"},
    "ord_orders":  {"store_code": "DEFAULT"},
    "sys_users":   {
        "updated_at": lambda row: row.get("created_at") or datetime.utcnow().isoformat(),
    },
}

# 布尔类型转换（V2 用 0/1，V3 用 boolean）
BOOL_COLS = {
    "qa_inspection_items": {"is_pass"},
}

# ══════════════════════════════════════════════════════════════════
# 工具函数
# ══════════════════════════════════════════════════════════════════
def now():
    return datetime.utcnow().isoformat()

def get_pg_tables(cur):
    """获取 V3 所有表的列名、数据类型，以及自增PK列"""
    # 所有列及数据类型
    cur.execute("""
        SELECT table_name, column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
    """)
    pg_cols  = {}  # table -> set of col names
    pg_types = {}  # table -> {col: udt_name}
    for table, col, udt in cur.fetchall():
        pg_cols.setdefault(table, set()).add(col)
        pg_types.setdefault(table, {})[col] = udt

    # 有默认值的自增PK列（跳过，让PG自动生成）
    cur.execute("""
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.table_constraints tc
          ON tc.table_name   = c.table_name
         AND tc.table_schema = c.table_schema
         AND tc.constraint_type = 'PRIMARY KEY'
        JOIN information_schema.key_column_usage kcu
          ON kcu.table_name      = c.table_name
         AND kcu.table_schema    = c.table_schema
         AND kcu.constraint_name = tc.constraint_name
         AND kcu.column_name     = c.column_name
        WHERE c.table_schema = 'public'
          AND c.column_default IS NOT NULL
    """)
    pg_auto = {}
    for table, col in cur.fetchall():
        pg_auto.setdefault(table, set()).add(col)

    return pg_cols, pg_auto, pg_types

def migrate_table(sq, pg_cur, v2_table, v3_table, pg_cols, pg_auto, pg_types, field_remap):
    """迁移单张表：取 V2 和 V3 列的交集（含字段重命名），批量 INSERT"""
    try:
        rows = sq.execute(f'SELECT * FROM "{v2_table}"').fetchall()
    except Exception as e:
        print(f"  ⚠ 读取 {v2_table} 失败: {e}")
        return 0

    if not rows:
        print(f"  ○ {v2_table} 无数据，跳过")
        return 0

    sample         = rows[0]
    skip_cols      = TABLE_SKIP_COLS.get(v2_table, set()) | TABLE_SKIP_COLS.get(v3_table, set())
    col_defaults   = COL_DEFAULTS.get(v2_table, COL_DEFAULTS.get(v3_table, {}))
    bool_cols      = BOOL_COLS.get(v2_table, BOOL_COLS.get(v3_table, set()))
    tbl_types      = pg_types   # 已经是该表的 {col: udt_name}，不需再 get

    # 建立 V2列名 → V3列名 映射
    col_map = {}  # v2_col → v3_col（保证 v3_col 不重复）
    used_v3 = set()  # 防止重复列（如 ncr_no 出现两次）
    for v2_col in sample.keys():
        v3_col = field_remap.get(v2_col, v2_col)
        if v3_col in skip_cols:          continue  # 类型不兼容列
        if v3_col in pg_auto:            continue  # 自增PK
        if v3_col not in pg_cols:        continue  # V3 无此列
        if v3_col in used_v3:            continue  # 防重复（如 ncr_no）
        col_map[v2_col] = v3_col
        used_v3.add(v3_col)

    # 加入缺少但必填的默认列
    extra_defaults = {}  # v3_col → value
    for v3_col, default in col_defaults.items():
        if v3_col not in used_v3 and v3_col in pg_cols:
            extra_defaults[v3_col] = default

    if not col_map and not extra_defaults:
        print(f"  ✗ {v2_table} → {v3_table}: 无匹配字段，跳过")
        return 0

    # 构建 SQL
    all_v3_cols = list(col_map.values()) + list(extra_defaults.keys())
    placeholders = ",".join(["%s"] * len(all_v3_cols))
    col_names    = ",".join(f'"{c}"' for c in all_v3_cols)
    sql = f'INSERT INTO "{v3_table}" ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    def coerce(v2_col, v3_col, val):
        """V2 值 → V3 类型安全转换"""
        if v3_col in bool_cols:
            return bool(val) if val is not None else None
        udt = tbl_types.get(v3_col, '')
        if udt in ('int2','int4','int8','bigint','smallint') and isinstance(val, str):
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return None
        return val


    inserted = 0
    first_err = None
    skipped_null = 0
    for row in rows:
        vals = [coerce(v2c, col_map[v2c], row[v2c]) for v2c in col_map.keys()]
        # 加入默认列的值
        for v3_col, default in extra_defaults.items():
            vals.append(default(row) if callable(default) else default)
        # 跳过所有必填列都为 NULL 的行
        if all(v is None for v in vals):
            skipped_null += 1
            continue
        try:
            pg_cur.execute("SAVEPOINT sp1")
            pg_cur.execute(sql, vals)
            cnt = pg_cur.rowcount
            pg_cur.execute("RELEASE SAVEPOINT sp1")
            if cnt > 0:
                inserted += cnt
        except Exception as e:
            if first_err is None:
                first_err = str(e)
            try:
                pg_cur.execute("ROLLBACK TO SAVEPOINT sp1")
                pg_cur.execute("RELEASE SAVEPOINT sp1")
            except Exception:
                pass

    mapped_info = f"映射 {len(col_map)}/{len(sample.keys())} 列"
    status = "✅" if inserted > 0 else ("⚠" if first_err else "○")
    skip_note = f", 跳过NULL行 {skipped_null} 条" if skipped_null else ""
    print(f"  {status} {v2_table} → {v3_table}: {inserted}/{len(rows)} 条  ({mapped_info}{skip_note})")
    if first_err and inserted == 0:
        print(f"    ↳ 错误: {first_err[:150]}")
    return inserted

# ══════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════
def migrate(sqlite_path):
    print(f"\n🔌 连接 SQLite: {sqlite_path}")
    sq = sqlite3.connect(sqlite_path)

    print(f"🔌 连接 PostgreSQL: {PG_CONFIG['dbname']}@{PG_CONFIG['host']}")
    pg = psycopg2.connect(**PG_CONFIG)
    pg.autocommit = False
    cur = pg.cursor()

    # 获取 V3 所有表和列
    pg_tables, pg_auto, pg_types = get_pg_tables(cur)
    print(f"📋 V3 PostgreSQL 共有 {len(pg_tables)} 张表")

    # 获取 V2 所有表（不用 row_factory，直接用元组）
    v2_tables = [r[0] for r in sq.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()]
    # 设置 dict row_factory（仅用于业务数据读取）
    sq.row_factory = lambda cursor, row: {
        col[0]: row[idx] for idx, col in enumerate(cursor.description)
    }
    print(f"📋 V2 SQLite 共有 {len(v2_tables)} 张表\n")

    total = 0
    skipped = []

    for v2_tbl in v2_tables:
        if v2_tbl in SKIP_TABLES:
            continue

        # 确定目标 V3 表名
        v3_tbl = TABLE_REMAP.get(v2_tbl, v2_tbl)

        # 如果 V3 不存在该表，记录并跳过
        if v3_tbl not in pg_tables:
            skipped.append((v2_tbl, v3_tbl))
            continue

        # 字段重命名规则（用 v2_tbl 的规则，也兼容 v3_tbl）
        field_remap = FIELD_REMAP.get(v2_tbl, FIELD_REMAP.get(v3_tbl, {}))

        pg_cols_for_table = pg_tables[v3_tbl]
        pg_auto_for_table = pg_auto.get(v3_tbl, set())
        pg_types_for_table = pg_types.get(v3_tbl, {})
        n = migrate_table(sq, cur, v2_tbl, v3_tbl, pg_cols_for_table, pg_auto_for_table, pg_types_for_table, field_remap)
        total += n

    pg.commit()
    sq.close()
    pg.close()

    print(f"\n{'='*60}")
    print(f"🎉 迁移完成！共写入 {total} 条数据")

    if skipped:
        print(f"\n⚠ 以下 {len(skipped)} 张表在 V3 中不存在，已跳过（可按需补建 DDL）：")
        for v2, v3 in skipped:
            note = f"（目标: {v3}）" if v2 != v3 else ""
            print(f"   - {v2} {note}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite",      required=True)
    parser.add_argument("--pg-host",     default="127.0.0.1")
    parser.add_argument("--pg-port",     default="5432")
    parser.add_argument("--pg-user",     default="mac")
    parser.add_argument("--pg-password", default="")
    parser.add_argument("--pg-db",       default="phoenix_erp")
    args = parser.parse_args()
    PG_CONFIG.update(dict(
        host=args.pg_host, port=int(args.pg_port),
        user=args.pg_user, password=args.pg_password, dbname=args.pg_db,
    ))
    migrate(args.sqlite)
