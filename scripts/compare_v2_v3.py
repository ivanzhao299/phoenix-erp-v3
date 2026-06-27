#!/usr/bin/env python3
"""
Phoenix ERP — V2 SQLite vs V3 PostgreSQL 表/字段对比分析
基于审计报告字段映射规则，输出匹配情况
用法: python3 compare_v2_v3.py --sqlite /path/to/phoenix.sqlite
"""
import os, sqlite3, argparse, sys

try:
    import psycopg2
except ImportError:
    print("请先: pip3 install psycopg2-binary"); sys.exit(1)

PG_CONFIG = dict(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "5432")),
    user=os.getenv("DB_USER", "mac"),
    password=os.getenv("DB_PASSWORD", ""),
    dbname=os.getenv("DB_NAME", "phoenix_erp"),
)

# 表名映射规则（与迁移脚本一致）
TABLE_REMAP = {
    "sys_users":                     "sys_user",
    "sys_roles":                     "sys_role",
    "b2b_customers":                 "ord_customers",
    "b2b_orders":                    "ord_orders",
    "b2b_order_items":               "ord_order_items",
    "farm_device_property_dict":     "mon_device_property_dict",
    "farm_device_realtime_snapshot": "mon_device_realtime_snapshot",
    "farm_device_alert_event":       "mon_device_alert_event",
    "farm_device_property_daily_agg":"mon_device_property_daily_agg",
    "farm_house_interface_mapping":  "mon_house_device_mapping",
}

# 字段重命名规则
FIELD_REMAP = {
    "brd_flocks":           {"breed": "strain", "hatch_date": "placement_date"},
    "brd_immune_plans":     {"vaccine_name": "vaccine"},
    "brd_medication_records":{"medicine_name": "drug_name"},
    "ord_customers":        {"contact_name": "contact", "contact_phone": "phone"},
    "ord_prices":           {"sku_code": "product_code", "unit_price": "price"},
    "qa_non_conformance":   {"nc_no": "ncr_no", "issue_type": "source", "action_taken": "description"},
    "qa_inspections":       {"check_time": "inspect_date"},
    "log_receipts":         {"dispatch_no": "wave_no"},
}

SKIP = {"schema_migrations", "sqlite_sequence"}

def main(sqlite_path):
    print(f"\n🔌 读取 V2 SQLite: {sqlite_path}")
    sq = sqlite3.connect(sqlite_path)

    # 读取 V2 所有表和列
    v2_tables = {}
    for (tbl,) in sq.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        cols = {r[1] for r in sq.execute(f"PRAGMA table_info(\"{tbl}\")")}
        v2_tables[tbl] = cols
    sq.close()
    print(f"   V2 共 {len(v2_tables)} 张表")

    print(f"🔌 读取 V3 PostgreSQL: {PG_CONFIG['dbname']}@{PG_CONFIG['host']}")
    pg = psycopg2.connect(**PG_CONFIG)
    cur = pg.cursor()
    cur.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema='public'
        ORDER BY table_name, ordinal_position
    """)
    v3_tables = {}
    for tbl, col in cur.fetchall():
        v3_tables.setdefault(tbl, set()).add(col)
    pg.close()
    print(f"   V3 共 {len(v3_tables)} 张表\n")

    # ── 对比 ─────────────────────────────────────────────────────
    matched   = []   # (v2_tbl, v3_tbl, matched_cols, v2_only, v3_only)
    no_v3     = []   # V2 有，V3 无
    remap_log = []   # 应用了重命名的字段

    for v2_tbl, v2_cols in sorted(v2_tables.items()):
        if v2_tbl in SKIP:
            continue
        v3_tbl = TABLE_REMAP.get(v2_tbl, v2_tbl)
        if v3_tbl not in v3_tables:
            no_v3.append((v2_tbl, v3_tbl))
            continue

        v3_cols = v3_tables[v3_tbl]
        field_remap = FIELD_REMAP.get(v2_tbl, {})

        # 对 V2 列应用字段重命名
        mapped_v2 = {}
        for c in v2_cols:
            mapped = field_remap.get(c, c)
            mapped_v2[c] = mapped
            if mapped != c:
                remap_log.append(f"  {v2_tbl}.{c} → {v3_tbl}.{mapped}")

        # 计算交集
        v2_mapped_set  = set(mapped_v2.values())
        common         = v2_mapped_set & v3_cols
        v2_only        = v2_mapped_set - v3_cols
        v3_only        = v3_cols - v2_mapped_set

        matched.append((v2_tbl, v3_tbl, common, v2_only, v3_only))

    # ── 输出报告 ─────────────────────────────────────────────────
    print("=" * 70)
    print(f"✅ 可迁移表：{len(matched)} 张（V2 & V3 均存在）")
    print("=" * 70)
    total_common = total_v2only = total_v3only = 0
    for v2t, v3t, common, v2only, v3only in matched:
        label = f"{v2t}" + (f" → {v3t}" if v2t != v3t else "")
        print(f"\n  [{label}]")
        print(f"    ✓ 匹配列: {len(common):3d}  |  V2独有(不迁移): {len(v2only):3d}  |  V3独有(留空): {len(v3only):3d}")
        if v2only:
            print(f"    V2独有: {sorted(v2only)}")
        total_common  += len(common)
        total_v2only  += len(v2only)
        total_v3only  += len(v3only)

    print(f"\n{'='*70}")
    print(f"汇总: 匹配列 {total_common} | V2独有(忽略) {total_v2only} | V3独有(留NULL) {total_v3only}")

    if remap_log:
        print(f"\n🔄 应用字段重命名规则 {len(remap_log)} 处:")
        for r in remap_log:
            print(r)

    print(f"\n{'='*70}")
    print(f"❌ V3 中不存在的表：{len(no_v3)} 张（需补 DDL 才能迁移）")
    print("=" * 70)
    for v2t, v3t in no_v3:
        note = f"（目标名: {v3t}）" if v2t != v3t else ""
        print(f"  - {v2t} {note}")

    print(f"\n✅ 确认后运行迁移:")
    print(f"  python3 migrate_v2_to_v3.py --sqlite \"{sqlite_path}\"")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", required=True)
    ap.add_argument("--pg-host",     default=PG_CONFIG["host"])
    ap.add_argument("--pg-port",     default=str(PG_CONFIG["port"]))
    ap.add_argument("--pg-user",     default=PG_CONFIG["user"])
    ap.add_argument("--pg-password", default=PG_CONFIG["password"])
    ap.add_argument("--pg-db",       default=PG_CONFIG["dbname"])
    args = ap.parse_args()
    PG_CONFIG.update(dict(host=args.pg_host, port=int(args.pg_port),
        user=args.pg_user, password=args.pg_password, dbname=args.pg_db))
    main(args.sqlite)
