// Isolated execution instrumentation: real AppModule/PG driver, synthetic remote transport.
// Never used by the deployed API or production environment.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
if (process.env.BOOTSTRAP_FIXTURE_DATABASE !== 'api_bootstrap_fixture' || process.env.DB_NAME !== 'api_bootstrap_fixture') throw Error('BOOTSTRAP_FIXTURE_ONLY');
const events = process.env.BOOTSTRAP_NETWORK_EVIDENCE;
const record = kind => fs.appendFileSync(events, JSON.stringify({ kind }) + '\n', { mode: 0o600 });
const NativeDate = Date;
const instant = NativeDate.parse('2026-10-02T01:23:11.000Z');
global.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return instant; }
};
const pg = require(path.resolve('apps/api/node_modules/pg'));
const connect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function (...args) {
  this.connectionParameters.application_name = process.env.BOOTSTRAP_CAPTURE_APP;
  return connect.apply(this, args);
};
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof opts === 'object' ? opts.host : (typeof args[1] === 'string' ? args[1] : undefined);
  if (host && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    record('BLOCKED_EXTERNAL_TCP');
    throw Error('BOOTSTRAP_EXTERNAL_TRANSPORT_FORBIDDEN');
  }
  return socketConnect.apply(this, args);
};
global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.origin === 'https://openapi.chanjet.com' && url.pathname === '/auth/appTicket/resend' && options.method === 'POST') {
    record('CHANJET_AUTH_APP_TICKET_RESEND');
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  record('BLOCKED_REMOTE_BUSINESS_OR_UNKNOWN_REQUEST');
  throw Error('BOOTSTRAP_REMOTE_BUSINESS_TRANSPORT_FORBIDDEN');
};
