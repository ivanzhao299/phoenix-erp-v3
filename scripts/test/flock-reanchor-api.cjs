// Container-only owned fixture. Loads the real compiled background components,
// never the ERP AppModule, dotenv or a production connection configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
assert.equal(process.env.FLOCK_REANCHOR_API_FIXTURE, '1');
const config = JSON.parse(fs.readFileSync('/fixture-api-config.json', 'utf8'));
assert.equal(config.username, 'fence_fixture');
assert.equal(config.database, 'fence_reanchor_compose_test');
assert.equal(config.port, 5432);
assert.match(config.host, /^(172\.(1[6-9]|2\d|3[01])|10\.\d+|192\.168)\.\d+\.\d+$/);
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { BackgroundManifestReader } = require('/compiled/modules/background-control/background-manifest.reader.js');
const { BackgroundLockBackend } = require('/compiled/modules/background-control/background-lock.backend.js');
const { BackgroundTaskService } = require('/compiled/modules/background-control/background-task.service.js');
async function main() {
  const ds = new DataSource({ ...config, type: 'postgres', synchronize: false, entities: [], extra: { connectionTimeoutMillis: 3000 } });
  await ds.initialize();
  const service = new BackgroundTaskService(new BackgroundManifestReader(), new BackgroundLockBackend(ds));
  await service.onModuleInit();
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/api/internal/background/status') {
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await service.observeStatus()));
      } else if (request.url === '/fixture/work') {
        await service.run('owned-work', 'LOCAL', () => new Promise(resolve => setTimeout(resolve, 250))); response.end('done');
      } else response.end('ready');
    } catch { response.statusCode = 503; response.end('FENCED'); }
  }).listen(3372, '0.0.0.0');
  process.on('SIGTERM', async () => {
    await service.beforeApplicationShutdown(); server.close(); await ds.destroy(); process.exit(0);
  });
}
main().catch(() => { console.error('OWNED_API_BOOT_FAILED'); process.exitCode = 7; });
