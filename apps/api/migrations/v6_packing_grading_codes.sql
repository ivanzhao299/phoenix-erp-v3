-- v6: pkg_packing_records 添加 grading_codes_json 支持多分级批次追溯（幂等）
ALTER TABLE pkg_packing_records
  ADD COLUMN IF NOT EXISTS grading_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 回填历史数据：将现有 grading_code 转为数组
UPDATE pkg_packing_records
SET grading_codes_json = jsonb_build_array(grading_code)
WHERE grading_code IS NOT NULL AND grading_codes_json = '[]'::jsonb;
