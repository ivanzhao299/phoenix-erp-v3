-- ============================================================
-- Golden Phoenix · 生产初始化数据包  02 用户（System Users）
-- 目标表：sys_user（不写旧表）
-- 原则：
--   · 不写明文密码：password_hash 用 pgcrypto 随机 bcrypt，要求首次登录由管理员重置
--   · 用户名用拼音规范编码；status=1 (ACTIVE)
--   · 仅系统岗位建账号；客户/供应商/普通工人/司机不建账号
--   · 幂等：ON CONFLICT (username) DO NOTHING，已存在用户不改密码/姓名
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 第一批正式系统用户（9 人）
--   store_code 取其主组织编码，仅作展示锚点，真正数据范围以 04-user-orgs 为准
INSERT INTO sys_user (username, password_hash, real_name, store_code, locale, status)
SELECT v.username,
       crypt(gen_random_uuid()::text, gen_salt('bf', 10)),   -- 随机 bcrypt，无明文
       v.real_name, v.store_code, 'zh-CN', 1
FROM (VALUES
  ('zhaoyongwei', '赵永伟', 'ORG-GROUP'),
  ('zhuzhaocun',  '朱兆存', 'BU-AGRI'),
  ('songlei',     '宋雷',   'SITE-MENGSAI-LAYER'),
  ('fuqiang',     '符强',   'SITE-DONGPENG-LAYER'),
  ('xiejiling',   '谢继领', 'SITE-MENGSAI-LAYER'),
  ('liujie',      '刘杰',   'ORG-GROUP'),
  ('wangweihua',  '王玮华', 'COMP-LAO-AGRI'),
  ('zhuzhaoan',   '朱召安', 'ORG-GROUP'),   -- ⚠ 待确认：M2 本地曾用 zhuzhao_an，需统一为唯一规范用户名
  ('liushanjun',  '刘善军', 'SITE-MENGSAI-LAYER')  -- ⚠ 仓储归属待确认
) AS v(username, real_name, store_code)
ON CONFLICT (username) DO NOTHING;

COMMIT;

-- 「建议开账号」候选（名单中店长/财务/采购/仓库/销售/统计/品控/包装主管）
-- 不在本脚本盲目写入生产，统一列入 README「账号开通审阅清单」，经人工确认后再单独批次导入。
-- 校验见 90-check-init-data.sql
