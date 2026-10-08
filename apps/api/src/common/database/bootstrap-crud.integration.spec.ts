import { DataSource } from 'typeorm';
import { GenericCrudService } from '../../modules/generic-crud/generic-crud.service';
import { assertExistingSchema } from './schema-compatibility';

const url = process.env.API_BOOTSTRAP_FIXTURE_URL;
const integration = url ? describe : describe.skip;
integration('Existing schema CRUD in isolated PostgreSQL', () => {
  let ds: DataSource;
  let service: GenericCrudService;
  const statements: string[] = [];
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/api_bootstrap_fixture') throw Error('ISOLATED_BOOTSTRAP_FIXTURE_REQUIRED');
    ds = new DataSource({ type: 'postgres', url, synchronize: false, migrationsRun: false, installExtensions: false });
    await ds.initialize();
    // Explicit test schema preparation; this is outside all audited application calls.
    await ds.query('CREATE TABLE IF NOT EXISTS bootstrap_crud_fixture(id integer PRIMARY KEY, label text, updated_at timestamptz)');
    await ds.query('DELETE FROM bootstrap_crud_fixture WHERE id <> 1');
    await ds.query("INSERT INTO bootstrap_crud_fixture(id,label) VALUES(1,'existing formal fixture') ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label");
    const manager = ds.manager;
    const original = manager.query.bind(manager);
    jest.spyOn(manager, 'query').mockImplementation((sql: string, params?: unknown[]) => { statements.push(sql);return original(sql, params); });
    service = new GenericCrudService(manager);
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });
  beforeEach(() => { statements.length = 0; });

  it('uses existing schema for normal create, read and update', async () => {
    await service.create('bootstrap_crud_fixture', { id: 2, label: 'new approved fixture' });
    await service.update('bootstrap_crud_fixture', 'id', 2, { label: 'updated approved fixture' });
    await expect(service.findOneByColumn('bootstrap_crud_fixture', 'id', 2)).resolves.toMatchObject({ label: 'updated approved fixture' });
    expect(statements.some(sql => /ALTER|CREATE|DROP|setval/i.test(sql))).toBe(false);
  });

  it.each(['create', 'update'] as const)('rejects a missing %s field without DDL, retry, or changing existing data', async operation => {
    const request = operation === 'create' ? service.create('bootstrap_crud_fixture', { id: 3, unknown_field: 'private fixture value' }) : service.update('bootstrap_crud_fixture', 'id', 1, { unknown_field: 'private fixture value' });
    await expect(request).rejects.toMatchObject({ response: { code: 'SCHEMA_MISMATCH', table: 'bootstrap_crud_fixture', column: 'unknown_field' } });
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/ALTER|CREATE|DROP|setval/i);
    const rows = await ds.query('SELECT id,label FROM bootstrap_crud_fixture ORDER BY id');
    expect(rows).toContainEqual({ id: 1, label: 'existing formal fixture' });
    const columns = await ds.query("SELECT column_name FROM information_schema.columns WHERE table_name='bootstrap_crud_fixture' AND column_name='unknown_field'");
    expect(columns).toHaveLength(0);
  });

  it('metadata compatibility checks read only and leave schema gaps for controlled governance', async () => {
    await expect(assertExistingSchema(ds.manager.query.bind(ds.manager), { bootstrap_crud_fixture: ['id', 'absent'] })).rejects.toMatchObject({ response: { code: 'SCHEMA_MISMATCH', column: 'absent' } });
    expect(statements.every(sql => /^SELECT/.test(sql))).toBe(true);
  });
});
