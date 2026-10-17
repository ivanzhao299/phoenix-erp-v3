#!/usr/bin/env node
// Local synthetic provider fixture for the orchestration full-chain tests.
// Runs as a SEPARATE process (a sibling of the orchestrator children, never
// the test process itself) so every provider exchange crosses a real process
// boundary. Appends every hit to --hits-file as one JSON line; optionally
// destroys the socket for one path prefix (transport-fault injection).
//
// Usage:
//   node scripts/ci/chanjet-orchestration-provider-fixture.mjs \
//     --hits-file <path> [--destroy-path-prefix /accounting/...] [--port 0]
// Prints "PORT <port>" on stdout once listening.
import http from 'node:http';
import fs from 'node:fs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
};
const hitsFile = getArg('--hits-file');
const destroyPrefix = getArg('--destroy-path-prefix') || '';
const listenPort = Number(getArg('--port') || 0);
if (!hitsFile) { console.error('HITS_FILE_REQUIRED'); process.exit(2); }
fs.writeFileSync(hitsFile, '');

let tokenSeq = 0;
const server = http.createServer((req, res) => {
  const url = req.url || '';
  fs.appendFileSync(hitsFile, `${JSON.stringify({ url, at: Date.now() })}\n`);
  if (destroyPrefix && url.startsWith(destroyPrefix)) { req.socket.destroy(); return; }
  res.setHeader('Content-Type', 'application/json');
  if (url.startsWith('/v1/common/auth/selfBuiltApp/generateToken')) {
    res.end(JSON.stringify({ value: { accessToken: `SYNTHETIC_TOKEN_${++tokenSeq}`, expiresIn: 7200 } }));
    return;
  }
  res.end(JSON.stringify({ code: '200', value: [{ synthetic: true }] }));
});
server.listen(listenPort, '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
setInterval(() => {}, 1e6); // hold the event loop; the test kills the child
