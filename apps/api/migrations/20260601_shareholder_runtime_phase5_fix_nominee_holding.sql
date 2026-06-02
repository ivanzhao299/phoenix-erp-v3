-- ════════════════════════════════════════════════════════════════════════
-- Shareholder Runtime Phase 5 — 修正代持名义股东的回填台账(消除重复计数)
-- ────────────────────────────────────────────────────────────────────────
-- 背景：Phase 4 回填出资台账时，对「代持名义股东」补的是法定实缴全额，
--       而该全额里已包含实际出资人(代持人)的钱；实际出资人又另有真实逐笔台账，
--       导致同一笔代持资金在台账里被算两次。
--   案例：东鹏 宋雷(SHR-SONG-LEI) 法定实缴 9,994,058.49
--         = 赵永伟代持 6,995,840.94(70%) + 宋雷自有 2,998,217.55(30%)
--         赵永伟另有真实逐笔台账 6,995,840.63 → 代持款重复。
--
-- 口径决策(用户确认 A·按实际出资人)：出资台账记「谁实际出钱」。
--   名义股东只记自有部分 = 法定实缴 − 替他人代持金额；实际出资人(代持人)保留逐笔。
--
-- 修正：对回填条目(source=CAPITAL_SUMMARY_IMPORT)中、在实益结构里替他人代持的
--       名义股东，把金额改为「法定实缴 − 代持他人部分」(确定值，幂等)。
--   东鹏宋雷：9,994,058.49 − 6,995,840.94 = 2,998,217.55。
--   东鹏台账合计 → 39,397,829.69(法定 39,397,830，差 0.31 = 已认可的代持比例误差)，无重复。
--
-- 安全保证：
--   1) 幂等：目标金额=equity实缴−代持，仅依赖 equity/beneficial(均不变)，重复执行结果一致。
--   2) 只改回填条目(CAPITAL_SUMMARY_IMPORT)；不动赵永伟等真实逐笔；不动 equity/总实缴。
--   3) 无代持的项目/股东(孟赛、万象、东鹏其他股东)完全不受影响。
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE shr_capital_contributions c SET
  amount = e.paid_in_capital - COALESCE((
    SELECT sum(b.amount) FROM shr_beneficial_equity b
    WHERE b.project_code = c.project_code
      AND b.nominee_shareholder_code = c.shareholder_code
      AND b.beneficial_shareholder_code <> c.shareholder_code   -- 替他人代持的金额
  ), 0),
  remark = '历史实缴汇总导入（初始数据·单笔台账；实际出资人口径，已扣除代持他人部分）',
  updated_at = now()
FROM shr_project_equity e
WHERE c.source_type = 'CAPITAL_SUMMARY_IMPORT'
  AND e.project_code = c.project_code
  AND e.shareholder_code = c.shareholder_code
  AND EXISTS (
    SELECT 1 FROM shr_beneficial_equity b
    WHERE b.project_code = c.project_code
      AND b.nominee_shareholder_code = c.shareholder_code
      AND b.beneficial_shareholder_code <> c.shareholder_code
  );

COMMIT;

-- 预期(生产)：仅东鹏宋雷回填条目 9,994,058.49 → 2,998,217.55；
--   东鹏台账 CONFIRMED 合计 39,397,829.69；孟赛/万象不变。
