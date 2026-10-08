import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { executionEnv } from './capture-production-runtime.mjs';
export const MANAGED_KEYS = ['CHANJET_APP_KEY', 'CHANJET_APP_SECRET', 'CHANJET_ORG_ID', 'CHANJET_CERT', 'CHANJET_MSG_SECRET'];

// Record spans preserve every unowned byte; unsupported syntax fails before write.
export function envRecords(source) {
  const lines = source.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
  const records = []; const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i]; const text = raw.replace(/\r?\n$/, '');
    if (/^\s*(?:#.*)?$/.test(text)) { records.push({ raw }); continue; }
    const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || seen.has(match[1])) throw new Error('ENV_UPDATE_HOLD=AMBIGUOUS_RECORD');
    const [, key, value] = match; seen.add(key);
    const quote = /^["']/.test(value) ? value[0] : null;
    if (quote) {
      const closed = v => {
        for (let k = 1; k < v.length; k++) {
          if (v[k] === '\\') { k++; continue; }
          if (v[k] === quote) return /^\s*(?:#.*)?$/.test(v.slice(k + 1));
        }
        return false;
      };
      let whole = value;
      while (!closed(whole)) {
        if (++i >= lines.length) throw new Error('ENV_UPDATE_HOLD=UNTERMINATED_QUOTE');
        raw += lines[i]; whole += '\n' + lines[i].replace(/\r?\n$/, '');
      }
    }
    records.push({ key, raw });
  }
  return records;
}
export function updateSource(source, updates) {
  for (const key of Object.keys(updates)) if (!MANAGED_KEYS.includes(key)) throw new Error('ENV_UPDATE_HOLD=UNOWNED_KEY');
  const records = envRecords(source); const replaced = new Set();
  const encode = (key, value) => {
    if (typeof value !== 'string' || value.includes('\0')) throw new Error('ENV_UPDATE_HOLD=INVALID_INPUT');
    // JSON quotes preserve escapes; $$ prevents Compose dotenv interpolation.
    return `${key}=${JSON.stringify(value.replace(/\$/g, () => '$$'))}\n`;
  };
  let output = records.map(record => {
    if (record.key && Object.hasOwn(updates, record.key)) { replaced.add(record.key); return encode(record.key, updates[record.key]); }
    return record.raw;
  }).join('');
  for (const key of MANAGED_KEYS) if (Object.hasOwn(updates, key) && !replaced.has(key)) output += (output && !output.endsWith('\n') ? '\n' : '') + encode(key, updates[key]);
  return output;
}
export function atomicUpdate(envPath, updates, { authorized = false, stagingDirectory, validate = () => {} } = {}) {
  if (!authorized) throw new Error('ENV_UPDATE_HOLD=ROTATION_NOT_AUTHORIZED');
  const metadata = fs.lstatSync(envPath); const stage = fs.lstatSync(stagingDirectory);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid() || (metadata.mode & 0o777) !== 0o600 || !stage.isDirectory() || stage.isSymbolicLink() || stage.uid !== metadata.uid || (stage.mode & 0o777) !== 0o700 || stage.dev !== metadata.dev) throw new Error('ENV_UPDATE_HOLD=OWNERSHIP_OR_STAGING');
  const source = fs.readFileSync(envPath, 'utf8'); const output = updateSource(source, updates);
  const temporary = path.join(stagingDirectory, `env-${process.pid}-${randomUUID()}`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600); fs.writeFileSync(fd, output); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.chownSync(temporary, metadata.uid, metadata.gid); fs.chmodSync(temporary, 0o600);
    validate(temporary, updates);
    const current = fs.lstatSync(envPath);
    if (current.ino !== metadata.ino || fs.readFileSync(envPath, 'utf8') !== source) throw new Error('ENV_UPDATE_HOLD=SOURCE_CHANGED');
    fs.renameSync(temporary, envPath); fs.chmodSync(envPath, 0o600);
    const dir = fs.openSync(path.dirname(envPath), 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const updates = Object.fromEntries(MANAGED_KEYS.filter(key => Object.hasOwn(process.env, key) && process.env[key] !== '').map(key => [key, process.env[key]]));
    atomicUpdate(path.resolve('.env'), updates, { authorized: process.env.ROTATE_CHANJET_CREDENTIALS === 'true', stagingDirectory: process.env.PHOENIX_ENV_STAGING_DIRECTORY,
      validate: (envFile, values) => {
        const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', envFile, '-f', path.resolve('docker-compose.yml'), 'config', '--format', 'json'], { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
        for (const [key, value] of Object.entries(values)) if (config.services.api.environment[key].replace(/\$\$/g, '$') !== value) throw new Error('ENV_UPDATE_HOLD=ROUND_TRIP');
      } });
    console.log('MANAGED_ENV_UPDATE=PASS');
  } catch { console.error('MANAGED_ENV_UPDATE=HOLD'); process.exitCode = 1; }
}
