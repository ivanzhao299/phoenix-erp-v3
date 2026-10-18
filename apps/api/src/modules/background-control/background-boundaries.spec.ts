import { BackgroundManifestReader, hasReadOnlyControlMount } from './background-manifest.reader';
import { BackgroundStatusController } from './background-status.controller';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifest } from './background-control.types';
import { Request } from 'express';

function valid(): BackgroundManifest {
  return { protocolVersion: 1, phase: 'OPEN', owner: 'root:run1', generation: 1, targetSha: 'a'.repeat(40), participants: [
    { bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: 'f'.repeat(64), revision: 'a'.repeat(40), allowedKinds: ['LOCAL'] },
  ] };
}
describe('trusted projection, replay and loopback boundaries', () => {
  it('denies mutable mounts, missing directory mounts and writable child overlays', () => {
    const dir = '/run/phoenix-background-control';
    const line = (path: string, mode: string) => `1 0 0:1 / ${path} ${mode},relatime - tmpfs tmpfs rw`;
    expect(hasReadOnlyControlMount(line(dir, 'ro'), dir)).toBe(true);
    expect(hasReadOnlyControlMount(line(dir, 'rw'), dir)).toBe(false);
    expect(hasReadOnlyControlMount(line('/run', 'ro'), dir)).toBe(false);
    expect(hasReadOnlyControlMount(`${line(dir, 'ro')}\n${line(`${dir}/manifest.json`, 'rw')}`, dir)).toBe(false);
  });
  it('accepts exact same-generation reads but rejects rewrites and rollback', () => {
    const reader = new BackgroundManifestReader(); const m = valid(); reader.validate(m); reader.validate(m);
    m.phase = 'FENCED'; expect(() => reader.validate(m)).toThrow('MANIFEST_GENERATION_REPLAY');
    m.generation++; reader.validate(m);
    m.generation--; expect(() => reader.validate(m)).toThrow('MANIFEST_GENERATION_REPLAY');
  });
  it.each(['boot', 'container', 'revision', 'generation', 'kind', 'duplicate'])('denies malformed %s', which => {
    const m = valid();
    if (which === 'boot') m.participants[0].bootId = 'known-hostname';
    if (which === 'container') m.participants[0].containerId = 'short';
    if (which === 'revision') m.participants[0].revision = 'partial';
    if (which === 'generation') m.generation = Number.MAX_SAFE_INTEGER + 1;
    if (which === 'kind') m.participants[0].allowedKinds = ['UNKNOWN' as never];
    if (which === 'duplicate') m.participants.push(m.participants[0]);
    expect(() => new BackgroundManifestReader().validate(m)).toThrow('MANIFEST_INVALID');
  });
  it('loopback status rejects forwarded spoofing from a non-loopback socket', () => {
    const tasks = { status: jest.fn(() => ({ inFlight: 0 })) };
    const controller = new BackgroundStatusController(tasks as unknown as BackgroundTaskService);
    const request = { socket: { remoteAddress: '172.20.0.1' }, ip: '127.0.0.1', headers: { 'x-forwarded-for': '127.0.0.1' } };
    expect(() => controller.status(request as unknown as Request)).toThrow();
    expect(tasks.status).not.toHaveBeenCalled();
    expect(controller.status({ socket: { remoteAddress: '::ffff:127.0.0.1' } } as unknown as Request)).toEqual({ inFlight: 0 });
  });
});
