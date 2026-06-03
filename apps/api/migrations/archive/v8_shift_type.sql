-- v8: 弹性排班 — 班次类型字段 + PKG_SHIFT 字典种数据（幂等）

ALTER TABLE pkg_work_shifts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20);

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'MORNING', 'PKG_SHIFT', '早班', '早班', 'Morning Shift', 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='MORNING' AND dict_type='PKG_SHIFT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'AFTERNOON', 'PKG_SHIFT', '下午班', '下午班', 'Afternoon Shift', 2, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='AFTERNOON' AND dict_type='PKG_SHIFT');

INSERT INTO sys_dict (dict_code, dict_type, name, dict_label_zh, dict_label_en, sort_no, status)
SELECT 'NIGHT', 'PKG_SHIFT', '夜班', '夜班', 'Night Shift', 3, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE dict_code='NIGHT' AND dict_type='PKG_SHIFT');
