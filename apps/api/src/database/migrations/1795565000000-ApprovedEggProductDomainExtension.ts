import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: sections below amend guard function definitions, without applying business changes. */
export class ApprovedEggProductDomainExtension1795565000000 implements MigrationInterface {
  private changes(schema: string) {
    const allowed = `${schema}.approved_egg_domain_extension`;
    return [
      {
        functionName:'guard_production_cutover_metadata',
        anchor:"IF current_state<>'DRAFT' OR (TG_OP='UPDATE' AND EXISTS(",
        added:`IF TG_OP='INSERT' AND current_state='ACTIVE' AND
          ${allowed}(NEW.scope_id,NEW.inventory_domain_id,NEW.company_code,NEW.warehouse_code,NEW.product_code) THEN RETURN NEW; END IF;
          `,
      },
      {
        functionName:'guard_cutover_executor_write',
        anchor:"IF TG_TABLE_NAME='production_cutover_scopes' THEN",
        added:`IF d.payload ? 'extension' THEN
          IF TG_TABLE_NAME='production_inventory_domains' THEN
            IF TG_OP='INSERT' AND ${allowed}(NEW.scope_id,NEW.inventory_domain_id,NEW.company_code,NEW.warehouse_code,NEW.product_code)
            THEN RETURN NEW; END IF;
            RAISE EXCEPTION 'CUTOVER_EXTENSION_EDGE_DENIED' USING ERRCODE='23514';
          ELSIF TG_TABLE_NAME NOT IN('production_cutover_manifests','production_inventory_domain_states',
            'production_inventory_domain_events','production_opening_domain_claims','production_opening_receipts')
            OR a.mode='ATTACH' AND TG_TABLE_NAME<>'production_cutover_manifests' THEN
            RAISE EXCEPTION 'CUTOVER_EXTENSION_WRITE_DENIED' USING ERRCODE='23514';
          END IF;
        END IF;
        `,
      },
      {
        functionName:'guard_cutover_apply_admission',
        anchor:'SELECT * INTO backend FROM pg_stat_activity WHERE pid=NEW.backend_pid',
        added:`IF d.payload ? 'extension' AND (
          (d.payload->'extension'->>'kind'='ATTACH_EXISTING_SCOPE' AND NEW.mode='ATTACH'
           OR d.payload->'extension'->>'kind'='INIT_EXISTING_SCOPE_ZERO' AND NEW.mode='INIT') IS NOT TRUE
          OR jsonb_array_length(d.boundary->'houses')<>1 OR jsonb_array_length(d.boundary->'productCodes')<>1
          OR jsonb_array_length(d.payload->'openingLines')<>0
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'decisions') item WHERE item->>'disposition'<>'CARRY_FORWARD')
        ) THEN RAISE EXCEPTION 'CUTOVER_EXTENSION_ADMISSION_HOLD' USING ERRCODE='23514'; END IF;
        `,
      },
      {
        functionName:'check_cutover_apply_completion',
        anchor:"expected_scopes:=jsonb_array_length(d.boundary->'houses');",
        added:`IF d.payload ? 'extension' THEN
          IF cardinality(r.scope_ids) IS DISTINCT FROM 1 OR cardinality(r.domain_ids) IS DISTINCT FROM 1
            OR NOT EXISTS (
              SELECT 1 FROM ${schema}.production_inventory_domains membership
              WHERE membership.scope_id=r.scope_ids[1] AND membership.inventory_domain_id=r.domain_ids[1]
              AND membership.xmin::text::numeric=mod(a.consumed_xid::text::numeric,4294967296::numeric)
              AND ${allowed}(membership.scope_id,membership.inventory_domain_id,membership.company_code,
                membership.warehouse_code,membership.product_code)
            ) THEN RAISE EXCEPTION 'CUTOVER_EXTENSION_COMPLETION_HOLD' USING ERRCODE='23514'; END IF;
          IF a.mode='INIT' AND EXISTS (SELECT 1 FROM ${schema}.inv_batches b LEFT JOIN ${schema}.product_skus sku ON sku.sku_code=b.sku_code
            WHERE (sku.product_code=d.boundary->'productCodes'->>0 OR b.material_code IS NULL AND b.product_code=d.boundary->'productCodes'->>0) AND b.warehouse_code=d.warehouse_code
              AND (b.company_code=d.company_code OR b.company_code IS NULL OR b.company_code='ALL')
              AND (b.qty IS NULL OR b.qty<>0 OR b.qty_available IS NULL OR b.qty_available<>0)
          ) THEN RAISE EXCEPTION 'CUTOVER_EXTENSION_ZERO_ONLY' USING ERRCODE='23514'; END IF;
        END IF;
        `,
      },
    ];
  }

