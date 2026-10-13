// Shared persistence only; never import a CLI entry point from this module.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONTRACT } from './production-config-guard.mjs';
import { inspectTrustedDirectory, assertSameDirectory, assertRegularFile, assertContained } from './production-trusted-paths.mjs';

export function atomicState(file, value, dependencies = {}) {
  const io = dependencies.fs || fs;
  assertContained(file, (dependencies.contract || CONTRACT).stateDirectory);
  const inspect = dependencies.inspectDirectory || (directory => inspectTrustedDirectory(directory, CONTRACT));
  const directory = path.dirname(file); const before = inspect(directory);
  const original = io.existsSync(file) ? io.lstatSync(file) : undefined;
  if (original) assertRegularFile(original);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd; let temporaryIdentity;
  try {
    fd = io.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    temporaryIdentity = io.fstatSync(fd); assertRegularFile(temporaryIdentity);
    io.writeFileSync(fd, JSON.stringify(value) + '\n'); io.fsyncSync(fd);
    const written = io.fstatSync(fd);
    io.closeSync(fd); fd = undefined;
    assertSameDirectory(before, inspect(directory));
    const named = io.lstatSync(temporary); assertRegularFile(named);
    if (named.ino !== written.ino || named.dev !== written.dev || named.size !== written.size) throw new Error('STATE_HOLD=TEMPORARY_FILE_CHANGED');
    const current = io.existsSync(file) ? io.lstatSync(file) : undefined;
    if (current) assertRegularFile(current);
    if (JSON.stringify(current && [current.dev,current.ino,current.size,current.mtimeMs]) !== JSON.stringify(original && [original.dev,original.ino,original.size,original.mtimeMs])) throw new Error('STATE_HOLD=DESTINATION_CHANGED');
    io.renameSync(temporary, file);
    const parent = io.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { io.fsyncSync(parent); } finally { io.closeSync(parent); }
    assertSameDirectory(before, inspect(directory));
  } finally {
    if (fd !== undefined) io.closeSync(fd);
    if (io.existsSync(temporary)) { const remaining = io.lstatSync(temporary); assertRegularFile(remaining); if (!temporaryIdentity || remaining.dev !== temporaryIdentity.dev || remaining.ino !== temporaryIdentity.ino) throw new Error('STATE_HOLD=FOREIGN_TEMPORARY_RETAINED'); io.unlinkSync(temporary); }
  }
}
