import { Injectable } from '@nestjs/common';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { BACKGROUND_KINDS, BackgroundAdmissionDeniedError, BackgroundIdentity, BackgroundManifest, BackgroundTaskKind } from './background-control.types';

export function hasReadOnlyControlMount(mountInfo: string, directory: string): boolean {
  const records = mountInfo.split('\n').map(line => line.split(' '));
  const directoryMounts = records.filter(parts => parts[4] === directory);
  if (directoryMounts.length !== 1 || !directoryMounts[0][5]?.split(',').includes('ro')) return false;
  return records.filter(parts => parts[4] === `${directory}/manifest.json`).every(parts => parts[5]?.split(',').includes('ro'));
}

/** Fixed non-secret root projection; the application has no write/control endpoint. */
@Injectable()
export class BackgroundManifestReader {
  readonly directory = '/run/phoenix-background-control';
  private generation = 0;
  private fingerprint = '';
  read(): BackgroundManifest {
    let fd: number | undefined;
    try {
      // UID 0 inside a container is not authority: the public directory itself must be a RO mount.
      if (!hasReadOnlyControlMount(readFileSync('/proc/self/mountinfo', 'utf8'), this.directory)) throw new Error('control projection not readonly');
      for (const path of ['/run', this.directory]) {
        const s = lstatSync(path);
        if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o022) !== 0) throw new Error('untrusted directory');
      }
      fd = openSync(`${this.directory}/manifest.json`, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size > 65536) throw new Error('untrusted manifest');
      const manifest: unknown = JSON.parse(readFileSync(fd, 'utf8'));
      return this.validate(manifest);
    } catch { throw new BackgroundAdmissionDeniedError('MANIFEST_UNTRUSTED'); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  validate(value: unknown): BackgroundManifest {
    const m = value as BackgroundManifest;
    const token = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
    if (!m || m.protocolVersion !== 1 || !['OPEN', 'FENCED', 'CODE_HOLD'].includes(m.phase)
      || !token(m.owner) || !Number.isSafeInteger(m.generation) || m.generation <= 0 || !/^[a-f0-9]{40}$/.test(m.targetSha)
      || !Array.isArray(m.participants) || m.participants.length > 128) throw new BackgroundAdmissionDeniedError('MANIFEST_INVALID');
    const boots = new Set<string>();
    for (const p of m.participants) {
      if (!p || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.bootId)
        || !/^[a-f0-9]{64}$/.test(p.containerId) || !/^[a-f0-9]{40}$/.test(p.revision)
        || !Array.isArray(p.allowedKinds) || p.allowedKinds.some(k => !BACKGROUND_KINDS.includes(k))
        || boots.has(p.bootId)) throw new BackgroundAdmissionDeniedError('MANIFEST_INVALID');
      boots.add(p.bootId);
    }
    const fingerprint = JSON.stringify({ protocolVersion: m.protocolVersion, phase: m.phase, owner: m.owner,
      generation: m.generation, targetSha: m.targetSha,
      participants: [...m.participants].sort((a, b) => a.bootId.localeCompare(b.bootId)).map(p => ({
        bootId: p.bootId, containerId: p.containerId, revision: p.revision, allowedKinds: [...p.allowedKinds].sort(),
      })) });
    if (m.generation < this.generation || (m.generation === this.generation && fingerprint !== this.fingerprint)) throw new BackgroundAdmissionDeniedError('MANIFEST_GENERATION_REPLAY');
    this.generation = m.generation; this.fingerprint = fingerprint;
    return m;
  }
  authorize(identity: BackgroundIdentity, kind: BackgroundTaskKind): BackgroundManifest {
    const m = this.read();
    // Root binds this random boot identity to independently inspected Docker/OCI identity.
    const p = m.participants.find(p => p.bootId === identity.bootId);
    if (m.phase !== 'OPEN' || !p || m.targetSha !== p.revision || !p.allowedKinds.includes(kind)) throw new BackgroundAdmissionDeniedError('FENCED_OR_UNAUTHORIZED');
    return m;
  }
}
