-- ============== V3 标签打印审计表 lbl_records ==============
-- [V3 包装终端 P1] 包装/分级标签每次打印写一条审计
-- 表早已存在（V2 历史），本 DDL 只做幂等保护性 ALTER：
--   - 补 printed_by(BIGINT FK sys_user) 用于精确关联用户
--   - 现有 operator(text) 列继续保留，存用户名字符串
-- 索引：按 batch_no 与 created_at 两个常用维度

CREATE TABLE IF NOT EXISTS lbl_records (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64),
    label_type      VARCHAR(16) NOT NULL DEFAULT 'pkg',
    grade_code      VARCHAR(16),
    grade_name      VARCHAR(64),
    pack_code       VARCHAR(64),
    pack_name       VARCHAR(128),
    custom_type     VARCHAR(64),
    batch_no        VARCHAR(64),
    produce_date    DATE,
    expiry_date     DATE,
    price           NUMERIC(10,2),
    show_price      SMALLINT NOT NULL DEFAULT 0,
    show_expiry     SMALLINT NOT NULL DEFAULT 1,
    desc_text       TEXT,
    operator        VARCHAR(64),
    qty_printed     INT NOT NULL DEFAULT 1,
    label_w         INT,
    label_h         INT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE lbl_records ADD COLUMN IF NOT EXISTS printed_by BIGINT;

-- 修 V2 历史表 id 列没有 sequence 默认值的问题（不补就 INSERT 报 not-null constraint）
CREATE SEQUENCE IF NOT EXISTS lbl_records_id_seq;
SELECT setval('lbl_records_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM lbl_records), 0), 1));
ALTER TABLE lbl_records ALTER COLUMN id SET DEFAULT nextval('lbl_records_id_seq');

CREATE INDEX IF NOT EXISTS idx_lbl_records_batch       ON lbl_records (batch_no);
CREATE INDEX IF NOT EXISTS idx_lbl_records_created_at  ON lbl_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbl_records_type_grade  ON lbl_records (label_type, grade_code);
