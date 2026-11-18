import { MigrationInterface,QueryRunner } from 'typeorm';

/** @allow-data-dml: Only typeorm_metadata ownership records are written; UPDATE/DELETE below describe DDL trigger events. No business rows are rewritten. */
export class OfficialProductionReportGrain1794975000000 implements MigrationInterface {
  private readonly marker='OfficialProductionReportGrain1794975000000';
  private readonly grainIndex='uq_official_production_report_shift';
  private quote(value:string){return '"'+value.replace(/"/g,'""')+'"';}
  async up(q:QueryRunner):Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try {
      await q.query('LOCK TABLE brd_daily_logs IN ACCESS EXCLUSIVE MODE');
      const rows=await q.query(`SELECT i.indexrelid,c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,
        i.indisvalid,i.indisready,i.indislive,i.indisreplident,i.indisclustered,
        EXISTS(SELECT 1 FROM unnest(i.indclass::oid[],i.indcollation::oid[],i.indkey::smallint[]) WITH ORDINALITY key(opclass,collation_id,attnum,pos)
          JOIN pg_opclass opc ON opc.oid=key.opclass JOIN pg_am am ON am.oid=opc.opcmethod
          JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.attnum
          WHERE key.pos<=i.indnkeyatts AND (NOT opc.opcdefault OR am.amname<>'btree' OR key.collation_id<>a.attcollation)) AS special_semantics,i.indpred IS NOT NULL AS partial,i.indexprs IS NOT NULL AS expression,
        con.conname,con.contype,con.condeferrable,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY key(n,pos)
          LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.n WHERE key.pos<=i.indnkeyatts ORDER BY a.attname) AS columns,
        EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.contype='f' AND fk.conindid=i.indexrelid) AS referenced
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid LEFT JOIN pg_constraint con ON con.conindid=i.indexrelid AND con.contype IN ('p','u')
        WHERE i.indrelid='brd_daily_logs'::regclass AND i.indisunique`);
      const legacy=rows.filter((r:any)=>JSON.stringify(r.columns)===JSON.stringify(['house_code','log_date']));
      for(const r of rows) {
        const dayKey=r.columns.some((c:string|null)=>c==='house_code'||c==='log_date');
        if((r.expression||r.partial)&&dayKey&&r.columns.length<3)throw new Error('OFFICIAL_REPORT_GRAIN_HOLD: unsupported partial/expression day uniqueness');
      }
      for(const r of legacy)if(!r.indisvalid||!r.indisready||!r.indislive||r.partial||r.expression||r.referenced||r.condeferrable||r.special_semantics||r.indisreplident||r.indisclustered
        ||r.contype&&r.contype!=='u'||r.conname&&r.conname!==r.name)throw new Error('OFFICIAL_REPORT_GRAIN_HOLD: legacy uniqueness needs separate dependency/semantics review');
      if(!rows.some((r:any)=>r.indisvalid&&!r.partial&&!r.expression&&!r.condeferrable&&JSON.stringify(r.columns)===JSON.stringify(['house_code','log_date','shift']))) {
        if((await q.query('SELECT to_regclass($1) AS relation',[this.grainIndex]))[0].relation)throw new Error('OFFICIAL_REPORT_GRAIN_HOLD: shift index name occupied');
        await q.query(`CREATE UNIQUE INDEX ${this.grainIndex} ON brd_daily_logs(log_date,house_code,shift)`);
        await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('OFFICIAL_REPORT_SHIFT_INDEX','brd_daily_logs',$1,$2)`,[this.marker,this.grainIndex]);
      }
      for(const r of legacy) {
        await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('OFFICIAL_REPORT_LEGACY_GRAIN','brd_daily_logs',$1,$2)`,[this.marker,JSON.stringify({name:r.name,definition:r.definition,constraint:r.conname??null})]);
        if(r.conname)await q.query(`ALTER TABLE brd_daily_logs DROP CONSTRAINT ${this.quote(r.conname)}`);
        else await q.query(`DROP INDEX ${this.quote(r.name)}`);
      }
      await q.query(`CREATE OR REPLACE FUNCTION guard_official_production_report() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE b record; scope_row record; old_scope record; house text; houses text[]; projection_only boolean;
      BEGIN
        IF TG_OP='DELETE' THEN b:=OLD;houses:=ARRAY[OLD.house_code];
        ELSIF TG_OP='UPDATE' THEN b:=NEW;houses:=ARRAY[OLD.house_code,NEW.house_code];ELSE b:=NEW;houses:=ARRAY[NEW.house_code];END IF;
        -- Row triggers may run after UPDATE has acquired a row lock. Never wait for a house lock in this inverse order.
        FOR house IN SELECT DISTINCT value FROM unnest(houses) value WHERE value IS NOT NULL ORDER BY value LOOP
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(house)) THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_BUSY: retry after recovering the original report' USING ERRCODE='23514';
          END IF;
        END LOOP;
        IF current_setting('transaction_isolation')<>'read committed' THEN
          RAISE EXCEPTION 'OFFICIAL_REPORT_ISOLATION_HOLD: report writes require READ COMMITTED' USING ERRCODE='23514';
        END IF;
        -- Includes DRAFT: a FENCE waits for an earlier writer; a later writer waits and rechecks fresh READ COMMITTED state.
        PERFORM 1 FROM production_cutover_scopes s WHERE s.house_code=ANY(houses) ORDER BY s.id FOR SHARE;
        SELECT * INTO scope_row FROM production_cutover_scopes s WHERE s.house_code=b.house_code AND s.state<>'DRAFT';
        IF TG_OP='UPDATE' AND scope_row.id IS NOT NULL AND
          ((OLD.id,OLD.house_code,OLD.log_date,OLD.shift,OLD.flock_no,OLD.occupancy_id) IS DISTINCT FROM
            (NEW.id,NEW.house_code,NEW.log_date,NEW.shift,NEW.flock_no,NEW.occupancy_id)
            OR to_jsonb(OLD)->'company_code' IS DISTINCT FROM to_jsonb(NEW)->'company_code') THEN
          RAISE EXCEPTION 'OFFICIAL_REPORT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF TG_OP IN ('UPDATE','DELETE') THEN
          SELECT * INTO old_scope FROM production_cutover_scopes s WHERE s.house_code=OLD.house_code AND s.state<>'DRAFT';
          IF old_scope.id IS NOT NULL THEN
            IF OLD.log_date<old_scope.first_production_date THEN RAISE EXCEPTION 'OFFICIAL_REPORT_ARCHIVED: historical test report is read only' USING ERRCODE='23514';END IF;
            IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OFFICIAL_REPORT_CONTROLLED_CORRECTION_REQUIRED' USING ERRCODE='23514';END IF;
            IF (OLD.id,OLD.house_code,OLD.log_date,OLD.shift,OLD.flock_no,OLD.occupancy_id) IS DISTINCT FROM
              (NEW.id,NEW.house_code,NEW.log_date,NEW.shift,NEW.flock_no,NEW.occupancy_id)
              OR to_jsonb(OLD)->'company_code' IS DISTINCT FROM to_jsonb(NEW)->'company_code' THEN
              RAISE EXCEPTION 'OFFICIAL_REPORT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
            END IF;
          END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;
        IF scope_row.id IS NOT NULL THEN
          IF b.log_date<scope_row.first_production_date THEN RAISE EXCEPTION 'OFFICIAL_REPORT_ARCHIVED: historical test report is read only' USING ERRCODE='23514';END IF;
          IF (SELECT COUNT(*) FROM production_cutover_scopes s WHERE s.house_code=b.house_code AND s.state<>'DRAFT')<>1
            OR scope_row.company_code IS DISTINCT FROM (SELECT f.company_code FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code WHERE h.house_code=b.house_code) THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_SCOPE_IDENTITY_HOLD' USING ERRCODE='23514';
          END IF;
          IF to_jsonb(b)->>'company_code' IS DISTINCT FROM scope_row.company_code OR NOT EXISTS(
            SELECT 1 FROM brd_flock_occupancies o WHERE o.id=b.occupancy_id AND o.house_code=b.house_code
              AND o.flock_no=b.flock_no AND o.company_code=scope_row.company_code
              AND o.began_on<=b.log_date AND (o.ended_on IS NULL OR o.ended_on>b.log_date)
              AND o.farm_code=to_jsonb(b)->>'farm_code' AND COALESCE(o.site_code,'')=COALESCE(to_jsonb(b)->>'site_code','')) THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_SOURCE_IDENTITY_HOLD' USING ERRCODE='23514';
          END IF;
          projection_only:=false;
          IF TG_OP='UPDATE' THEN projection_only:=(to_jsonb(OLD)-ARRAY['mortality_qty','elimination_qty','opening_qty','closing_qty','lay_rate','updated_at'])
            IS NOT DISTINCT FROM (to_jsonb(NEW)-ARRAY['mortality_qty','elimination_qty','opening_qty','closing_qty','lay_rate','updated_at']);END IF;
          IF projection_only THEN RETURN NEW;END IF;
          IF scope_row.state<>'ACTIVE' THEN RAISE EXCEPTION 'OFFICIAL_REPORT_SCOPE_CLOSED' USING ERRCODE='23514';END IF;
          IF NOT EXISTS(SELECT 1 FROM sys_dict WHERE dict_type='PRODUCTION_REPORT_SHIFT' AND dict_code=b.shift AND status='ACTIVE') THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_SHIFT_UNCONFIRMED' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM brd_daily_logs d WHERE d.house_code=b.house_code AND d.log_date=b.log_date AND d.id<>b.id
            AND (d.shift='DAILY') IS DISTINCT FROM (b.shift='DAILY')) THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_OVERLAPPING_GRAIN' USING ERRCODE='23514';
          END IF;
        ELSIF EXISTS(SELECT 1 FROM typeorm_metadata WHERE "type"='OFFICIAL_REPORT_LEGACY_GRAIN' AND "name"='OfficialProductionReportGrain1794975000000')
          AND EXISTS(SELECT 1 FROM brd_daily_logs d WHERE d.house_code=b.house_code AND d.log_date=b.log_date AND d.id<>b.id AND d.shift IS DISTINCT FROM b.shift) THEN
          RAISE EXCEPTION 'OFFICIAL_REPORT_LEGACY_DAILY_UNIQUENESS' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $body$;
      DROP TRIGGER IF EXISTS trg_official_production_report ON brd_daily_logs;
      CREATE TRIGGER trg_official_production_report BEFORE INSERT OR UPDATE OR DELETE ON brd_daily_logs
        FOR EACH ROW EXECUTE FUNCTION guard_official_production_report();
      CREATE OR REPLACE FUNCTION guard_official_report_scope_boundary() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE house text;houses text[];
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN
          RAISE EXCEPTION 'OFFICIAL_REPORT_ISOLATION_HOLD: scope writes require READ COMMITTED' USING ERRCODE='23514';
        END IF;
        IF TG_OP='DELETE' THEN houses:=ARRAY[OLD.house_code];
        ELSIF TG_OP='UPDATE' THEN houses:=ARRAY[OLD.house_code,NEW.house_code];ELSE houses:=ARRAY[NEW.house_code];END IF;
        FOR house IN SELECT DISTINCT value FROM unnest(houses) value WHERE value IS NOT NULL ORDER BY value LOOP
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(house)) THEN
            RAISE EXCEPTION 'OFFICIAL_REPORT_BUSY: report writer precedes scope boundary; retry cutover' USING ERRCODE='23514';
          END IF;
        END LOOP;
        IF TG_OP<>'DELETE' AND NEW.state<>'DRAFT' AND (TG_OP='INSERT' OR OLD.state='DRAFT') AND EXISTS(
          SELECT 1 FROM brd_daily_logs d WHERE d.house_code=NEW.house_code AND d.log_date>=NEW.first_production_date) THEN
          RAISE EXCEPTION 'OFFICIAL_REPORT_FIRST_DAY_HOLD: OFF reports overlap the proposed official first day; review the boundary' USING ERRCODE='23514';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_official_report_scope_boundary BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_scopes
        FOR EACH ROW EXECUTE FUNCTION guard_official_report_scope_boundary()`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
  async down(q:QueryRunner):Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try {
      await q.query('LOCK TABLE brd_daily_logs IN ACCESS EXCLUSIVE MODE');
      await q.query('LOCK TABLE production_cutover_scopes,production_inbound_documents,production_physical_handovers,production_opening_receipts,production_posting_periods,production_posting_period_events,production_financial_clearances,inv_ledger IN ACCESS EXCLUSIVE MODE');
      for(const table of ['production_cutover_scopes','production_inbound_documents','production_physical_handovers','production_opening_receipts','production_posting_periods','production_posting_period_events','production_financial_clearances']) {
        if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('OFFICIAL_REPORT_GRAIN_DOWN_HOLD: scope or signed facts exist');
      }
      if((await q.query("SELECT 1 FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL' LIMIT 1")).length)throw new Error('OFFICIAL_REPORT_GRAIN_DOWN_HOLD: formal ledger exists');
      const markers=await q.query(`SELECT "value" FROM typeorm_metadata WHERE "type"='OFFICIAL_REPORT_LEGACY_GRAIN' AND "name"=$1`,[this.marker]);
      for(const {value} of markers) {
        const saved=JSON.parse(value);if(typeof saved.name!=='string'||typeof saved.definition!=='string'||!saved.definition.startsWith('CREATE UNIQUE INDEX '))throw new Error('OFFICIAL_REPORT_GRAIN_DOWN_HOLD: invalid captured definition');
        await q.query(saved.definition);
        if(saved.constraint)await q.query(`ALTER TABLE brd_daily_logs ADD CONSTRAINT ${this.quote(saved.constraint)} UNIQUE USING INDEX ${this.quote(saved.name)}`);
      }
      await q.query('DROP TRIGGER IF EXISTS trg_official_report_scope_boundary ON production_cutover_scopes;DROP FUNCTION IF EXISTS guard_official_report_scope_boundary();DROP TRIGGER IF EXISTS trg_official_production_report ON brd_daily_logs;DROP FUNCTION IF EXISTS guard_official_production_report()');
      const owned=await q.query(`SELECT "value" FROM typeorm_metadata WHERE "type"='OFFICIAL_REPORT_SHIFT_INDEX' AND "name"=$1`,[this.marker]);
      for(const {value} of owned){if(value!==this.grainIndex)throw new Error('OFFICIAL_REPORT_GRAIN_DOWN_HOLD: invalid owned index');await q.query(`DROP INDEX ${this.quote(value)}`);}
      await q.query(`DELETE FROM typeorm_metadata WHERE "name"=$1 AND "type" IN ('OFFICIAL_REPORT_SHIFT_INDEX','OFFICIAL_REPORT_LEGACY_GRAIN')`,[this.marker]);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
