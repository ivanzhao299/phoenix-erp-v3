-- ==========================================================
-- sys_dict 去重脚本
-- 策略：同一 (dict_code, dict_type) 保留 id 最小的行，删除其余
-- 执行方式：psql -U <user> -d <db> -f dedup_sys_dict.sql
-- ==========================================================

-- 1. 查看重复情况（运行前先确认）
SELECT dict_code, dict_type, COUNT(*) AS cnt,
       MIN(id) AS keep_id,
       ARRAY_AGG(id ORDER BY id) AS all_ids
FROM sys_dict
GROUP BY dict_code, dict_type
HAVING COUNT(*) > 1
ORDER BY cnt DESC, dict_type, dict_code;

-- 2. 执行去重（删除非最小 id 的重复行）
DELETE FROM sys_dict
WHERE id NOT IN (
  -- 每个 (dict_code, dict_type) 组合，保留最小 id
  SELECT MIN(id)
  FROM sys_dict
  GROUP BY dict_code, dict_type
);

-- 3. 验证结果（应无重复）
SELECT dict_code, dict_type, COUNT(*) AS cnt
FROM sys_dict
GROUP BY dict_code, dict_type
HAVING COUNT(*) > 1;

-- 若上面查询返回空，说明去重成功

-- 4. 汇总各类型剩余条目数
SELECT dict_type, COUNT(*) AS total
FROM sys_dict
GROUP BY dict_type
ORDER BY dict_type;
