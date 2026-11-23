-- Only called after installing the three extensions in a disposable release fixture.
-- The reader was created before upgrade. Model site-specific least privilege inside a
-- rolled-back transaction and retain the independent, pre-GRANT observation separately.
BEGIN;
GRANT SELECT,INSERT ON production_inbound_reissues, production_finance_review_files,
  production_cutover_state_receipts TO release_api;
GRANT SELECT ON production_cutover_state_origins TO release_api;
SET LOCAL ROLE release_api;
DO $scope$
DECLARE line text;
BEGIN
  IF current_user <> 'release_api' OR EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'non-privileged API identity required'; END IF;
  FOREACH line IN ARRAY ARRAY['production_inbound_reissues','production_finance_review_files','production_cutover_state_receipts'] LOOP
    IF pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=line::regclass),'USAGE') THEN
      RAISE EXCEPTION 'API role owns %',line;
    END IF;
    EXECUTE format('SELECT 1 FROM %I LIMIT 1',line);
    -- Exercise ACL enforcement without creating business records or invoking the domain writer.
    EXECUTE format('INSERT INTO %I SELECT * FROM %I WHERE false',line,line);
  END LOOP;
  PERFORM 1 FROM production_cutover_state_origins LIMIT 1;
  FOREACH line IN ARRAY ARRAY['production_cutover_apply_admissions','production_cutover_apply_results','production_cutover_control_environments'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM %I LIMIT 1',line);
      RAISE EXCEPTION 'protected table readable: %',line;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF has_table_privilege(current_user,line,'INSERT') OR has_table_privilege(current_user,line,'UPDATE')
      OR has_table_privilege(current_user,line,'DELETE') THEN RAISE EXCEPTION 'protected table writable: %',line; END IF;
  END LOOP;
  -- Finance locks the journal's original document. The binding itself is read-only after insert.
  IF has_any_column_privilege(current_user,'production_finance_review_files','UPDATE') THEN
    RAISE EXCEPTION 'unexpected binding UPDATE privilege';
  END IF;
END $scope$;
ROLLBACK;