  private async schema(q: QueryRunner): Promise<string> {
    const [{name}]=await q.query('SELECT current_schema() AS name');
    return '"' + String(name).replace(/"/g,'""') + '"';
  }

  private async patch(q: QueryRunner,schema:string,down:boolean) {
    for (const {functionName,anchor,added} of this.changes(schema)) {
      const [row]=await q.query("SELECT pg_get_functiondef($1::regprocedure) AS definition",[schema+'.'+functionName+'()']);
      const before=down?added+anchor:anchor;
      if (!row?.definition || row.definition.split(before).length!==2) {
        throw new Error(`CUTOVER_EXTENSION_GUARD_DRIFT: ${functionName}`);
      }
      await q.query(row.definition.replace(before,down?anchor:added+anchor));
    }
  }

  async up(q: QueryRunner): Promise<void> {
    const s=await this.schema(q);
    await q.query(`CREATE FUNCTION approved_egg_domain_extension(p_scope uuid,p_domain uuid,p_company text,p_warehouse text,p_product text)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,${s},pg_temp AS $body$
      DECLARE a ${s}.production_cutover_apply_admissions;d record;e jsonb;candidate record;original record;
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM ${s}.production_cutover_apply_admissions admission
          JOIN ${s}.production_cutover_control_environments env ON env.environment_id=admission.environment_id
              AND env.generation=admission.environment_generation
          WHERE admission.backend_pid=pg_backend_pid() AND admission.consumed_xid=pg_current_xact_id_if_assigned()
              AND env.executor_role=session_user) THEN RETURN false; END IF;
        a:=${s}.current_production_cutover_admission();
        SELECT * INTO d FROM ${s}.production_cutover_manifests WHERE id=a.manifest_id;
        e:=d.payload->'extension';
        IF e IS NULL OR d.company_code IS DISTINCT FROM p_company OR d.warehouse_code IS DISTINCT FROM p_warehouse
          OR jsonb_array_length(d.boundary->'houses')<>1 OR d.boundary->'productCodes' IS DISTINCT FROM jsonb_build_array(p_product)
          OR jsonb_array_length(d.payload->'openingLines')<>0 OR e->>'scopeId' IS DISTINCT FROM p_scope::text
          OR NOT EXISTS(SELECT 1 FROM ${s}.production_cutover_scopes scope
            JOIN ${s}.production_cutover_manifests origin ON origin.id::text=scope.evidence->>'manifestId'
            WHERE scope.id=p_scope AND scope.state='ACTIVE' AND scope.company_code=p_company AND scope.warehouse_code=p_warehouse
              AND scope.house_code=d.boundary->'houses'->0->>'houseCode'
              AND scope.first_production_date::text=d.boundary->'houses'->0->>'firstProductionDate'
              AND scope.version::text=e->>'scopeVersion' AND scope.manifest_sha256=e->>'scopeManifestSha256'
              AND origin.state='APPLIED' AND origin.content_hash=scope.manifest_sha256 AND origin.receipt IS NOT NULL
              AND EXISTS(SELECT 1 FROM ${s}.production_cutover_state_origins proof WHERE proof.scope_id=scope.id
                AND proof.manifest_id=origin.id))
          THEN RETURN false; END IF;
        SELECT *,xmin::text::numeric AS created_xid INTO candidate FROM ${s}.production_inventory_domain_states
          WHERE id=p_domain AND company_code=p_company AND warehouse_code=p_warehouse AND product_code=p_product;
        IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM ${s}.mst_products p WHERE p.product_code=p_product
          AND p.category_code='EGG' AND p.status='ACTIVE') THEN RETURN false; END IF;
        IF EXISTS(WITH RECURSIVE connected(id,kind) AS (
          SELECT seed.id,seed.kind FROM (VALUES(p_scope,'scope'::text),(p_domain,'domain'::text)) seed(id,kind)
          UNION
          SELECT CASE WHEN node.kind='scope' THEN edge.inventory_domain_id ELSE edge.scope_id END,
                 CASE WHEN node.kind='scope' THEN 'domain' ELSE 'scope' END
          FROM connected node JOIN ${s}.production_inventory_domains edge ON edge.company_code=p_company AND edge.warehouse_code=p_warehouse
            AND (node.kind='scope' AND edge.scope_id=node.id OR node.kind='domain' AND edge.inventory_domain_id=node.id)
        ) SELECT 1 FROM connected node
          LEFT JOIN ${s}.production_cutover_scopes scope ON node.kind='scope' AND scope.id=node.id
          LEFT JOIN ${s}.production_inventory_domain_states domain ON node.kind='domain' AND domain.id=node.id
          WHERE COALESCE(scope.state,domain.state) IS DISTINCT FROM 'ACTIVE'
            AND NOT (node.kind='domain' AND node.id=p_domain AND a.mode='INIT' AND candidate.state='DRAFT'))
        THEN RETURN false; END IF;
        IF e->>'kind'='ATTACH_EXISTING_SCOPE' AND a.mode='ATTACH' THEN
          SELECT claim.opening_receipt_id INTO original FROM ${s}.production_opening_domain_claims claim
            JOIN ${s}.production_opening_receipts receipt ON receipt.id=claim.opening_receipt_id
            JOIN ${s}.production_cutover_manifests origin ON origin.id=claim.manifest_id AND origin.state='APPLIED'
              AND origin.content_hash=claim.content_hash AND receipt.evidence_sha256=claim.content_hash
            WHERE claim.domain_id=p_domain;
          RETURN COALESCE(candidate.state='ACTIVE' AND e->>'domainId'=p_domain::text
            AND e->>'domainVersion'=candidate.version::text AND e->>'openingReceiptId'=original.opening_receipt_id::text,false);
        END IF;
        IF e->>'kind'='INIT_EXISTING_SCOPE_ZERO' AND a.mode='INIT' THEN
          RETURN COALESCE(candidate.state IN('DRAFT','ACTIVE') AND candidate.created_xid=mod(a.consumed_xid::text::numeric,4294967296::numeric)
            AND d.payload->'physicalTotals'=jsonb_build_array(jsonb_build_object('productCode',p_product,'quantity',0)),false);
        END IF;
        RETURN false;
      END $body$`);
    await q.query(`REVOKE ALL ON FUNCTION ${s}.approved_egg_domain_extension(uuid,uuid,text,text,text) FROM PUBLIC;
      ALTER FUNCTION ${s}.guard_production_cutover_metadata() SECURITY DEFINER;
      ALTER FUNCTION ${s}.guard_production_cutover_metadata() SET search_path=pg_catalog,${s},pg_temp;
      REVOKE ALL ON FUNCTION ${s}.guard_production_cutover_metadata() FROM PUBLIC`);
    // Existing enrollments give the guard functions to an isolated NOLOGIN control owner.
    const owners: Array<{ name:string }> = await q.query(`SELECT DISTINCT role.rolname AS name
      FROM pg_proc guard JOIN pg_roles role ON role.oid=guard.proowner
      WHERE guard.pronamespace=current_schema()::regnamespace
        AND guard.proname IN ('guard_cutover_executor_write','check_cutover_apply_completion')
        AND NOT role.rolcanlogin`);
    for (const owner of owners) {
      const name='"'+owner.name.replace(/"/g,'""')+'"';
      await q.query(`GRANT EXECUTE ON FUNCTION ${s}.approved_egg_domain_extension(uuid,uuid,text,text,text) TO ${name}`);
    }
    await this.patch(q,s,false);
  }

  async down(q: QueryRunner): Promise<void> {
    const s=await this.schema(q);
    const [{exists}]=await q.query(`SELECT EXISTS(SELECT 1 FROM production_cutover_manifests
      WHERE state='APPLIED' AND payload ? 'extension') AS exists`);
    if(exists) throw new Error('CUTOVER_EXTENSION_DOWN_HOLD: preserve signed existing-scope links');
    await this.patch(q,s,true);
    await q.query(`ALTER FUNCTION ${s}.guard_production_cutover_metadata() SECURITY INVOKER;
      ALTER FUNCTION ${s}.guard_production_cutover_metadata() RESET search_path;
      GRANT EXECUTE ON FUNCTION ${s}.guard_production_cutover_metadata() TO PUBLIC;
      DROP FUNCTION ${s}.approved_egg_domain_extension(uuid,uuid,text,text,text)`);
  }
}
