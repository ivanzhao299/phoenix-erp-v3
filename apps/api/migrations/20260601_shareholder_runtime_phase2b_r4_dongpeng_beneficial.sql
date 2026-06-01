-- ============================================================
-- Shareholder Runtime Phase 2B-R4 — 东鹏实缴资本 + 实益出资结构(代持)
-- 数据源：《东鹏蛋鸡养殖场发生额及余额表》截止 2026-04
-- 法定股东结构(Legal) 与 实益出资结构(Beneficial) 分离，不互相覆盖。
--   · 项目总实缴 39,397,830.00
--   · 法定实缴：朱兆存/宋雷/陈逸飞/朱召安/符强(SHR-FU-QIANG)；赵永伟法定直接实缴为0(其出资经宋雷代持)
--   · equity_ratio(法定股权比例)禁止修改，保持 59.8/17.5/7.5/6.5/4.35/4.35
--   · 新增 shr_beneficial_equity：宋雷代持中 70% 归赵永伟、30% 归宋雷
-- 幂等：ADD/CREATE IF NOT EXISTS + UPDATE + ON CONFLICT
-- ============================================================
BEGIN;

-- 1. 实益出资结构表
CREATE TABLE IF NOT EXISTS shr_beneficial_equity (
  id                         BIGSERIAL PRIMARY KEY,
  project_code               VARCHAR(64) NOT NULL,
  nominee_shareholder_code   VARCHAR(64) NOT NULL,   -- 登记(名义)股东
  beneficial_shareholder_code VARCHAR(64) NOT NULL,  -- 实际出资人
  amount                     NUMERIC(18,2),
  ownership_ratio            NUMERIC(10,4),          -- 占该名义持股的实益比例(%)
  remark                     TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_code, nominee_shareholder_code, beneficial_shareholder_code)
);
CREATE INDEX IF NOT EXISTS idx_shr_beneficial_project ON shr_beneficial_equity(project_code);

-- 2. 项目总实缴资本
UPDATE shr_projects SET total_paid_in_capital = 39397830.00, updated_at = now()
WHERE project_code = 'SHR-DONGPENG-LAYER';

-- 3. 法定股东实缴 + 法定实缴占比(不覆盖 equity_ratio)
UPDATE shr_project_equity e SET
  paid_in_capital = v.paid,
  capital_ratio   = round(v.paid / 39397830.00 * 100, 2),
  paid_in_source  = 'CAPITAL_SUMMARY_IMPORT',
  updated_at      = now()
FROM (VALUES
  ('SHR-ZHU-ZHAOCUN', 23609134.01),  -- 朱兆存 59.92%
  ('SHR-SONG-LEI',     9994058.49),  -- 宋雷 25.37%
  ('SHR-CHEN-YIFEI',   1617318.75),  -- 陈逸飞 4.11%（⚠姓名待核：陈逸飞/陈茂飞）
  ('SHR-ZHU-ZHAOAN',   1617318.75),  -- 朱召安 4.11%
  ('SHR-FU-QIANG',     2560000.00)   -- 符强 6.50%（实际编码 SHR-FU-QIANG）
) AS v(shr_code, paid)
WHERE e.project_code = 'SHR-DONGPENG-LAYER' AND e.shareholder_code = v.shr_code;

-- 4. 实益出资结构：宋雷名义持股 9,994,058.49 → 70% 赵永伟 / 30% 宋雷
INSERT INTO shr_beneficial_equity
  (project_code, nominee_shareholder_code, beneficial_shareholder_code, amount, ownership_ratio, remark)
VALUES
  ('SHR-DONGPENG-LAYER','SHR-SONG-LEI','SHR-ZHAO-YONGWEI', 6995840.94, 70, '东鹏项目历史代持结构'),
  ('SHR-DONGPENG-LAYER','SHR-SONG-LEI','SHR-SONG-LEI',     2998217.55, 30, '东鹏项目自有实缴部分')
ON CONFLICT (project_code, nominee_shareholder_code, beneficial_shareholder_code) DO NOTHING;

COMMIT;

-- 预期法定占比：朱兆存59.92/宋雷25.37/陈逸飞4.11/朱召安4.11/符强6.50（合计≈100%，赵永伟法定直接实缴0）
