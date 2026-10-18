/** Isolated child process only. No production discovery or credentials. */
import { execFileSync } from 'node:child_process';
const [mode, containerId, endpoint] = process.argv.slice(2);
if (process.env.MAINTENANCE_OWNED_FIXTURE !== '1' || !/^[a-f0-9]{64}$/.test(containerId || '')) process.exit(70);
const docker = args => execFileSync('docker', args, { encoding: 'utf8', env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
const labels = JSON.parse(docker(['inspect', containerId, '--format', '{{json .Config.Labels}}']));
if (labels?.['phoenix.test.kind'] !== 'legacy-maintenance' || labels?.['phoenix.test.owner'] !== process.env.MAINTENANCE_FIXTURE_OWNER) process.exit(71);
const sql = statement => docker(['exec', containerId, 'psql', '-U', 'maintenance_fixture', '-d', 'maintenance_fixture', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement]);
if (mode === 'send-before-log') {
  const url = new URL(endpoint);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') process.exit(72);
  await fetch(url, { method: 'POST', body: 'fixture-notification' });
  process.send?.({ event: 'external-send-complete' });
  // Parent crashes this process before the durable delivery receipt can exist.
  await new Promise(resolve => setTimeout(resolve, 60000));
  sql("INSERT INTO fixture_delivery_receipts(id) VALUES (1)");
} else if (mode === 'partial-iot') {
  sql("INSERT INTO fixture_iot_commits(id) VALUES (1)");
  process.send?.({ event: 'first-commit-complete' });
  await new Promise(resolve => setTimeout(resolve, 60000));
  sql("INSERT INTO fixture_iot_commits(id) VALUES (2)");
} else process.exit(73);
