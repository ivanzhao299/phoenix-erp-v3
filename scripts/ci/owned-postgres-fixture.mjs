// Test infrastructure only: no discovery or fallback to arbitrary local DBs.
import { execFileSync } from 'node:child_process';
const hold = () => { throw Error('OWNED_POSTGRES_FIXTURE_REQUIRED'); };
export function requireOwnedPostgresFixture({ url, container, owner }, inspect = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) {
  let parsed;
  try { parsed = new URL(url); } catch { hold(); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || !/^(chanjet_admission_fixture|chanjet_transport_fixture[a-zA-Z0-9_]*|root_admission_review)$/.test(parsed.pathname.slice(1))
    || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{7,159}$/.test(owner || '')
    || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$/.test(container || '') || container.startsWith('phoenix-v3-')
    || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(decodeURIComponent(parsed.username || ''))) hold();
  const database = parsed.pathname.slice(1), user = decodeURIComponent(parsed.username);
  const format = '{{json .Id}}\t{{json (index .Config.Labels "phoenix.fixture.owner")}}\t{{json (index .NetworkSettings.Ports "5432/tcp")}}\t{{json .State.Running}}\t'
    + `{{range .Config.Env}}{{if eq . ${JSON.stringify(`POSTGRES_DB=${database}`)}}}DB_MATCH {{end}}{{if eq . ${JSON.stringify(`POSTGRES_USER=${user}`)}}}USER_MATCH {{end}}{{end}}`;
  // Only this allowlisted projection leaves Docker: no raw environment values,
  // no docker exec/SQL, and no container-name enumeration are permitted here.
  let fields;
  try { fields = inspect(['inspect', container, '--format', format]).trim().split('\t'); } catch { hold(); }
  if (fields.length !== 5) hold();
  let id, label, ports, running;
  try { [id, label, ports, running] = fields.slice(0, 4).map(JSON.parse); } catch { hold(); }
  const matches = new Set(fields[4].trim().split(/\s+/));
  if (!/^[a-f0-9]{64}$/.test(id || '') || label !== owner || running !== true || !matches.has('DB_MATCH') || !matches.has('USER_MATCH')
    || !Array.isArray(ports) || !ports.some(p => ['127.0.0.1', '::1'].includes(p.HostIp) && p.HostPort === (parsed.port || '5432'))
    || ports.some(p => !['127.0.0.1', '::1'].includes(p.HostIp))) hold();
  return id; // immutable instance identity: name reuse cannot retarget a write.
}
