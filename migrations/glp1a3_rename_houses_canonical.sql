-- Phase 1: 6 鸡舍重命名 LPH_MS_H* → HOUSE_MS_0*
-- 同时写 HOUSE_LEGACY_CODE alias 保留历史可追溯

BEGIN;

-- 1) brd_houses UPDATE PK
UPDATE brd_houses SET house_code='HOUSE_MS_01' WHERE house_code='LPH_MS_H1';
UPDATE brd_houses SET house_code='HOUSE_MS_02' WHERE house_code='LPH_MS_H2';
UPDATE brd_houses SET house_code='HOUSE_MS_03' WHERE house_code='LPH_MS_H3';
UPDATE brd_houses SET house_code='HOUSE_MS_04' WHERE house_code='LPH_MS_H4';
UPDATE brd_houses SET house_code='HOUSE_MS_05' WHERE house_code='LPH_MS_H5';
UPDATE brd_houses SET house_code='HOUSE_MS_06' WHERE house_code='LPH_MS_H6';

-- 2) brd_flocks 引用同步
UPDATE brd_flocks SET house_code='HOUSE_MS_02' WHERE house_code='LPH_MS_H2';
UPDATE brd_flocks SET house_code='HOUSE_MS_03' WHERE house_code='LPH_MS_H3';
UPDATE brd_flocks SET house_code='HOUSE_MS_04' WHERE house_code='LPH_MS_H4';
UPDATE brd_flocks SET house_code='HOUSE_MS_05' WHERE house_code='LPH_MS_H5';
UPDATE brd_flocks SET house_code='HOUSE_MS_06' WHERE house_code='LPH_MS_H6';

-- 3) biz_site_aliases 加 HOUSE_LEGACY_CODE 别名
-- (注：biz_site_aliases.site_code 必须是 SITE-* 不是 HOUSE_*，且触发器只允许 SITE 类型 org)
-- 鸡舍历史别名可视为站点维度的子映射 — 这里挂在 SITE-MENGSAI-LAYER 上，
-- alias_type 用 HOUSE_LEGACY_CODE 区分
INSERT INTO biz_site_aliases (site_code, alias_type, alias_code, alias_name, source_table, status, remark)
VALUES
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H1','1号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_01'),
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H2','2号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_02'),
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H3','3号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_03'),
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H4','4号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_04'),
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H5','5号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_05'),
('SITE-MENGSAI-LAYER','HOUSE_LEGACY_CODE','LPH_MS_H6','6号鸡舍','brd_houses','ACTIVE','GLP-1A-2 阶段历史 house_code，已重命名为 HOUSE_MS_06')
ON CONFLICT (alias_type, alias_code) DO NOTHING;

COMMIT;

SELECT house_code, house_name FROM brd_houses WHERE farm_code='LPH_MENGSAI' ORDER BY house_code;
SELECT flock_no, house_code FROM brd_flocks WHERE farm_code='LPH_MENGSAI' ORDER BY house_code;
