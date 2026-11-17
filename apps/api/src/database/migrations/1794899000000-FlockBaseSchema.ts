import {MigrationInterface,QueryRunner} from 'typeorm';

/** Frozen SQL omits these legacy runtime tables. Create structure, never synthesize business rows.
 * Existing columns/constraints are untouched. Missing legacy columns stay NULL for explicit diagnosis.
 * Tool metadata records exactly what this migration creates; down cannot remove pre-existing objects.
 */
export class FlockBaseSchema1794899000000 implements MigrationInterface {
  private readonly marker='FlockBaseSchema1794899000000';
  private readonly tables:Record<string,Record<string,string>>={
    brd_farms:{farm_code:'varchar(64) PRIMARY KEY',farm_name:'varchar(255)',store_code:'varchar(64)',location:'varchar(255)',manager:'varchar(128)',houses:'integer',capacity:'integer',company_code:'varchar(64)',mapped_site_code:'varchar(64)',
      status:"varchar(32) NOT NULL DEFAULT 'ACTIVE'",created_at:'timestamptz NOT NULL DEFAULT now()',updated_at:'timestamptz NOT NULL DEFAULT now()'},
    brd_houses:{house_code:'varchar(64) PRIMARY KEY',house_name:'varchar(255)',farm_code:'varchar(64)',farm_name:'varchar(255)',house_type:'varchar(64)',
      max_capacity:'integer',capacity:'integer',current_birds:'integer',status:"varchar(32) NOT NULL DEFAULT 'ACTIVE'",created_at:'timestamptz NOT NULL DEFAULT now()',updated_at:'timestamptz NOT NULL DEFAULT now()'},
    brd_flocks:{flock_no:'varchar(64) PRIMARY KEY',store_code:'varchar(64)',house_code:'varchar(64)',farm_code:'varchar(64)',farm_name:'varchar(255)',company_code:'varchar(64)',site_code:'varchar(64)',
      breed_code:'varchar(64)',breed_type:'varchar(255)',strain:'varchar(255)',source_farm:'varchar(255)',placement_date:'date',start_date:'date',
      elimination_date:'date',placement_age:'integer',initial_qty:'integer',current_qty:'integer',current_lay_rate:'numeric',peak_lay_rate:'numeric',
      target_weeks:'integer',feed_conversion_ratio:'numeric',cost:'numeric',status:"varchar(32) NOT NULL DEFAULT 'GROWING'",
      created_at:'timestamptz NOT NULL DEFAULT now()',updated_at:'timestamptz NOT NULL DEFAULT now()'},
    brd_daily_logs:{id:'bigserial PRIMARY KEY',flock_no:'varchar(64)',house_code:'varchar(64)',farm_code:'varchar(64)',farm_name:'varchar(255)',
      company_code:'varchar(64)',site_code:'varchar(64)',project_code:'varchar(64)',log_date:'date NOT NULL',business_date:'date',
      shift:"varchar(64) NOT NULL DEFAULT 'DAILY'",mortality_qty:'integer',elimination_qty:'integer',mortality_reason:'text',culling_reason:'text',
      opening_qty:'integer',closing_qty:'integer',lay_rate:'numeric',eggs_produced:'integer',egg_count:'integer',dirty_eggs:'integer',broken_eggs:'integer',
      bad_eggs:'integer',self_use_qty:'integer',eggs_by_grade:'jsonb',feed_consumed:'numeric',water_consumed:'numeric',temp:'numeric',humidity:'numeric',
      note:'text',operator:'varchar(128)',created_at:'timestamptz NOT NULL DEFAULT now()',updated_at:'timestamptz NOT NULL DEFAULT now()'},
  };
  public async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE IF NOT EXISTS typeorm_metadata("type" varchar(255) NOT NULL,"database" varchar(255),"schema" varchar(255),"table" varchar(255),"name" varchar(255),"value" text)`);
    for(const [table,columns] of Object.entries(this.tables)){
      const existed=await q.hasTable(table);
      if(!existed){
        const extra=table==='brd_daily_logs'?', UNIQUE(log_date,house_code,shift)':'';
        await q.query(`CREATE TABLE IF NOT EXISTS "${table}" (${Object.entries(columns).map(([name,type])=>`"${name}" ${type}`).join(',')}${extra})`);
        await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('FLOCK_SCHEMA_TABLE',$1::varchar,$2::varchar,$1::varchar)`,[table,this.marker]);
      } else for(const [column,type] of Object.entries(columns)){
        if(await q.hasColumn(table,column))continue;
        // Unknown historical values must remain unknown; defaults would fabricate a baseline.
        const nullableType=type.replace(/ PRIMARY KEY/g,'').replace(/ NOT NULL/g,'').replace(/ DEFAULT .*/,'');
        await q.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${nullableType}`);
        await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('FLOCK_SCHEMA_COLUMN',$1,$2,$3)`,[table,this.marker,column]);
      }
    }
    for(const [table,columns] of [['brd_farms',['farm_code']],['brd_houses',['house_code']],['brd_flocks',['flock_no']],['brd_daily_logs',['id']],['brd_daily_logs',['log_date','house_code','shift']]] as Array<[string,string[]]>) {
      const nulls=columns.map(c=>`"${c}" IS NULL`).join(' OR ');
      const bad=await q.query(`SELECT 1 FROM "${table}" WHERE ${nulls} LIMIT 1`);
      const duplicates=await q.query(`SELECT 1 FROM "${table}" GROUP BY ${columns.map(c=>`"${c}"`).join(',')} HAVING COUNT(*)>1 LIMIT 1`);
      if(bad.length||duplicates.length) throw new Error(`FLOCK_BASE_SCHEMA_HOLD: ${table} (${columns.join(',')}) contains missing/duplicate identity; approved historical governance required`);
      for(const column of columns) {
        const info=await q.getTable(table);const field=info?.findColumnByName(column);
        if(field?.isNullable) {
          await q.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`);
          await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('FLOCK_SCHEMA_NOT_NULL',$1,$2,$3)`,[table,this.marker,column]);
        }
      }
      const readIndices=()=>q.query(`SELECT array_agg(a.attname::text ORDER BY a.attname)::text[] AS columns FROM pg_index i
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY key(attnum,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.attnum
        WHERE i.indrelid=$1::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL AND key.n<=i.indnkeyatts GROUP BY i.indexrelid`,[table]);
      const indices=await readIndices();
      if(!indices.some((i:any)=>JSON.stringify(i.columns)===JSON.stringify([...columns].sort()))) {
        const name=`uq_flc_${table}_${columns.join('_')}`;
        if(name.length>63)throw new Error('FLOCK_BASE_SCHEMA_HOLD: generated index name too long');
        const [collision]=await q.query('SELECT to_regclass($1) AS object',[name]);
        if(collision.object)throw new Error(`FLOCK_BASE_SCHEMA_HOLD: existing object ${name} is not the required unique identity index`);
        await q.query(`CREATE UNIQUE INDEX "${name}" ON "${table}"(${columns.map(c=>`"${c}"`).join(',')})`);
        const verified=await readIndices();
        if(!verified.some((i:any)=>JSON.stringify(i.columns)===JSON.stringify([...columns].sort())))throw new Error('FLOCK_BASE_SCHEMA_HOLD: unique identity index verification failed');
        await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('FLOCK_SCHEMA_UNIQUE',$1,$2,$3)`,[table,this.marker,name]);
      }
    }
  }
  public async down(q:QueryRunner):Promise<void>{
    const rows=await q.query(`SELECT "type","table","value" FROM typeorm_metadata WHERE "name"=$1 AND "type" IN ('FLOCK_SCHEMA_TABLE','FLOCK_SCHEMA_COLUMN','FLOCK_SCHEMA_NOT_NULL','FLOCK_SCHEMA_UNIQUE')`,[this.marker]);
    for(const r of rows){
      if(!await q.hasTable(r.table))continue;
      const where=r.type==='FLOCK_SCHEMA_COLUMN'?` WHERE "${r.value}" IS NOT NULL`:'';
      const [count]=await q.query(`SELECT COUNT(*)::integer AS n FROM "${r.table}"${where}`);
      if(count.n)throw new Error(`Flock base schema contains facts in ${r.table}; reviewed recovery required`);
    }
    for(const r of rows.filter((x:any)=>x.type==='FLOCK_SCHEMA_UNIQUE'))await q.query(`DROP INDEX IF EXISTS "${r.value}"`);
    for(const r of rows.filter((x:any)=>x.type==='FLOCK_SCHEMA_NOT_NULL'))await q.query(`ALTER TABLE "${r.table}" ALTER COLUMN "${r.value}" DROP NOT NULL`);
    for(const table of Object.keys(this.tables).reverse()){
      for(const r of rows.filter((x:any)=>x.table===table&&x.type==='FLOCK_SCHEMA_COLUMN'))await q.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${r.value}"`);
      if(rows.some((x:any)=>x.table===table&&x.type==='FLOCK_SCHEMA_TABLE'))await q.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    await q.query(`DELETE FROM typeorm_metadata WHERE "name"=$1 AND "type" IN ('FLOCK_SCHEMA_TABLE','FLOCK_SCHEMA_COLUMN','FLOCK_SCHEMA_NOT_NULL','FLOCK_SCHEMA_UNIQUE')`,[this.marker]);
  }
}
