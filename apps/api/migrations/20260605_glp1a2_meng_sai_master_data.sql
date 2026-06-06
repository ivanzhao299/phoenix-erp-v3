-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 主数据 seed — 老挝凤凰农业 · 孟赛蛋鸡场（apps/api 镜像，2026-06-06）
-- ═════════════════════════════════════════════════════════════════════════════
-- 镜像自 migrations/20260605_glp1a2_meng_sai_master_data.sql（根目录手动版）。
-- CI 兜底：若关键业务表（brd_farms）不存在（CI 测试库无 brd_*），整体跳过。
-- 生产端会跑（已 ETL 写过的行靠 NOT EXISTS 守卫不重复）。
--
-- 关键修正（vs 历史版）：house_code 由 LPH_MS_H1..H6 改为 HOUSE_MS_01..06
-- 与生产 DB + ETL（scripts/glp1a3_etl_mengsai_initial.py HOUSE_MAP）一致。
-- ═════════════════════════════════════════════════════════════════════════════

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='brd_farms') THEN
    RAISE NOTICE '[glp1a2_meng_sai] brd_farms 不存在（CI 测试环境），整 mig 跳过';
    RETURN;
  END IF;

  -- 1. brd_farms
  EXECUTE $$INSERT INTO brd_farms (farm_code, farm_name, location, status, houses, capacity, updated_at, store_code)
            SELECT 'LPH_MENGSAI', '孟赛蛋鸡场', '老挝 · 北部 · 孟赛', 'ACTIVE', 6, 250000, CURRENT_TIMESTAMP, 'LPH'
            WHERE NOT EXISTS (SELECT 1 FROM brd_farms WHERE farm_code='LPH_MENGSAI')$$;

  -- 2. brd_houses (HOUSE_MS_01..06, 与生产 DB 对齐)
  EXECUTE $$INSERT INTO brd_houses (house_code, house_name, farm_code, farm_name, house_type, capacity, current_birds, status, updated_at)
            SELECT v.code, v.name, 'LPH_MENGSAI', '孟赛蛋鸡场', 'LAYING', v.cap, v.cur, 'ACTIVE', CURRENT_TIMESTAMP
            FROM (VALUES
              ('HOUSE_MS_01','1号鸡舍',45000,0),
              ('HOUSE_MS_02','2号鸡舍',46000,45551),
              ('HOUSE_MS_03','3号鸡舍',40000,37336),
              ('HOUSE_MS_04','4号鸡舍',45000,43816),
              ('HOUSE_MS_05','5号鸡舍',44000,42368),
              ('HOUSE_MS_06','6号鸡舍',43000,41500)
            ) v(code, name, cap, cur)
            WHERE NOT EXISTS (SELECT 1 FROM brd_houses h WHERE h.house_code=v.code)$$;

  -- 3. brd_flocks (LPH_MS_F02..F06 不变)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='brd_flocks') THEN
    EXECUTE $$INSERT INTO brd_flocks (flock_no, house_code, farm_code, strain, placement_date, placement_age, initial_qty, current_qty, status, start_date, target_weeks)
              SELECT v.fno, v.hc, 'LPH_MENGSAI', '海兰褐', v.pd::date, 1, v.iq, v.cq, 'ACTIVE', v.pd::date, 80
              FROM (VALUES
                ('LPH_MS_F02','HOUSE_MS_02','2025-10-06',45600,45551),
                ('LPH_MS_F03','HOUSE_MS_03','2025-07-06',37500,37336),
                ('LPH_MS_F04','HOUSE_MS_04','2025-07-06',44000,43816),
                ('LPH_MS_F05','HOUSE_MS_05','2025-12-24',42500,42368),
                ('LPH_MS_F06','HOUSE_MS_06','2025-12-24',41700,41500)
              ) v(fno, hc, pd, iq, cq)
              WHERE NOT EXISTS (SELECT 1 FROM brd_flocks f WHERE f.flock_no=v.fno)$$;
  END IF;

  -- 4. mst_products (饲料 + 蛋托 + 柴油 + 鸡蛋)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='mst_products') THEN
    EXECUTE $$INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, status, has_grade, has_spec)
              SELECT v.code, v.name_en, v.name_zh, v.unit, v.cat, 'ACTIVE', v.hg, false
              FROM (VALUES
                ('FEED_CORN','Corn','玉米','公斤','FEED',false),
                ('FEED_SOY_MEAL','Soybean Meal','豆粕','公斤','FEED',false),
                ('FEED_PREMIX','Premix','预混料','公斤','FEED',false),
                ('FEED_PREMIX_YOUNG','Young Premix','青年预混料','公斤','FEED',false),
                ('FEED_SOY_OIL','Soybean Oil','豆油','公斤','FEED',false),
                ('FEED_LIMESTONE','Limestone Powder','石粉','公斤','FEED',false),
                ('FEED_RICE_BRAN','Rice Bran','米糠','公斤','FEED',false),
                ('PKG_EGG_TRAY','Egg Tray','蛋托','个','PACKAGING',false),
                ('FUEL_DIESEL','Diesel','柴油','升','FUEL',false),
                ('EGG','Chicken Egg','鸡蛋','枚','FINISHED_GOODS',true)
              ) v(code, name_en, name_zh, unit, cat, hg)
              WHERE NOT EXISTS (SELECT 1 FROM mst_products p WHERE p.product_code=v.code)$$;
  END IF;

  -- 5. prc2_suppliers（2026-06-06 镜像补全，避免根 migrations/ 版本独占）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='prc2_suppliers') THEN
    EXECUTE $$INSERT INTO prc2_suppliers (supplier_code, supplier_name, country_code, supplier_type, default_currency, status, is_active, shared_scope, credit_days)
              SELECT v.code, v.name, v.cc, v.type, v.ccy, 'ACTIVE', true, 'GROUP', 30
              FROM (VALUES
                ('SUP_ZHONGLIANG','中粮鞠德清','CN','RAW_MATERIAL','CNY'),
                ('SUP_XU','胥总','LA','RAW_MATERIAL','LAK'),
                ('SUP_VTE_TRAY','万象蛋托厂','LA','PACKAGING','LAK')
              ) v(code, name, cc, type, ccy)
              WHERE NOT EXISTS (SELECT 1 FROM prc2_suppliers s WHERE s.supplier_code=v.code)$$;
  END IF;

  -- 6. sal_customers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sal_customers') THEN
    EXECUTE $$INSERT INTO sal_customers (customer_no, customer_name, customer_type, company_code, company_name, status, risk_level)
              SELECT v.no, v.name, v.type, 'LPH', '老挝凤凰农业', 'ACTIVE', 'NORMAL'
              FROM (VALUES
                ('CUS_MH_AF','蒙混阿峰','WHOLESALE'),
                ('CUS_MH_PP','蒙混胖胖','WHOLESALE'),
                ('CUS_SY','沙耶武里','WHOLESALE'),
                ('CUS_LB_STORE','拉邦直营店','STORE'),
                ('CUS_MS_STORE','孟赛直营店','STORE'),
                ('CUS_VTE_STORE','万象直营店','STORE'),
                ('CUS_BLK_STORE','波利坎赛合营店','STORE'),
                ('CUS_DP_HX','东鹏（会晒）','WHOLESALE'),
                ('CUS_VTE_LB','万象刘彬','WHOLESALE'),
                ('CUS_FSL','风沙里文代','WHOLESALE'),
                ('CUS_RETAIL','零售','RETAIL')
              ) v(no, name, type)
              WHERE NOT EXISTS (SELECT 1 FROM sal_customers c WHERE c.customer_no=v.no)$$;
  END IF;

  -- 7. fin_cash_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='fin_cash_accounts') THEN
    EXECUTE $$INSERT INTO fin_cash_accounts (account_code, account_name, company_code, company_name, currency_code, account_type, opening_balance, current_balance, status, remark)
              SELECT v.code, v.name, 'LPH', '老挝凤凰农业', v.ccy, v.type, 0, 0, 'ACTIVE', v.rmk
              FROM (VALUES
                ('CASH_LAK',  '老挝币现金','LAK','CASH',    'Excel 现金收支表 — 老挝币现金账户'),
                ('WECHAT_LAK','老挝币微信','LAK','EWALLET', 'Excel 现金收支表 — 老挝币微信钱包'),
                ('CASH_CNY',  '人民币现金','CNY','CASH',    'Excel 现金收支表 — 人民币现金账户'),
                ('WECHAT_CNY','人民币微信','CNY','EWALLET', 'Excel 现金收支表 — 人民币微信钱包')
              ) v(code, name, ccy, type, rmk)
              WHERE NOT EXISTS (SELECT 1 FROM fin_cash_accounts a WHERE a.account_code=v.code)$$;
  END IF;

  RAISE NOTICE '[glp1a2_meng_sai] OK: brd/products/suppliers/customers/cash_accounts 已写入或保持现状';
END $body$;

-- ─── 回滚 ───────────────────────────────────────────
--   DELETE FROM brd_flocks WHERE farm_code='LPH_MENGSAI';
--   DELETE FROM brd_houses WHERE farm_code='LPH_MENGSAI';
--   DELETE FROM brd_farms  WHERE farm_code='LPH_MENGSAI';
