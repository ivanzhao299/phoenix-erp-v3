-- ════════════════════════════════════════════════════════════════════════
-- G85-D 供应商改名审计 — prc2_suppliers 名称变更自动落 mst_audit_trail
-- ────────────────────────────────────────────────────────────────────────
-- 背景：采购单据存 supplier_code/name 快照（审计留痕，合理），但主档改名后
--      历史单据名称不回溯。本触发器保证「谁在何时把名字从 A 改成 B」可追溯，
--      对账时可凭审计链解释新旧名差异。
-- 幂等：CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS。
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_prc2_supplier_rename_audit() RETURNS trigger AS $$
BEGIN
  INSERT INTO mst_audit_trail (object_type, object_code, action, before_json, after_json, operator, reason)
  VALUES (
    'SUPPLIER',
    NEW.supplier_code,
    'UPDATE',
    jsonb_build_object('supplier_name', OLD.supplier_name),
    jsonb_build_object('supplier_name', NEW.supplier_name),
    COALESCE(NULLIF(current_setting('app.current_user', true), ''), session_user),
    '供应商名称变更（DB 触发器自动审计 G85-D）'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prc2_supplier_rename_audit ON prc2_suppliers;
CREATE TRIGGER trg_prc2_supplier_rename_audit
  AFTER UPDATE OF supplier_name ON prc2_suppliers
  FOR EACH ROW
  WHEN (OLD.supplier_name IS DISTINCT FROM NEW.supplier_name)
  EXECUTE FUNCTION fn_prc2_supplier_rename_audit();
