// Isolated image fixture only. Never copied into the production Web image.
import http from 'node:http';
import { spawn } from 'node:child_process';
const peerOnly = process.argv.includes('--peer-only');
const owner = process.env.PHOENIX_FIXTURE_OWNER;
if (!/^[a-zA-Z0-9_.-]{8,160}$/.test(owner || '')) throw Error('FIXTURE_OWNER_REQUIRED');
const server = http.createServer((request, response) => {
  if (request.url === '/api/__fixture/http-failure') { response.writeHead(503); response.end('intentional owned fixture HTTP failure'); return; }
  if (request.url === '/api/__fixture/restart' && request.method === 'POST' && request.headers['x-fixture-owner'] === owner) {
    response.end('owned fixture process exit scheduled'); setTimeout(() => process.exit(42), 150); return;
  }
  if (request.url === '/api/readiness') { response.setHeader('content-type', 'application/json'); response.end('{"ready":true,"fixture":true}'); return; }
  response.writeHead(404); response.end('owned loopback fixture route absent');
});
server.listen(3100, peerOnly ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('WEB_EVIDENCE_FIXTURE_LOCAL_API=READY');
  console.error('WEB_EVIDENCE_FIXTURE_STDERR_CHANNEL=READY');
  if (peerOnly) return;
  const child = spawn(process.execPath, ['/app/apps/web/server.js'], { stdio: 'inherit', env: process.env });
  child.once('exit', code => process.exit(code ?? 1));
  process.once('SIGTERM', () => { child.kill('SIGTERM'); server.close(() => process.exit(0)); });
});
