import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Default-deny control plane. No roles, grants, environment bindings or admissions are seeded.
 * A separate deployment owner must install the real NOLOGIN owner and isolated login ACLs.
 * Database identity/locks cannot prove FD9, ingress, the source image or actual deployment logins:
 * those remain the independent issuer and host runner's responsibility.
 * Completion checks run when PostgreSQL fires the constraints. The trusted runner must leave them
 * deferred until COMMIT; arbitrary SET CONSTRAINTS IMMEDIATE can move time/expiry checks earlier.
 * @allow-data-dml: Guard/function DDL only; no business, control or activation facts are seeded.
 */
export class ProductionCutoverExecutionAdmissions1795029621917 implements MigrationInterface {
  name='ProductionCutoverExecutionAdmissions1795029621917';
  private readonly tables=['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results'];
  private readonly functions=['assert_cutover_control_environment','guard_cutover_control_environment','guard_cutover_apply_admission',
    'consume_production_cutover_admission','current_production_cutover_admission','guard_cutover_runtime_admission',
    'guard_cutover_apply_result','record_production_cutover_apply_result','check_cutover_apply_completion','guard_cutover_result_seal','guard_trusted_opening_namespace',
    'guard_cutover_counted_history','guard_cutover_executor_write','lock_production_cutover_authority'];
  private readonly sealedTables=['production_cutover_scopes','production_inventory_domain_states','production_inventory_domains',
    'production_inventory_domain_events','production_opening_domain_claims','production_opening_receipts','production_cutover_manifests',
    'production_cutover_signatures','production_batch_qualifications','production_batch_roots','production_source_state_events',
    'inv_batches','inv_ledger','file_metadata','sys_user','mst_products','product_skus','md_egg_source_profiles',
    'production_raw_receipts','production_raw_receipt_segments','production_conversion_documents','production_conversion_inputs',
    'production_conversion_outputs','production_conversion_inventory_debits','production_batch_raw_roots','production_batch_derivation_parents'];
  private readonly executorInserts=['production_cutover_scopes','production_inventory_domain_states','production_inventory_domains',
    'production_inventory_domain_events','production_opening_domain_claims','production_opening_receipts','production_batch_qualifications','inv_batches','inv_ledger'];
  // UPDATE permission is required by PostgreSQL FOR SHARE, but the row guard forbids physical writes to read-only facts.
  private readonly executorUpdates=['production_cutover_scopes','production_inventory_domain_states','production_inventory_domains','production_cutover_manifests',
    'inv_batches','inv_ledger','md_egg_source_profiles','mst_products','product_skus','production_raw_receipt_segments','production_cutover_signatures',
    'file_metadata','wms_warehouses','production_opening_domain_claims','wms_locations','sys_organizations','md_sku_org_scope','product_grades','packaging_specs','md_product_varieties','pkg_source_batches','brd_flocks','brd_houses','brd_farms',
    'production_batch_qualifications','wms_transfer','wms_transfer_items','prc2_receipts','prc2_receipt_items'];
  private readonly authorityTables=['sys_user','sys_role','sys_user_role','sys_role_menu_permission','sys_role_permission_set',
    'sys_permission_set','sys_permission_set_item','sys_user_permission_set','sys_menu','sys_dict','md_sku_org_scope','sys_data_scopes','sys_user_orgs','sys_user_project_scopes',
    'sys_user_warehouse_scopes','sys_user_farm_scopes','sys_organizations','wms_warehouses','brd_farms','file_metadata','production_cutover_signatures',
    'mst_products','product_skus','product_grades','packaging_specs','md_product_varieties','md_egg_source_profiles','brd_houses','brd_flocks',
    'brd_flock_occupancies','brd_flock_house_states'];
  async up(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query(`LOCK TABLE production_cutover_scopes,production_inventory_domain_states,production_opening_receipts,
        inv_batches,inv_ledger,production_batch_qualifications IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
      if((await q.query(`SELECT 1 FROM production_cutover_scopes WHERE state<>'DRAFT'
        UNION ALL SELECT 1 FROM production_inventory_domain_states WHERE state<>'DRAFT'
        UNION ALL SELECT 1 FROM production_opening_receipts LIMIT 1`)).length)
        throw new Error('CUTOVER_EXISTING_ACTIVATION_REQUIRES_INDEPENDENT_REVIEW');
      if((await q.query(`SELECT 1 FROM inv_batches WHERE batch_no ~* '^OPN-[a-f0-9]{32}-[1-9][0-9]*$'
        UNION ALL SELECT 1 FROM inv_ledger WHERE batch_no ~* '^OPN-[a-f0-9]{32}-[1-9][0-9]*$'
        UNION ALL SELECT 1 FROM production_batch_qualifications WHERE batch_no ~* '^OPN-[a-f0-9]{32}-[1-9][0-9]*$' LIMIT 1`)).length)
        throw new Error('CUTOVER_EXISTING_OPENING_NAMESPACE_REQUIRES_INDEPENDENT_REVIEW');
      const schemaName=(await q.query('SELECT current_schema() AS name'))[0].name as string;
      const schema='"'+schemaName.replace(/"/g,'""')+'"',literal="'"+schemaName.replace(/'/g,"''")+"'";
      const security=`SECURITY DEFINER SET search_path=pg_catalog,${schema},pg_temp`;
      const requiredTriggers=[
        ['production_cutover_control_environments','trg_cutover_control_environment','guard_cutover_control_environment'],
        ['production_cutover_control_environments','trg_cutover_control_environment_truncate','guard_cutover_control_environment'],
        ['production_cutover_apply_admissions','trg_cutover_apply_admission','guard_cutover_apply_admission'],
        ['production_cutover_apply_admissions','trg_cutover_apply_admission_truncate','guard_cutover_apply_admission'],
        ['production_cutover_apply_admissions','trg_cutover_admission_completion','check_cutover_apply_completion'],
        ['production_cutover_apply_results','trg_cutover_apply_result','guard_cutover_apply_result'],
        ['production_cutover_apply_results','trg_cutover_apply_result_truncate','guard_cutover_apply_result'],
        ['production_cutover_apply_results','trg_cutover_result_completion','check_cutover_apply_completion'],
        ...['production_cutover_scopes','production_inventory_domain_states','production_inventory_domain_events','production_opening_domain_claims',
          'production_opening_receipts','production_cutover_manifests','production_batch_qualifications'].map(table=>[table,'trg_trusted_cutover_admission','guard_cutover_runtime_admission']),
        ...this.sealedTables.map(table=>[table,'trg_cutover_result_seal','guard_cutover_result_seal']),
        ...['inv_batches','inv_ledger','production_batch_qualifications'].map(table=>[table,'trg_trusted_opening_namespace','guard_trusted_opening_namespace']),
        ...['inv_batches','inv_ledger'].map(table=>[table,'trg_cutover_counted_history','guard_cutover_counted_history']),
        ...[...new Set([...this.executorInserts,...this.executorUpdates])].map(table=>[table,'trg_cutover_executor_write','guard_cutover_executor_write']),
      ].map(row=>'('+row.map(value=>"'"+value+"'").join(',')+')').join(',');
      await q.query(`CREATE TABLE production_cutover_control_environments(
        environment_id text NOT NULL CHECK(environment_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'),
        generation integer NOT NULL CHECK(generation>0),control_owner name NOT NULL,control_owner_oid oid NOT NULL,
        issuer_role name NOT NULL,issuer_role_oid oid NOT NULL,executor_role name NOT NULL,executor_role_oid oid NOT NULL,
        api_roles name[] NOT NULL CHECK(cardinality(api_roles)>0),api_role_oids oid[] NOT NULL,
        database_name name NOT NULL,database_oid oid NOT NULL,schema_oid oid NOT NULL,cluster_identifier text NOT NULL,
        deployment_evidence_sha256 text NOT NULL CHECK(deployment_evidence_sha256 ~ '^[a-f0-9]{64}$'),
        registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),registered_by name NOT NULL DEFAULT session_user,
        PRIMARY KEY(environment_id,generation),CHECK(cardinality(api_roles)=cardinality(api_role_oids))
      );
      CREATE TABLE production_cutover_apply_admissions(
        id uuid PRIMARY KEY,environment_id text NOT NULL,environment_generation integer NOT NULL,
        manifest_id uuid NOT NULL REFERENCES production_cutover_manifests(id),manifest_version integer NOT NULL CHECK(manifest_version>=0),
        content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
        mode text NOT NULL CHECK(mode IN('INIT','ATTACH')),source_sha text NOT NULL CHECK(source_sha ~ '^[a-f0-9]{40}$'),
        fence_owner text NOT NULL CHECK(btrim(fence_owner)<>''),fence_generation bigint NOT NULL CHECK(fence_generation>0),
        authority_sha256 text NOT NULL CHECK(authority_sha256 ~ '^[a-f0-9]{64}$'),operator_id text NOT NULL CHECK(btrim(operator_id)<>''),
        backend_pid integer NOT NULL CHECK(backend_pid>0),backend_start timestamptz NOT NULL,postmaster_start timestamptz NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,issued_by name NOT NULL DEFAULT session_user,
        admission_digest text NOT NULL DEFAULT '',consumed_at timestamptz,consumed_xid xid8,
        FOREIGN KEY(environment_id,environment_generation) REFERENCES production_cutover_control_environments(environment_id,generation),
        UNIQUE(backend_pid,consumed_xid),CHECK((consumed_at IS NULL)=(consumed_xid IS NULL)),
        CHECK(expires_at>issued_at),CHECK(admission_digest ~ '^[a-f0-9]{64}$')
      );
      CREATE TABLE production_cutover_apply_results(
        admission_id uuid PRIMARY KEY REFERENCES production_cutover_apply_admissions(id),
        manifest_id uuid NOT NULL UNIQUE REFERENCES production_cutover_manifests(id),mode text NOT NULL CHECK(mode IN('INIT','ATTACH')),
        scope_ids uuid[] NOT NULL CHECK(cardinality(scope_ids)>0),domain_ids uuid[] NOT NULL CHECK(cardinality(domain_ids)>0),
        opening_receipt_id uuid UNIQUE REFERENCES production_opening_receipts(id),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
        recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((mode='INIT')=(opening_receipt_id IS NOT NULL))
      );
      ALTER TABLE production_opening_receipts ADD COLUMN cutover_manifest_id uuid UNIQUE REFERENCES production_cutover_manifests(id);
      REVOKE ALL ON production_cutover_control_environments,production_cutover_apply_admissions,production_cutover_apply_results FROM PUBLIC;`);
      await q.query(`CREATE FUNCTION assert_cutover_control_environment(p ${schema}.production_cutover_control_environments,p_registration boolean DEFAULT false)
      RETURNS void LANGUAGE plpgsql ${security} AS $body$
      DECLARE r record;principal oid;role_id oid;owner_id oid;schema_id oid;peer oid;required_table text;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' OR current_setting('session_replication_role')<>'origin' THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF current_setting('max_prepared_transactions')::integer<>0 THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_TWO_PHASE_COMMIT_HOLD' USING ERRCODE='23514';END IF;
        schema_id:=${literal}::regnamespace;
        SELECT relowner INTO owner_id FROM pg_class WHERE oid='${schema}.production_cutover_control_environments'::regclass;
        IF p.control_owner_oid IS DISTINCT FROM owner_id OR p.schema_oid IS DISTINCT FROM schema_id
          OR p.database_name IS DISTINCT FROM current_database() OR p.database_oid IS DISTINCT FROM(SELECT oid FROM pg_database WHERE datname=current_database())
          OR p.cluster_identifier IS DISTINCT FROM(SELECT system_identifier::text FROM pg_control_system())
          OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=owner_id AND rolname=p.control_owner AND NOT rolcanlogin
            AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls)
          OR EXISTS(SELECT 1 FROM pg_roles privileged WHERE(privileged.rolsuper OR privileged.rolcreaterole OR privileged.rolcreatedb
            OR privileged.rolreplication OR privileged.rolbypassrls OR privileged.rolname IN('pg_read_server_files','pg_write_server_files','pg_execute_server_program'))
            AND pg_has_role(owner_id,privileged.oid,'MEMBER')) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_OWNER_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
        FOREACH required_table IN ARRAY ARRAY[${this.authorityTables.map(table=>"'"+table+"'").join(',')}] LOOP
          IF NOT has_table_privilege(owner_id,format('%I.%I',${literal},required_table),'UPDATE') THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_AUTHORITY_LOCK_PRIVILEGES_HOLD' USING ERRCODE='23514';END IF;
        END LOOP;
        IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:cutover-control-environment'),hashtext(p.database_oid::text||':'||p.schema_oid::text)) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_CONFIGURATION_BUSY' USING ERRCODE='23514';END IF;
        IF p.generation IS DISTINCT FROM(COALESCE((SELECT MAX(generation) FROM ${schema}.production_cutover_control_environments
          WHERE environment_id=p.environment_id),0)+CASE WHEN p_registration THEN 1 ELSE 0 END) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_CONFIGURATION_STALE' USING ERRCODE='23514';END IF;
        IF cardinality(p.api_roles)<>cardinality(p.api_role_oids) OR cardinality(p.api_roles)=0
          OR EXISTS(SELECT 1 FROM unnest(p.api_roles,p.api_role_oids) a(role_name,role_oid)
            WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=a.role_name AND oid=a.role_oid))
          OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=p.issuer_role AND oid=p.issuer_role_oid)
          OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=p.executor_role AND oid=p.executor_role_oid)
          OR cardinality(ARRAY(SELECT DISTINCT v FROM unnest(p.api_role_oids||ARRAY[p.issuer_role_oid,p.executor_role_oid,owner_id]) v))<>cardinality(p.api_role_oids)+3 THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_PRINCIPALS_HOLD' USING ERRCODE='23514';END IF;
        FOREACH principal IN ARRAY p.api_role_oids||ARRAY[p.issuer_role_oid,p.executor_role_oid] LOOP
          IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=principal AND rolcanlogin) THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_LOGIN_ROLE_HOLD' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM pg_roles external_login WHERE external_login.rolcanlogin AND NOT external_login.rolsuper
            AND external_login.oid<>principal AND pg_has_role(external_login.oid,principal,'MEMBER')) THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_EXTERNAL_LOGIN_MEMBERSHIP_HOLD' USING ERRCODE='23514';END IF;
          FOREACH peer IN ARRAY p.api_role_oids||ARRAY[p.issuer_role_oid,p.executor_role_oid,owner_id] LOOP
            IF peer<>principal AND(pg_has_role(principal,peer,'MEMBER') OR pg_has_role(peer,principal,'MEMBER')) THEN
              RAISE EXCEPTION 'CUTOVER_CONTROL_ROLE_MEMBERSHIP_HOLD' USING ERRCODE='23514';END IF;
          END LOOP;
          -- Inspect all reachable roles, including NOINHERIT/SET-only grants, not just inherited ACLs.
          FOR role_id IN SELECT oid FROM pg_roles WHERE pg_has_role(principal,oid,'MEMBER') LOOP
          SELECT * INTO r FROM pg_roles WHERE oid=role_id;
          IF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
            OR EXISTS(SELECT 1 FROM pg_roles privileged WHERE(privileged.rolsuper OR privileged.rolcreaterole OR privileged.rolcreatedb
              OR privileged.rolreplication OR privileged.rolbypassrls OR privileged.rolname IN('pg_read_server_files','pg_write_server_files','pg_execute_server_program'))
              AND pg_has_role(role_id,privileged.oid,'MEMBER'))
            OR has_schema_privilege(role_id,schema_id,'CREATE') OR has_database_privilege(role_id,p.database_oid,'CREATE')
            OR has_parameter_privilege(role_id,'session_replication_role','SET') THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_ROLE_PRIVILEGES_HOLD' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=schema_id AND pg_has_role(role_id,c.relowner,'MEMBER'))
            OR EXISTS(SELECT 1 FROM pg_proc f WHERE f.pronamespace=schema_id AND pg_has_role(role_id,f.proowner,'MEMBER'))
            OR EXISTS(SELECT 1 FROM pg_proc f WHERE f.pronamespace=schema_id AND f.prosecdef AND has_function_privilege(role_id,f.oid,'EXECUTE')
              AND f.proname NOT IN('consume_production_cutover_admission','record_production_cutover_apply_result','lock_production_cutover_authority')) THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_OBJECT_OWNERSHIP_HOLD' USING ERRCODE='23514';END IF;
          FOREACH required_table IN ARRAY ARRAY['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results'] LOOP
            IF has_table_privilege(role_id,format('%I.%I',${literal},required_table),'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
              OR has_any_column_privilege(role_id,format('%I.%I',${literal},required_table),'UPDATE,REFERENCES')
              OR(has_table_privilege(role_id,format('%I.%I',${literal},required_table),'INSERT')
                OR has_any_column_privilege(role_id,format('%I.%I',${literal},required_table),'INSERT'))
                AND NOT(required_table='production_cutover_apply_admissions' AND principal=p.issuer_role_oid) THEN
              RAISE EXCEPTION 'CUTOVER_CONTROL_REGISTRY_ACL_HOLD' USING ERRCODE='23514';END IF;
          END LOOP;
          IF principal=p.executor_role_oid AND EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=schema_id AND c.relkind IN('r','p') AND(
            has_table_privilege(role_id,c.oid,'DELETE')
            OR(c.relname<>ALL(ARRAY[${this.executorInserts.map(v=>"'"+v+"'").join(',')}])
              AND(has_table_privilege(role_id,c.oid,'INSERT') OR has_any_column_privilege(role_id,c.oid,'INSERT')))
            OR(c.relname<>ALL(ARRAY[${this.executorUpdates.map(v=>"'"+v+"'").join(',')}])
              AND(has_table_privilege(role_id,c.oid,'UPDATE') OR has_any_column_privilege(role_id,c.oid,'UPDATE'))))) THEN
            RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_ACL_HOLD' USING ERRCODE='23514';END IF;
          IF principal<>p.executor_role_oid AND(has_function_privilege(role_id,'${schema}.consume_production_cutover_admission(uuid,text)','EXECUTE')
            OR has_function_privilege(role_id,'${schema}.record_production_cutover_apply_result(uuid)','EXECUTE')
            OR has_function_privilege(role_id,'${schema}.lock_production_cutover_authority(uuid)','EXECUTE')) THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_CONSUMER_ACL_HOLD' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=schema_id AND c.relkind IN('r','p') AND has_table_privilege(role_id,c.oid,'TRUNCATE,TRIGGER')) THEN
            RAISE EXCEPTION 'CUTOVER_CONTROL_TRIGGER_BYPASS_HOLD' USING ERRCODE='23514';END IF;
          END LOOP;
        END LOOP;
        IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=ANY(ARRAY['${schema}.production_cutover_control_environments'::regclass,
          '${schema}.production_cutover_apply_admissions'::regclass,'${schema}.production_cutover_apply_results'::regclass]) AND c.relowner<>owner_id)
          OR EXISTS(SELECT 1 FROM pg_proc f WHERE f.pronamespace=schema_id AND f.proname=ANY(ARRAY[${this.functions.map(v=>"'"+v+"'").join(',')}])
            AND(f.proowner<>owner_id OR NOT f.prosecdef OR f.provolatile<>'v'
              OR f.proconfig IS DISTINCT FROM ARRAY[format('search_path=pg_catalog, %I, pg_temp',${literal})])) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_FUNCTION_OWNER_HOLD' USING ERRCODE='23514';END IF;
        IF(SELECT count(*) FROM pg_proc f WHERE f.pronamespace=schema_id AND f.proname=ANY(ARRAY[${this.functions.map(v=>"'"+v+"'").join(',')}]))<>${this.functions.length} THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_FUNCTION_SET_HOLD' USING ERRCODE='23514';END IF;
        IF EXISTS(SELECT 1 FROM pg_trigger trigger JOIN pg_class relation ON relation.oid=trigger.tgrelid
          WHERE relation.relnamespace=schema_id AND trigger.tgenabled NOT IN('O','A')) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_TRIGGER_STATE_HOLD' USING ERRCODE='23514';END IF;
        IF EXISTS(SELECT 1 FROM(VALUES ${requiredTriggers}) expected(table_name,trigger_name,function_name)
          LEFT JOIN pg_class relation ON relation.relnamespace=schema_id AND relation.relname=expected.table_name
          LEFT JOIN pg_trigger guard_trigger ON guard_trigger.tgrelid=relation.oid AND guard_trigger.tgname=expected.trigger_name
          LEFT JOIN pg_proc routine ON routine.oid=guard_trigger.tgfoid
          WHERE guard_trigger.oid IS NULL OR guard_trigger.tgenabled NOT IN('O','A')
            OR routine.pronamespace<>schema_id OR routine.proname<>expected.function_name) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_TRIGGER_SET_HOLD' USING ERRCODE='23514';END IF;
      END $body$;
      CREATE FUNCTION guard_cutover_control_environment() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
      DECLARE owner_id oid;expected integer;
      BEGIN
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CUTOVER_CONTROL_CONFIGURATION_IMMUTABLE' USING ERRCODE='23514';END IF;
        SELECT relowner INTO owner_id FROM pg_class WHERE oid='${schema}.production_cutover_control_environments'::regclass;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND(rolsuper OR pg_has_role(oid,owner_id,'MEMBER'))) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_BOOTSTRAP_AUTHORITY_HOLD' USING ERRCODE='23514';END IF;
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:cutover-control-environment'),hashtext(
          (SELECT oid FROM pg_database WHERE datname=current_database())::text||':'||${literal}::regnamespace::oid::text)) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_CONFIGURATION_BUSY' USING ERRCODE='23514';END IF;
        IF EXISTS(SELECT 1 FROM ${schema}.production_cutover_control_environments WHERE environment_id<>NEW.environment_id) THEN
          RAISE EXCEPTION 'CUTOVER_CONTROL_ENVIRONMENT_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
        PERFORM ${schema}.assert_cutover_control_environment(NEW,true);
        NEW.registered_by:=session_user;NEW.registered_at:=clock_timestamp();RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_cutover_control_environment BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_control_environments
        FOR EACH ROW EXECUTE FUNCTION guard_cutover_control_environment();
      CREATE TRIGGER trg_cutover_control_environment_truncate BEFORE TRUNCATE ON production_cutover_control_environments
        FOR EACH STATEMENT EXECUTE FUNCTION guard_cutover_control_environment();`);
      await this.admissions(q,schema,security);
      await this.runtime(q,schema,security);
      for(const name of this.functions){
        const functions=await q.query('SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace=$1::regnamespace AND proname=$2',[schemaName,name]);
        for(const f of functions)await q.query(`REVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC`);
      }
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
  private async admissions(q:QueryRunner,schema:string,security:string):Promise<void>{
    await q.query(`CREATE FUNCTION guard_cutover_apply_admission() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE env ${schema}.production_cutover_control_environments;d record;backend record;locks integer;digest_payload jsonb;
    BEGIN
      IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'CUTOVER_ADMISSION_IMMUTABLE' USING ERRCODE='23514';END IF;
      SELECT * INTO env FROM ${schema}.production_cutover_control_environments
        WHERE environment_id=NEW.environment_id AND generation=NEW.environment_generation FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'CUTOVER_CONTROL_NOT_CONFIGURED' USING ERRCODE='23514';END IF;
      PERFORM ${schema}.assert_cutover_control_environment(env);
      SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=NEW.manifest_id FOR UPDATE;
      IF NOT FOUND OR d.state<>'APPROVED' OR d.version<>NEW.manifest_version OR d.content_hash IS DISTINCT FROM NEW.content_hash
        OR d.snapshot_sha256 IS DISTINCT FROM NEW.snapshot_sha256 OR d.snapshot->>'version' IS DISTINCT FROM '2'
        OR d.snapshot->'processing'->'capabilities'->>'raw' IS DISTINCT FROM 'true'
        OR d.snapshot->'processing'->'capabilities'->>'conversion' IS DISTINCT FROM 'true'
        OR(SELECT count(DISTINCT signature_role) FROM ${schema}.production_cutover_signatures WHERE manifest_id=d.id
          AND content_hash=d.content_hash AND snapshot_sha256=d.snapshot_sha256)<>2
        OR NOT EXISTS(SELECT 1 FROM ${schema}.sys_user WHERE user_id::text=NEW.operator_id AND COALESCE(to_jsonb(sys_user)->>'status','') IN('1','ACTIVE')) THEN
        RAISE EXCEPTION 'CUTOVER_ADMISSION_MANIFEST_HOLD' USING ERRCODE='23514';END IF;
      SELECT * INTO backend FROM pg_stat_activity WHERE pid=NEW.backend_pid AND datid=env.database_oid AND usesysid=env.executor_role_oid;
      SELECT count(*) INTO locks FROM pg_locks WHERE locktype='advisory' AND database=env.database_oid
        AND pid=NEW.backend_pid AND classid=17455 AND objid IN(1,2) AND objsubid=2 AND mode='ExclusiveLock' AND granted;
      IF backend.pid IS NULL OR backend.backend_start IS DISTINCT FROM NEW.backend_start OR locks<>2
        OR NEW.postmaster_start IS DISTINCT FROM pg_postmaster_start_time() THEN
        RAISE EXCEPTION 'CUTOVER_ADMISSION_BACKEND_HOLD' USING ERRCODE='23514';END IF;
      IF TG_OP='INSERT' THEN
        -- The independent issuer observes a transaction-free backend. pg_locks alone cannot distinguish xact from session locks.
        IF session_user<>env.issuer_role OR backend.state<>'idle' OR backend.xact_start IS NOT NULL
          OR NEW.consumed_at IS NOT NULL OR NEW.consumed_xid IS NOT NULL OR NEW.admission_digest<>''
          OR NEW.expires_at<=clock_timestamp() OR NEW.expires_at>clock_timestamp()+interval '10 minutes' THEN
          RAISE EXCEPTION 'CUTOVER_ADMISSION_ISSUER_HOLD' USING ERRCODE='23514';END IF;
        NEW.issued_by:=session_user;NEW.issued_at:=clock_timestamp();
        digest_payload:=jsonb_build_object('id',NEW.id,'environmentId',NEW.environment_id,'environmentGeneration',NEW.environment_generation,
          'manifestId',NEW.manifest_id,'manifestVersion',NEW.manifest_version,'contentHash',NEW.content_hash,'snapshotSha256',NEW.snapshot_sha256,
          'mode',NEW.mode,'sourceSHA',NEW.source_sha,'fenceOwner',NEW.fence_owner,'fenceGeneration',NEW.fence_generation,
          'authoritySHA256',NEW.authority_sha256,'operatorId',NEW.operator_id,'backendPID',NEW.backend_pid,
          'backendStartMicros',trunc(extract(epoch FROM NEW.backend_start)*1000000)::text,
          'postmasterStartMicros',trunc(extract(epoch FROM NEW.postmaster_start)*1000000)::text,
          'expiresMicros',trunc(extract(epoch FROM NEW.expires_at)*1000000)::text,'issuer',NEW.issued_by);
        NEW.admission_digest:=encode(sha256(convert_to(digest_payload::text,'UTF8')),'hex');RETURN NEW;
      END IF;
      IF session_user<>env.executor_role OR OLD.consumed_xid IS NOT NULL
        OR(to_jsonb(NEW)-ARRAY['consumed_at','consumed_xid']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['consumed_at','consumed_xid'])
        OR NEW.backend_pid<>pg_backend_pid() OR NEW.consumed_xid IS DISTINCT FROM pg_current_xact_id()
        OR NEW.consumed_at IS NULL OR NEW.expires_at<=clock_timestamp() THEN
        RAISE EXCEPTION 'CUTOVER_ADMISSION_CONSUMPTION_HOLD' USING ERRCODE='23514';END IF;
      NEW.consumed_at:=clock_timestamp();RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_cutover_apply_admission BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_apply_admissions
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_apply_admission();
    CREATE TRIGGER trg_cutover_apply_admission_truncate BEFORE TRUNCATE ON production_cutover_apply_admissions
      FOR EACH STATEMENT EXECUTE FUNCTION guard_cutover_apply_admission();
    CREATE FUNCTION consume_production_cutover_admission(p_id uuid,p_digest text) RETURNS uuid LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;env ${schema}.production_cutover_control_environments;history_locked boolean;
    BEGIN
      SELECT * INTO a FROM ${schema}.production_cutover_apply_admissions WHERE id=p_id FOR UPDATE;
      IF NOT FOUND OR a.admission_digest IS DISTINCT FROM p_digest OR a.consumed_xid IS NOT NULL THEN
        RAISE EXCEPTION 'CUTOVER_ADMISSION_CAS_HOLD' USING ERRCODE='23514';END IF;
      SELECT * INTO env FROM ${schema}.production_cutover_control_environments WHERE environment_id=a.environment_id AND generation=a.environment_generation;
      PERFORM ${schema}.assert_cutover_control_environment(env);
      IF session_user<>env.executor_role THEN RAISE EXCEPTION 'CUTOVER_ADMISSION_EXECUTOR_HOLD' USING ERRCODE='23514';END IF;
      SELECT COALESCE(bool_and(pg_try_advisory_xact_lock(hashtext('phoenix:cutover-history-batch'),hashtext(batch_no))),true) INTO history_locked
        FROM(SELECT DISTINCT frozen->>'batch_no' AS batch_no FROM ${schema}.production_cutover_manifests manifest
          CROSS JOIN LATERAL jsonb_array_elements(manifest.snapshot->'batches') frozen WHERE manifest.id=a.manifest_id ORDER BY batch_no) batches;
      IF NOT history_locked THEN RAISE EXCEPTION 'OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY' USING ERRCODE='23514';END IF;
      UPDATE ${schema}.production_cutover_apply_admissions SET consumed_at=clock_timestamp(),consumed_xid=pg_current_xact_id() WHERE id=a.id;
      RETURN a.manifest_id;
    END $body$;
    CREATE FUNCTION current_production_cutover_admission(p_manifest uuid DEFAULT NULL) RETURNS ${schema}.production_cutover_apply_admissions
    LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;env ${schema}.production_cutover_control_environments;actual_start timestamptz;locks integer;
    BEGIN
      SELECT * INTO a FROM ${schema}.production_cutover_apply_admissions WHERE backend_pid=pg_backend_pid()
        AND consumed_xid=pg_current_xact_id_if_assigned() AND(p_manifest IS NULL OR manifest_id=p_manifest);
      IF NOT FOUND OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CUTOVER_ADMISSION_CONTEXT_REQUIRED' USING ERRCODE='23514';END IF;
      SELECT * INTO env FROM ${schema}.production_cutover_control_environments WHERE environment_id=a.environment_id AND generation=a.environment_generation;
      PERFORM ${schema}.assert_cutover_control_environment(env);
      SELECT backend_start INTO actual_start FROM pg_stat_activity WHERE pid=pg_backend_pid();
      SELECT count(*) INTO locks FROM pg_locks WHERE locktype='advisory' AND database=env.database_oid AND pid=pg_backend_pid()
        AND classid=17455 AND objid IN(1,2) AND objsubid=2 AND mode='ExclusiveLock' AND granted;
      IF session_user<>env.executor_role OR a.backend_start IS DISTINCT FROM actual_start OR a.postmaster_start IS DISTINCT FROM pg_postmaster_start_time() OR locks<>2 THEN
        RAISE EXCEPTION 'CUTOVER_ADMISSION_CONTEXT_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
      RETURN a;
    END $body$;`);
  }
  private async runtime(q:QueryRunner,schema:string,security:string):Promise<void>{
    await q.query(`CREATE FUNCTION lock_production_cutover_authority(p_admission uuid) RETURNS void LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;
    BEGIN
      a:=${schema}.current_production_cutover_admission();
      IF a.id IS DISTINCT FROM p_admission THEN RAISE EXCEPTION 'CUTOVER_AUTHORITY_ADMISSION_HOLD' USING ERRCODE='23514';END IF;
      LOCK TABLE ${this.authorityTables.map(table=>schema+'.'+table).join(',')} IN SHARE MODE NOWAIT;
      PERFORM signature.id FROM ${schema}.production_cutover_signatures signature WHERE signature.manifest_id=a.manifest_id ORDER BY signature.id FOR SHARE NOWAIT;
      PERFORM file.file_id FROM ${schema}.file_metadata file WHERE file.file_id IN(
        SELECT proof->>'file_id' FROM ${schema}.production_cutover_manifests manifest CROSS JOIN LATERAL jsonb_array_elements(manifest.payload->'proofs') proof WHERE manifest.id=a.manifest_id
        UNION SELECT signature.evidence_file_id FROM ${schema}.production_cutover_signatures signature WHERE signature.manifest_id=a.manifest_id)
        ORDER BY file.file_id FOR SHARE NOWAIT;

      PERFORM ${schema}.current_production_cutover_admission(a.manifest_id);
    END $body$;`);

    await q.query(`CREATE FUNCTION guard_cutover_runtime_admission() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;d record;current_domain record;s record;
    BEGIN
      IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'CUTOVER_CONTROL_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
      IF TG_TABLE_NAME='production_cutover_scopes' THEN
        IF TG_OP='INSERT' THEN
          IF NEW.state<>'DRAFT' THEN RAISE EXCEPTION 'CUTOVER_SCOPE_INITIAL_DRAFT_REQUIRED' USING ERRCODE='23514';END IF;RETURN NEW;
        END IF;
        IF OLD.state IN('ACTIVE','SUSPENDED') AND OLD.activated_at IS DISTINCT FROM NEW.activated_at THEN
          RAISE EXCEPTION 'CUTOVER_ACTIVATION_TIME_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF NEW.state='DRAFT' OR OLD.state=NEW.state OR(OLD.state='ACTIVE' AND NEW.state='SUSPENDED') THEN RETURN NEW;END IF;
        IF OLD.state='SUSPENDED' AND NEW.state='ACTIVE' AND EXISTS(SELECT 1 FROM ${schema}.production_cutover_apply_results
          WHERE NEW.id=ANY(scope_ids)) THEN RETURN NEW;END IF;
        IF NEW.state NOT IN('FENCED','ACTIVE') THEN RAISE EXCEPTION 'CUTOVER_SCOPE_FIRST_ACTIVATION_HOLD' USING ERRCODE='23514';END IF;
        a:=${schema}.current_production_cutover_admission();
        SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') requested WHERE NOT EXISTS(
          SELECT 1 FROM ${schema}.mst_products product WHERE product.product_code=requested AND product.status='ACTIVE'
            AND to_jsonb(product)->>'category_code'='EGG'
            AND COALESCE(NULLIF(to_jsonb(product)->>'unit',''),to_jsonb(product)->>'unit_zh')='枚'
            AND COALESCE(NULLIF(to_jsonb(product)->>'unit_zh',''),to_jsonb(product)->>'unit')='枚')) THEN
          RAISE EXCEPTION 'CUTOVER_SCOPE_REQUIRES_ACTIVE_EGG_PRODUCT' USING ERRCODE='23514';END IF;
        IF NEW.company_code<>d.company_code OR NEW.warehouse_code<>d.warehouse_code OR NEW.manifest_sha256 IS DISTINCT FROM d.content_hash
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') h WHERE h->>'houseCode'=NEW.house_code
            AND h->>'firstProductionDate'=NEW.first_production_date::text) THEN
          RAISE EXCEPTION 'CUTOVER_SCOPE_ADMISSION_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'flocks') flock
          WHERE flock->>'flock_no'=NEW.flock_id AND flock->>'house_code'=NEW.house_code)
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'masters'->'profiles') profile
            WHERE profile->>'profile_code'=NEW.source_profile_code AND profile->>'company_code'=NEW.company_code
              AND profile->>'house_code'=NEW.house_code AND profile->>'status'='ACTIVE'
              AND(profile->>'effective_date')::date<=NEW.first_production_date
              AND(profile->>'expire_date' IS NULL OR(profile->>'expire_date')::date>=NEW.first_production_date)) THEN
          RAISE EXCEPTION 'CUTOVER_SCOPE_SOURCE_FACTS_HOLD' USING ERRCODE='23514';END IF;
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'masters'->'profiles') profile
          JOIN ${schema}.mst_products product ON EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') p WHERE p=product.product_code)
          JOIN ${schema}.product_skus sku ON sku.product_code=product.product_code
          JOIN ${schema}.packaging_specs spec ON spec.spec_code=sku.spec_code AND spec.status='ACTIVE' AND spec.base_unit='枚'
          WHERE profile->>'profile_code'=NEW.source_profile_code AND sku.status='ACTIVE'
            AND product.variety_code IS NOT DISTINCT FROM(profile->>'variety_code') AND sku.variety_code IS NOT DISTINCT FROM product.variety_code
            AND(profile->>'product_mode'='STANDARD' AND profile->>'variety_code' IS NULL
              OR profile->>'product_mode'='VARIANT' AND NULLIF(profile->>'variety_code','') IS NOT NULL)) THEN
          RAISE EXCEPTION 'CUTOVER_SCOPE_SOURCE_PRODUCT_HOLD' USING ERRCODE='23514';END IF;
        IF EXISTS(SELECT 1 FROM ${schema}.production_inventory_domains membership
          LEFT JOIN ${schema}.production_inventory_domain_states domain ON domain.id=membership.inventory_domain_id
          WHERE membership.scope_id=NEW.id AND(membership.company_code<>d.company_code OR membership.warehouse_code<>d.warehouse_code
            OR domain.id IS NULL OR domain.company_code<>membership.company_code OR domain.warehouse_code<>membership.warehouse_code
            OR domain.product_code<>membership.product_code OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') p WHERE p=membership.product_code))) THEN
          RAISE EXCEPTION 'CUTOVER_SCOPE_EXTRA_MEMBERSHIP_HOLD' USING ERRCODE='23514';END IF;
        IF NEW.state='ACTIVE' THEN NEW.activated_at:=clock_timestamp();END IF;
      ELSIF TG_TABLE_NAME='production_inventory_domain_states' THEN
        IF TG_OP='INSERT' THEN RETURN NEW;END IF;
        IF OLD.state=NEW.state OR(OLD.state='ACTIVE' AND NEW.state='SUSPENDED') THEN RETURN NEW;END IF;
        IF OLD.state='SUSPENDED' AND NEW.state='ACTIVE' AND EXISTS(SELECT 1 FROM ${schema}.production_cutover_apply_results WHERE NEW.id=ANY(domain_ids)) THEN RETURN NEW;END IF;
        a:=${schema}.current_production_cutover_admission();
        SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
        IF a.mode<>'INIT' OR NEW.company_code<>d.company_code OR NEW.warehouse_code<>d.warehouse_code
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') p WHERE p=NEW.product_code) THEN
          RAISE EXCEPTION 'CUTOVER_DOMAIN_ADMISSION_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_inventory_domain_events' THEN
        SELECT * INTO current_domain FROM ${schema}.production_inventory_domain_states WHERE id=NEW.domain_id;
        IF current_domain.state IN('ACTIVE','SUSPENDED') THEN RETURN NEW;END IF;
        a:=${schema}.current_production_cutover_admission(NEW.manifest_id);
        IF a.mode<>'INIT' THEN RAISE EXCEPTION 'CUTOVER_DOMAIN_INITIALIZATION_ONLY' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_opening_domain_claims' THEN
        a:=${schema}.current_production_cutover_admission(NEW.manifest_id);
        IF a.mode<>'INIT' THEN RAISE EXCEPTION 'CUTOVER_ATTACH_CANNOT_REOPEN' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_opening_receipts' THEN
        IF NEW.cutover_manifest_id IS NULL THEN RAISE EXCEPTION 'CUTOVER_OPENING_MANIFEST_REQUIRED' USING ERRCODE='23514';END IF;
        a:=${schema}.current_production_cutover_admission(NEW.cutover_manifest_id);
        SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
        SELECT * INTO s FROM ${schema}.production_cutover_scopes WHERE id=NEW.scope_id;
        IF a.mode<>'INIT' OR NEW.company_code<>d.company_code OR NEW.warehouse_code<>d.warehouse_code
          OR NEW.evidence_sha256 IS DISTINCT FROM d.content_hash OR NEW.manifest IS DISTINCT FROM d.payload
          OR NEW.created_by<>a.operator_id OR NEW.handover_ref<>d.document_no
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') h WHERE h->>'houseCode'=s.house_code)
          OR s.company_code<>d.company_code OR s.warehouse_code<>d.warehouse_code THEN
          RAISE EXCEPTION 'CUTOVER_OPENING_ADMISSION_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_cutover_manifests' THEN
        IF NEW.state<>'APPLIED' THEN RETURN NEW;END IF;
        a:=${schema}.current_production_cutover_admission(NEW.id);
        IF NEW.version<>a.manifest_version+1 OR NEW.content_hash IS DISTINCT FROM a.content_hash OR NEW.snapshot_sha256 IS DISTINCT FROM a.snapshot_sha256 THEN
          RAISE EXCEPTION 'CUTOVER_MANIFEST_ADMISSION_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_batch_qualifications' THEN
        IF NEW.disposition<>'ARCHIVED_TEST' THEN RETURN NEW;END IF;
        a:=${schema}.current_production_cutover_admission();
        SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
        IF NEW.company_code<>d.company_code OR NEW.evidence_sha256 IS DISTINCT FROM d.content_hash OR NEW.created_by<>a.operator_id
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'decisions') decision
            WHERE decision->>'batchNo'=NEW.batch_no AND decision->>'disposition'='ARCHIVED_TEST')
          OR NOT EXISTS(SELECT 1 FROM ${schema}.production_cutover_scopes scope WHERE scope.id=NEW.scope_id
            AND scope.company_code=d.company_code AND scope.warehouse_code=d.warehouse_code
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') h WHERE h->>'houseCode'=scope.house_code))
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'batches') batch
            LEFT JOIN ${schema}.product_skus sku ON sku.sku_code=batch->>'sku_code' WHERE batch->>'batch_no'=NEW.batch_no
              AND NEW.product_code=COALESCE(sku.product_code,batch->>'product_code','') AND NEW.sku_code=COALESCE(batch->>'sku_code','')
              AND NEW.source_type=COALESCE(batch->>'source_type','') AND NEW.source_no=COALESCE(batch->>'source_no','')) THEN
          RAISE EXCEPTION 'CUTOVER_ARCHIVE_ADMISSION_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      END IF;
      RETURN NEW;
    END $body$;`);
    for(const [table,event] of [['production_cutover_scopes','INSERT OR UPDATE'],['production_inventory_domain_states','INSERT OR UPDATE'],
      ['production_inventory_domain_events','INSERT'],['production_opening_domain_claims','INSERT'],['production_opening_receipts','INSERT'],
      ['production_cutover_manifests','UPDATE'],['production_batch_qualifications','INSERT']])
      await q.query(`CREATE TRIGGER trg_trusted_cutover_admission BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_cutover_runtime_admission()`);
    await q.query(`CREATE FUNCTION guard_cutover_apply_result() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;d record;
    BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CUTOVER_APPLY_RESULT_IMMUTABLE' USING ERRCODE='23514';END IF;
      a:=${schema}.current_production_cutover_admission(NEW.manifest_id);
      SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=NEW.manifest_id;
      IF NEW.admission_id<>a.id OR NEW.mode<>a.mode OR d.state<>'APPLIED' OR NEW.result IS DISTINCT FROM d.receipt THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_RESULT_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
      NEW.recorded_at:=clock_timestamp();RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_cutover_apply_result BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_apply_results
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_apply_result();
    CREATE TRIGGER trg_cutover_apply_result_truncate BEFORE TRUNCATE ON production_cutover_apply_results
      FOR EACH STATEMENT EXECUTE FUNCTION guard_cutover_apply_result();
    CREATE FUNCTION record_production_cutover_apply_result(p_id uuid) RETURNS jsonb LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;d record;scopes uuid[];domains uuid[];opening uuid;
    BEGIN
      SELECT * INTO a FROM ${schema}.production_cutover_apply_admissions WHERE id=p_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'CUTOVER_ADMISSION_CONTEXT_REQUIRED' USING ERRCODE='23514';END IF;
      a:=${schema}.current_production_cutover_admission(a.manifest_id);
      SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
      SELECT array_agg(s.id ORDER BY s.id) INTO scopes FROM ${schema}.production_cutover_scopes s
        WHERE s.company_code=d.company_code AND s.warehouse_code=d.warehouse_code AND s.state='ACTIVE'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') h
            WHERE h->>'houseCode'=s.house_code AND h->>'firstProductionDate'=s.first_production_date::text);
      SELECT array_agg(domain.id ORDER BY domain.id) INTO domains FROM ${schema}.production_inventory_domain_states domain
        WHERE domain.company_code=d.company_code AND domain.warehouse_code=d.warehouse_code AND domain.state='ACTIVE'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') p WHERE p=domain.product_code);
      SELECT id INTO opening FROM ${schema}.production_opening_receipts WHERE cutover_manifest_id=d.id;
      INSERT INTO ${schema}.production_cutover_apply_results(admission_id,manifest_id,mode,scope_ids,domain_ids,opening_receipt_id,result)
        VALUES(a.id,d.id,a.mode,scopes,domains,opening,d.receipt);
      RETURN d.receipt;
    END $body$;`);
    await q.query(`CREATE FUNCTION guard_cutover_executor_write() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;d record;s record;domain record;fact jsonb;
    BEGIN
      IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'CUTOVER_CONTROL_WRITE_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
      IF NOT EXISTS(SELECT 1 FROM ${schema}.production_cutover_control_environments environment JOIN pg_roles executor ON executor.oid=environment.executor_role_oid
        WHERE executor.rolname=session_user OR(NOT EXISTS(SELECT 1 FROM pg_roles actor WHERE actor.rolname=session_user AND actor.rolsuper)
          AND pg_has_role(session_user,executor.oid,'MEMBER'))) THEN
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
      IF NOT EXISTS(SELECT 1 FROM ${schema}.production_cutover_control_environments environment JOIN pg_roles executor ON executor.oid=environment.executor_role_oid
        WHERE executor.rolname=session_user AND environment.executor_role=session_user
          AND environment.generation=(SELECT max(generation) FROM ${schema}.production_cutover_control_environments)) THEN
        RAISE EXCEPTION 'CUTOVER_EXECUTOR_RETIRED_OR_INHERITED_HOLD' USING ERRCODE='23514';END IF;
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      a:=${schema}.current_production_cutover_admission();
      SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;fact:=to_jsonb(NEW);
      IF TG_TABLE_NAME='production_cutover_scopes' THEN
        IF(TG_OP='UPDATE' AND(to_jsonb(NEW)-ARRAY['state','manifest_sha256','evidence','confirmed_by','activated_at'])
            IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','manifest_sha256','evidence','confirmed_by','activated_at']))
          OR NEW.company_code<>d.company_code OR NEW.warehouse_code<>d.warehouse_code OR NEW.manifest_sha256 IS DISTINCT FROM d.content_hash
          OR NEW.state NOT IN('DRAFT','FENCED','ACTIVE') OR(TG_OP='UPDATE' AND OLD.state NOT IN('DRAFT','FENCED'))
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') house WHERE house->>'houseCode'=NEW.house_code
            AND house->>'firstProductionDate'=NEW.first_production_date::text) THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_inventory_domain_states' THEN
        IF(TG_OP='UPDATE' AND(to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','updated_at']))
          OR a.mode<>'INIT' OR NEW.company_code<>d.company_code OR NEW.warehouse_code<>d.warehouse_code OR NEW.state NOT IN('DRAFT','FENCED','ACTIVE')
          OR(TG_OP='UPDATE' AND OLD.state NOT IN('DRAFT','FENCED'))
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') product WHERE product=NEW.product_code) THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_inventory_domains' THEN
        SELECT * INTO s FROM ${schema}.production_cutover_scopes WHERE id=NEW.scope_id;
        SELECT * INTO domain FROM ${schema}.production_inventory_domain_states WHERE id=NEW.inventory_domain_id;
        IF(TG_OP='UPDATE' AND(to_jsonb(NEW)-'inventory_domain_id') IS DISTINCT FROM(to_jsonb(OLD)-'inventory_domain_id'))
          OR s.company_code<>d.company_code OR s.warehouse_code<>d.warehouse_code OR s.manifest_sha256 IS DISTINCT FROM d.content_hash
          OR s.state<>'DRAFT' OR domain.id IS NULL OR domain.company_code<>d.company_code OR domain.warehouse_code<>d.warehouse_code
          OR NEW.company_code<>domain.company_code OR NEW.warehouse_code<>domain.warehouse_code OR NEW.product_code<>domain.product_code
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') product WHERE product=NEW.product_code) THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME IN('production_inventory_domain_events','production_opening_domain_claims') THEN
        IF TG_OP<>'INSERT' OR a.mode<>'INIT' OR NEW.manifest_id<>d.id THEN RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_opening_receipts' THEN
        IF TG_OP<>'INSERT' OR a.mode<>'INIT' OR NEW.cutover_manifest_id<>d.id THEN RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_cutover_manifests' THEN
        IF TG_OP<>'UPDATE' OR NEW.id<>d.id OR OLD.state<>'APPROVED' OR NEW.state<>'APPLIED' THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_batch_qualifications' THEN
        IF TG_OP<>'INSERT' OR(NEW.disposition='ARCHIVED_TEST' OR a.mode='INIT' AND NEW.disposition='QUALIFIED' AND NEW.origin_kind='OPENING'
          AND NEW.opening_manifest_id=d.id AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'openingLines') WITH ORDINALITY line(value,n)
            WHERE NEW.batch_no='OPN-'||replace(d.id::text,'-','')||'-'||line.n::text)) IS NOT TRUE THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME IN('inv_batches','inv_ledger') THEN
        IF TG_OP<>'INSERT' OR a.mode<>'INIT' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'openingLines') WITH ORDINALITY line(value,n)
          WHERE fact->>'batch_no'='OPN-'||replace(d.id::text,'-','')||'-'||line.n::text) THEN
          RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      ELSE RAISE EXCEPTION 'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD' USING ERRCODE='23514';END IF;
      RETURN NEW;
    END $body$;`);
    for(const table of [...new Set([...this.executorInserts,...this.executorUpdates])])await q.query(`CREATE TRIGGER trg_cutover_executor_write
      BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_cutover_executor_write()`);
    await this.completion(q,schema,security);
    await q.query(`CREATE FUNCTION guard_cutover_result_seal() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    BEGIN
      IF EXISTS(SELECT 1 FROM ${schema}.production_cutover_apply_admissions admission JOIN ${schema}.production_cutover_apply_results result ON result.admission_id=admission.id
        WHERE admission.backend_pid=pg_backend_pid() AND admission.consumed_xid=pg_current_xact_id_if_assigned()) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_RESULT_ALREADY_SEALED' USING ERRCODE='23514';END IF;
      RETURN NULL;
    END $body$;`);
    for(const table of this.sealedTables)if(await q.hasTable(table))await q.query(`CREATE TRIGGER trg_cutover_result_seal BEFORE INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH STATEMENT EXECUTE FUNCTION guard_cutover_result_seal()`);
    await q.query(`CREATE FUNCTION guard_trusted_opening_namespace() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE target text;qualification ${schema}.production_batch_qualifications;manifest record;a ${schema}.production_cutover_apply_admissions;
    BEGIN
      IF TG_OP='DELETE' THEN target:=OLD.batch_no;ELSE target:=NEW.batch_no;END IF;
      IF TG_OP='UPDATE' AND OLD.batch_no ~* '^OPN-[a-f0-9]{32}-[1-9][0-9]*$' THEN target:=OLD.batch_no;END IF;
      IF target IS NULL OR target !~* '^OPN-[a-f0-9]{32}-[1-9][0-9]*$' THEN
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END IF;
      IF TG_TABLE_NAME='production_batch_qualifications' AND TG_OP='INSERT' THEN qualification:=NEW;
      ELSE SELECT * INTO qualification FROM ${schema}.production_batch_qualifications WHERE batch_no=target;END IF;
      IF qualification.batch_no IS NULL OR qualification.origin_kind<>'OPENING' OR qualification.disposition<>'QUALIFIED' OR qualification.opening_manifest_id IS NULL THEN
        RAISE EXCEPTION 'CUTOVER_OPENING_NAMESPACE_HOLD' USING ERRCODE='23514';END IF;
      SELECT * INTO manifest FROM ${schema}.production_cutover_manifests WHERE id=qualification.opening_manifest_id;
      IF manifest.id IS NULL OR manifest.state NOT IN('APPROVED','APPLIED') OR NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(manifest.payload->'openingLines') WITH ORDINALITY line(fact,n)
        WHERE target='OPN-'||replace(manifest.id::text,'-','')||'-'||line.n::text AND qualification.product_code=line.fact->>'productCode'
          AND qualification.sku_code=line.fact->>'skuCode' AND qualification.origin_ref=manifest.document_no||':'||line.n::text
          AND qualification.company_code=manifest.company_code AND qualification.evidence_sha256=manifest.content_hash) THEN
        RAISE EXCEPTION 'CUTOVER_OPENING_NAMESPACE_HOLD' USING ERRCODE='23514';END IF;
      IF TG_OP='INSERT' AND TG_TABLE_NAME IN('inv_batches','production_batch_qualifications') THEN
        a:=${schema}.current_production_cutover_admission(manifest.id);
        IF a.mode<>'INIT' THEN RAISE EXCEPTION 'CUTOVER_ATTACH_CANNOT_REOPEN' USING ERRCODE='23514';END IF;
      END IF;
      -- Baseline inv_ledger has no batch FK. An uncommitted parent is never a visible posting source.
      IF TG_TABLE_NAME='inv_ledger' AND NOT EXISTS(SELECT 1 FROM ${schema}.inv_batches batch WHERE batch.batch_no=target
        AND batch.company_code=qualification.company_code AND batch.sku_code=qualification.sku_code AND batch.source_type='OPENING' AND batch.source_no=manifest.document_no) THEN
        RAISE EXCEPTION 'CUTOVER_OPENING_NAMESPACE_HOLD' USING ERRCODE='23514';END IF;
      IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
    END $body$;`);
    for(const table of ['inv_batches','inv_ledger','production_batch_qualifications'])await q.query(`CREATE TRIGGER trg_trusted_opening_namespace
      BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_trusted_opening_namespace()`);
    await q.query(`CREATE FUNCTION guard_cutover_counted_history() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE keys text[];target text;old_key text;new_key text;frozen_manifest record;
    BEGIN
      IF TG_OP<>'INSERT' THEN old_key:=OLD.batch_no;END IF;IF TG_OP<>'DELETE' THEN new_key:=NEW.batch_no;END IF;
      SELECT array_agg(DISTINCT value ORDER BY value) INTO keys FROM unnest(ARRAY[old_key,new_key]) value WHERE value IS NOT NULL;
      FOREACH target IN ARRAY COALESCE(keys,'{}'::text[]) LOOP
        IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:cutover-history-batch'),hashtext(target)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY' USING ERRCODE='23514';END IF;
      END LOOP;
      SELECT manifest.* INTO frozen_manifest FROM ${schema}.production_cutover_apply_admissions admission
        JOIN ${schema}.production_cutover_manifests manifest ON manifest.id=admission.manifest_id
        WHERE admission.backend_pid=pg_backend_pid() AND admission.consumed_xid=pg_current_xact_id_if_assigned();
      IF FOUND AND EXISTS(SELECT 1 FROM jsonb_array_elements(frozen_manifest.payload->'decisions') decision
        WHERE decision->>'batchNo'=ANY(keys)) THEN
        RAISE EXCEPTION 'CUTOVER_COUNTED_HISTORY_READ_ONLY' USING ERRCODE='23514';END IF;
      IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
    END $body$;`);
    for(const table of ['inv_batches','inv_ledger'])await q.query(`CREATE TRIGGER trg_cutover_counted_history
      BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_cutover_counted_history()`);
  }
  private async completion(q:QueryRunner,schema:string,security:string):Promise<void>{
    await q.query(`CREATE FUNCTION check_cutover_apply_completion() RETURNS trigger LANGUAGE plpgsql ${security} AS $body$
    DECLARE a ${schema}.production_cutover_apply_admissions;r ${schema}.production_cutover_apply_results;d record;original record;
      admission_id uuid;expected_scopes integer;expected_domains integer;line_count integer;
    BEGIN
      PERFORM set_config('TimeZone','UTC',true);
      IF TG_TABLE_NAME='production_cutover_apply_admissions' THEN admission_id:=NEW.id;ELSE admission_id:=NEW.admission_id;END IF;
      SELECT * INTO a FROM ${schema}.production_cutover_apply_admissions WHERE id=admission_id;
      IF a.consumed_xid IS NULL THEN RETURN NEW;END IF;
      a:=${schema}.current_production_cutover_admission(a.manifest_id);
      SELECT * INTO r FROM ${schema}.production_cutover_apply_results WHERE production_cutover_apply_results.admission_id=a.id;
      SELECT * INTO d FROM ${schema}.production_cutover_manifests WHERE id=a.manifest_id;
      IF r.admission_id IS NULL OR r.manifest_id<>d.id OR d.state<>'APPLIED' OR d.version<>a.manifest_version+1
        OR r.mode<>a.mode OR r.result IS DISTINCT FROM d.receipt OR d.content_hash IS DISTINCT FROM a.content_hash
        OR d.snapshot_sha256 IS DISTINCT FROM a.snapshot_sha256 THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_COMPLETION_REQUIRED' USING ERRCODE='23514';END IF;
      IF(d.payload->>'postingDate')::date IS DISTINCT FROM(clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_BUSINESS_DAY_HOLD' USING ERRCODE='23514';END IF;
      expected_scopes:=jsonb_array_length(d.boundary->'houses');expected_domains:=jsonb_array_length(d.boundary->'productCodes');
      IF cardinality(r.scope_ids)<>expected_scopes OR cardinality(r.domain_ids)<>expected_domains
        OR(SELECT count(DISTINCT house_code) FROM ${schema}.production_cutover_scopes s WHERE s.id=ANY(r.scope_ids)
          AND s.state='ACTIVE' AND s.company_code=d.company_code AND s.warehouse_code=d.warehouse_code
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.boundary->'houses') h WHERE h->>'houseCode'=s.house_code
            AND h->>'firstProductionDate'=s.first_production_date::text))<>expected_scopes
        OR(SELECT count(DISTINCT product_code) FROM ${schema}.production_inventory_domain_states domain WHERE domain.id=ANY(r.domain_ids)
          AND domain.state='ACTIVE' AND domain.company_code=d.company_code AND domain.warehouse_code=d.warehouse_code
          AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.boundary->'productCodes') p WHERE p=domain.product_code))<>expected_domains
        OR EXISTS(SELECT 1 FROM unnest(r.scope_ids) expected(id) WHERE NOT EXISTS(SELECT 1 FROM ${schema}.production_inventory_domains membership
          WHERE membership.scope_id=expected.id AND membership.inventory_domain_id=ANY(r.domain_ids) AND membership.company_code=d.company_code AND membership.warehouse_code=d.warehouse_code))
        OR EXISTS(SELECT 1 FROM unnest(r.domain_ids) expected(id) WHERE NOT EXISTS(SELECT 1 FROM ${schema}.production_inventory_domains membership
          JOIN ${schema}.production_inventory_domain_states domain ON domain.id=expected.id WHERE membership.scope_id=ANY(r.scope_ids)
            AND membership.inventory_domain_id=domain.id AND membership.company_code=domain.company_code
            AND membership.warehouse_code=domain.warehouse_code AND membership.product_code=domain.product_code)) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_SCOPE_PROJECTION_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM ${schema}.production_cutover_scopes scope WHERE scope.manifest_sha256=d.content_hash
        AND(scope.state<>'ACTIVE' OR NOT scope.id=ANY(r.scope_ids))) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_UNSELECTED_SCOPE_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM ${schema}.production_inventory_domains membership
        LEFT JOIN ${schema}.production_inventory_domain_states domain ON domain.id=membership.inventory_domain_id
        WHERE membership.scope_id=ANY(r.scope_ids) AND(membership.company_code<>d.company_code OR membership.warehouse_code<>d.warehouse_code
          OR domain.id IS NULL OR domain.company_code<>membership.company_code OR domain.warehouse_code<>membership.warehouse_code
          OR domain.product_code<>membership.product_code OR(NOT domain.id=ANY(r.domain_ids) AND NOT EXISTS(
            SELECT 1 FROM ${schema}.production_cutover_apply_results prior JOIN ${schema}.production_cutover_manifests prior_manifest ON prior_manifest.id=prior.manifest_id
            WHERE prior.admission_id<>a.id AND prior_manifest.state='APPLIED' AND membership.scope_id=ANY(prior.scope_ids) AND domain.id=ANY(prior.domain_ids))))) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_EXTRA_MEMBERSHIP_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'decisions') decision WHERE decision->>'disposition'='ARCHIVED_TEST'
        AND NOT EXISTS(SELECT 1 FROM ${schema}.production_batch_qualifications q WHERE q.batch_no=decision->>'batchNo'
          AND q.disposition='ARCHIVED_TEST' AND q.company_code=d.company_code AND ${schema}.official_inventory_qualification_controlled(q.batch_no)
          AND((q.evidence_sha256=d.content_hash AND q.scope_id=ANY(r.scope_ids)) OR EXISTS(
            SELECT 1 FROM jsonb_array_elements(d.snapshot->'qualification') frozen WHERE frozen->>'batch_no'=q.batch_no
              AND frozen->>'disposition'='ARCHIVED_TEST' AND(frozen-'created_at')=(to_jsonb(q)-'created_at')
              AND(frozen->>'created_at')::timestamptz IS NOT DISTINCT FROM q.created_at)))) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_ARCHIVE_PROJECTION_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'decisions') decision WHERE decision->>'disposition'='ARCHIVED_TEST'
        AND(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'batches') frozen JOIN ${schema}.inv_batches batch ON batch.batch_no=frozen->>'batch_no'
          WHERE batch.batch_no=decision->>'batchNo' AND frozen=(to_jsonb(batch)||jsonb_build_object('unit_cost',batch.unit_cost::text)))
          OR(SELECT COALESCE(jsonb_agg(to_jsonb(journal)||jsonb_build_object('cost_change',journal.cost_change::text) ORDER BY journal.id),'[]'::jsonb)
            FROM ${schema}.inv_ledger journal WHERE journal.batch_no=decision->>'batchNo') IS DISTINCT FROM
            (SELECT COALESCE(jsonb_agg(frozen ORDER BY(frozen->>'id')::bigint),'[]'::jsonb) FROM jsonb_array_elements(d.snapshot->'ledger') frozen
              WHERE frozen->>'batch_no'=decision->>'batchNo'))) THEN
        RAISE EXCEPTION 'CUTOVER_ARCHIVE_ORIGINAL_FACTS_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'decisions') decision WHERE decision->>'disposition'='CARRY_FORWARD'
        AND(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'batches') frozen JOIN ${schema}.inv_batches batch ON batch.batch_no=frozen->>'batch_no'
          WHERE batch.batch_no=decision->>'batchNo'
            AND(frozen-ARRAY['collection_batch_ref','source_profile_code','source_profile_snapshot','store_code'])=
              ((to_jsonb(batch)||jsonb_build_object('unit_cost',batch.unit_cost::text))-ARRAY['collection_batch_ref','source_profile_code','source_profile_snapshot','store_code'])
            AND ${schema}.official_inventory_allows(batch.batch_no,batch.company_code,batch.warehouse_code,batch.product_code,batch.sku_code,batch.material_code)
            AND batch.qty=COALESCE((SELECT SUM(journal.qty_change) FROM ${schema}.inv_ledger journal WHERE journal.batch_no=batch.batch_no
              AND journal.change_type NOT IN('RESERVED','RELEASED')),0))
          OR(SELECT COALESCE(jsonb_agg((to_jsonb(journal)||jsonb_build_object('cost_change',journal.cost_change::text))-ARRAY['note','operator','store_code'] ORDER BY journal.id),'[]'::jsonb)
            FROM ${schema}.inv_ledger journal WHERE journal.batch_no=decision->>'batchNo') IS DISTINCT FROM
            (SELECT COALESCE(jsonb_agg(frozen-ARRAY['note','operator','store_code'] ORDER BY(frozen->>'id')::bigint),'[]'::jsonb)
              FROM jsonb_array_elements(d.snapshot->'ledger') frozen WHERE frozen->>'batch_no'=decision->>'batchNo'))) THEN
        RAISE EXCEPTION 'CUTOVER_CARRY_ORIGINAL_FACTS_HOLD' USING ERRCODE='23514';END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'proofs') proof WHERE NOT EXISTS(
        SELECT 1 FROM ${schema}.file_metadata file WHERE file.file_id=proof->>'file_id' AND file.checksum=proof->>'checksum'
          AND file.status='ACTIVE' AND file.deleted_at IS NULL AND file.visibility IN('PROTECTED','PRIVATE')
          AND file.module_code='PRODUCTION_CUTOVER' AND file.owner_type='WAREHOUSE' AND file.owner_id=d.warehouse_code AND file.company_code=d.company_code))
        OR(SELECT count(DISTINCT signature.signature_role) FROM ${schema}.production_cutover_signatures signature
          JOIN ${schema}.file_metadata file ON file.file_id=signature.evidence_file_id AND file.checksum=signature.evidence_checksum
          JOIN ${schema}.sys_user actor ON actor.user_id::text=signature.signed_by AND actor.username=file.uploaded_by
          WHERE signature.manifest_id=d.id AND signature.content_hash=d.content_hash AND signature.snapshot_sha256=d.snapshot_sha256
            AND COALESCE(to_jsonb(actor)->>'status','') IN('1','ACTIVE') AND file.status='ACTIVE' AND file.deleted_at IS NULL
            AND file.visibility IN('PROTECTED','PRIVATE') AND file.module_code='PRODUCTION_CUTOVER' AND file.owner_type='WAREHOUSE'
            AND file.owner_id=d.warehouse_code AND file.company_code=d.company_code)<>2 THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_ORIGINAL_PROOFS_HOLD' USING ERRCODE='23514';END IF;
      IF a.mode='INIT' THEN
        SELECT * INTO original FROM ${schema}.production_opening_receipts WHERE id=r.opening_receipt_id AND cutover_manifest_id=d.id;
        IF original.id IS NULL OR original.company_code<>d.company_code OR original.warehouse_code<>d.warehouse_code
          OR original.evidence_sha256 IS DISTINCT FROM d.content_hash OR original.manifest IS DISTINCT FROM d.payload
          OR original.receipt IS DISTINCT FROM d.receipt
          OR NOT original.scope_id=ANY(r.scope_ids) OR(SELECT count(*) FROM ${schema}.production_opening_domain_claims claim
            WHERE claim.manifest_id=d.id AND claim.domain_id=ANY(r.domain_ids) AND claim.opening_receipt_id=original.id
              AND claim.scope_id=ANY(r.scope_ids) AND claim.content_hash=d.content_hash)<>expected_domains THEN
          RAISE EXCEPTION 'CUTOVER_APPLY_OPENING_RECEIPT_HOLD' USING ERRCODE='23514';END IF;
        line_count:=jsonb_array_length(d.payload->'openingLines');
        IF(SELECT count(*) FROM ${schema}.production_batch_qualifications WHERE opening_manifest_id=d.id)<>line_count
          OR(SELECT count(*) FROM ${schema}.inv_ledger WHERE ref_no=d.document_no AND change_type='OPENING_INBOUND')<>line_count
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'openingLines') WITH ORDINALITY line(fact,n)
            WHERE NOT EXISTS(SELECT 1 FROM ${schema}.production_batch_qualifications qualification
              JOIN ${schema}.inv_batches batch ON batch.batch_no=qualification.batch_no
              JOIN ${schema}.inv_ledger ledger ON ledger.batch_no=batch.batch_no AND ledger.ref_no=d.document_no AND ledger.change_type='OPENING_INBOUND'
              WHERE qualification.batch_no='OPN-'||replace(d.id::text,'-','')||'-'||line.n::text AND qualification.opening_manifest_id=d.id
                AND qualification.origin_kind='OPENING' AND qualification.disposition='QUALIFIED' AND qualification.inventory_domain_id=ANY(r.domain_ids)
                AND(SELECT count(*) FROM ${schema}.inv_ledger all_entries WHERE all_entries.batch_no=batch.batch_no)=1
                AND batch.company_code=d.company_code AND batch.warehouse_code=d.warehouse_code AND batch.location_code=line.fact->>'locationCode'
                AND batch.sku_code=line.fact->>'skuCode' AND batch.product_code=line.fact->>'productCode'
                AND batch.grade_code_std=line.fact->>'gradeCode' AND batch.quality_grade=line.fact->>'gradeCode'
                AND batch.spec_code=line.fact->>'specCode' AND batch.packaging_spec=line.fact->>'specCode'
                AND batch.inventory_class=CASE WHEN line.fact->>'gradeCode' IN('DIRTY','BROKEN') THEN 'DEFECT_SALE' ELSE 'STANDARD' END
                AND batch.qty=(line.fact->>'quantity')::numeric AND ledger.qty_change=batch.qty AND batch.status=line.fact->>'stockStatus'
                AND ledger.company_code=batch.company_code AND ledger.warehouse_code=batch.warehouse_code AND ledger.location_code=batch.location_code
                AND ledger.sku_code=batch.sku_code AND ledger.unit='枚' AND ledger.quality_grade=line.fact->>'gradeCode'
                AND ledger.business_type='OPENING' AND ledger.log_date=(d.payload->>'postingDate')::date
                AND batch.qty_available=CASE WHEN batch.status='AVAILABLE' THEN batch.qty ELSE 0 END
                AND qualification.cost_status=line.fact->>'costStatus'
                AND batch.egg_date IS NOT DISTINCT FROM(line.fact->>'productionDate')::date
                AND batch.expire_date IS NOT DISTINCT FROM(line.fact->>'expireDate')::date
                AND batch.inbound_date IS NOT DISTINCT FROM(d.payload->>'postingDate')::date
                AND batch.unit_cost=CASE WHEN qualification.cost_status='UNKNOWN' THEN 0 ELSE(line.fact->>'unitCost')::numeric END
                AND((qualification.cost_status='UNKNOWN' AND ledger.cost_change IS NULL)
                  OR(qualification.cost_status='CONFIRMED' AND ledger.cost_change=batch.qty*(line.fact->>'unitCost')::numeric)))) THEN
          RAISE EXCEPTION 'CUTOVER_APPLY_OPENING_PHYSICAL_HOLD' USING ERRCODE='23514';END IF;
      ELSE
        IF jsonb_array_length(d.payload->'openingLines')<>0 OR r.opening_receipt_id IS NOT NULL
          OR EXISTS(SELECT 1 FROM ${schema}.production_opening_domain_claims WHERE manifest_id=d.id)
          OR EXISTS(SELECT 1 FROM ${schema}.production_opening_receipts WHERE cutover_manifest_id=d.id)
          OR EXISTS(SELECT 1 FROM ${schema}.production_batch_qualifications WHERE opening_manifest_id=d.id)
          OR EXISTS(SELECT 1 FROM ${schema}.inv_ledger WHERE ref_no=d.document_no AND change_type='OPENING_INBOUND')
          OR EXISTS(SELECT 1 FROM unnest(r.domain_ids) expected(id) WHERE NOT EXISTS(
            SELECT 1 FROM ${schema}.production_cutover_apply_results prior JOIN ${schema}.production_cutover_manifests manifest ON manifest.id=prior.manifest_id
              JOIN ${schema}.production_opening_receipts opening ON opening.id=prior.opening_receipt_id AND opening.cutover_manifest_id=manifest.id
            WHERE prior.mode='INIT' AND expected.id=ANY(prior.domain_ids) AND manifest.state='APPLIED' AND opening.evidence_sha256=manifest.content_hash)) THEN
          RAISE EXCEPTION 'CUTOVER_ATTACH_SINGLE_OPENING_HOLD' USING ERRCODE='23514';END IF;
      END IF;
      IF d.receipt->>'manifestId' IS DISTINCT FROM d.id::text OR d.receipt->>'documentNo' IS DISTINCT FROM d.document_no
        OR d.receipt->>'mode' IS DISTINCT FROM a.mode
        OR d.receipt->>'contentHash' IS DISTINCT FROM d.content_hash OR d.receipt->>'postingDate' IS DISTINCT FROM d.payload->>'postingDate'
        OR jsonb_typeof(d.receipt->'totalOpening') IS DISTINCT FROM 'number'
        OR(d.receipt->>'totalOpening')::numeric IS DISTINCT FROM(SELECT COALESCE(SUM((line->>'quantity')::numeric),0) FROM jsonb_array_elements(d.payload->'openingLines') line)
        OR jsonb_typeof(d.receipt->'batches') IS DISTINCT FROM 'array' OR jsonb_array_length(d.receipt->'batches')<>jsonb_array_length(d.payload->'openingLines')
        OR jsonb_typeof(d.receipt->'domains') IS DISTINCT FROM 'array' OR jsonb_array_length(d.receipt->'domains')<>expected_domains
        OR EXISTS(SELECT 1 FROM unnest(r.domain_ids) expected(id) WHERE NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(d.receipt->'domains') fact JOIN ${schema}.production_inventory_domain_states domain ON domain.id=expected.id
            JOIN ${schema}.production_opening_domain_claims claim ON claim.domain_id=domain.id
          WHERE fact->>'domainId'=domain.id::text AND fact->>'productCode'=domain.product_code AND fact->>'openingReceiptId'=claim.opening_receipt_id::text))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'openingLines') WITH ORDINALITY line(fact,n)
          WHERE NOT EXISTS(SELECT 1 FROM ${schema}.inv_ledger ledger WHERE ledger.batch_no='OPN-'||replace(d.id::text,'-','')||'-'||line.n::text
            AND ledger.change_type='OPENING_INBOUND' AND ledger.ref_no=d.document_no
            AND d.receipt->'batches'->((line.n-1)::integer)->>'batchNo'=ledger.batch_no
            AND(d.receipt->'batches'->((line.n-1)::integer)->>'quantity')::numeric=(line.fact->>'quantity')::numeric
            AND(d.receipt->'batches'->((line.n-1)::integer)->>'inventoryLedgerId')::bigint=ledger.id
            AND d.receipt->'batches'->((line.n-1)::integer)->>'costStatus'=line.fact->>'costStatus'
            AND d.receipt->'batches'->((line.n-1)::integer)->'unitCost'=line.fact->'unitCost'
            AND d.receipt->'batches'->((line.n-1)::integer)->>'stockStatus'=line.fact->>'stockStatus')) THEN
        RAISE EXCEPTION 'CUTOVER_APPLY_ORIGINAL_RECEIPT_HOLD' USING ERRCODE='23514';END IF;
      RETURN NEW;
    END $body$;
    CREATE CONSTRAINT TRIGGER trg_cutover_admission_completion AFTER UPDATE OF consumed_xid ON production_cutover_apply_admissions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cutover_apply_completion();
    CREATE CONSTRAINT TRIGGER trg_cutover_result_completion AFTER INSERT ON production_cutover_apply_results
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cutover_apply_completion();`);
  }
  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query(`LOCK TABLE ${this.tables.join(',')},production_cutover_scopes,production_inventory_domain_states,
        production_cutover_manifests,production_inventory_domains,production_opening_domain_claims,production_opening_receipts IN ACCESS EXCLUSIVE MODE NOWAIT`);
      for(const table of this.tables)if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('CUTOVER_EXECUTION_ADMISSION_DOWN_HOLD');
      if((await q.query('SELECT 1 FROM production_opening_receipts WHERE cutover_manifest_id IS NOT NULL LIMIT 1')).length)throw new Error('CUTOVER_EXECUTION_ADMISSION_DOWN_HOLD');
      for(const table of ['production_cutover_scopes','production_inventory_domain_states','production_inventory_domain_events',
        'production_opening_domain_claims','production_opening_receipts','production_cutover_manifests','production_batch_qualifications'])
        await q.query(`DROP TRIGGER trg_trusted_cutover_admission ON ${table}`);
      for(const table of this.sealedTables)if(await q.hasTable(table))await q.query(`DROP TRIGGER trg_cutover_result_seal ON ${table}`);
      for(const table of ['inv_batches','inv_ledger','production_batch_qualifications'])await q.query(`DROP TRIGGER trg_trusted_opening_namespace ON ${table}`);
      for(const table of ['inv_batches','inv_ledger'])await q.query(`DROP TRIGGER trg_cutover_counted_history ON ${table}`);
      for(const table of [...new Set([...this.executorInserts,...this.executorUpdates])])await q.query(`DROP TRIGGER trg_cutover_executor_write ON ${table}`);
      await q.query(`DROP TRIGGER trg_cutover_control_environment ON production_cutover_control_environments;
        DROP TRIGGER trg_cutover_control_environment_truncate ON production_cutover_control_environments;
        DROP TRIGGER trg_cutover_apply_admission ON production_cutover_apply_admissions;
        DROP TRIGGER trg_cutover_apply_admission_truncate ON production_cutover_apply_admissions;
        DROP TRIGGER trg_cutover_admission_completion ON production_cutover_apply_admissions;
        DROP TRIGGER trg_cutover_apply_result ON production_cutover_apply_results;
        DROP TRIGGER trg_cutover_apply_result_truncate ON production_cutover_apply_results;
        DROP TRIGGER trg_cutover_result_completion ON production_cutover_apply_results;`);
      for(const name of [...this.functions].reverse()){
        const functions=await q.query('SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace=current_schema()::regnamespace AND proname=$1',[name]);
        for(const f of functions)await q.query(`DROP FUNCTION ${f.signature}`);
      }
      await q.query('ALTER TABLE production_opening_receipts DROP COLUMN cutover_manifest_id');
      await q.query(`DROP TABLE ${[...this.tables].reverse().join(',')}`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
