#!/usr/bin/env node
// R4.2d offline dual-inventory support: build the canonical TypeORM
// inventory for ANY git ref WITHOUT a full workspace build. The ref's
// migration sources are extracted with `git archive`, transpiled file-by-
// file (types stripped — class identity and the TypeORM `name` getter are
// preserved), and the reviewed inventory generator
// (scripts/ci/typeorm-migration-inventory.mjs) produces the entries with
// its own single-class / effective-name / timestamp-uniqueness semantics.
// The output wraps the entries with the source ref; offline evaluation
// (ledger-preflight --fixture <collection> --inventory <file>) treats each
// ref's inventory as its candidate canonical set.
//
// Usage: node scripts/ci/ledger-source-inventory.mjs <git-ref> <out-file>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from '../../apps/api/node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const ref = process.argv[2];
const outFile = process.argv[3];
if (!ref || !outFile) {
  console.error('Usage: ledger-source-inventory.mjs <git-ref> <out-file>');
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-src-inv-'));
try {
  const tar = execFileSync('git', ['archive', ref, 'apps/api/src/database/migrations'], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(work, 'src.tar'), tar);
  fs.mkdirSync(path.join(work, 'ts'));
  execFileSync('tar', ['-x', '-C', path.join(work, 'ts'), '-f', path.join(work, 'src.tar')]);
  const jsDir = path.join(work, 'js');
  fs.mkdirSync(jsDir);
  const sources = fs.readdirSync(path.join(work, 'ts', 'apps/api/src/database/migrations')).filter((f) => f.endsWith('.ts')).sort();
  if (!sources.length) throw new Error(`no migration sources under ${ref}`);
  for (const file of sources) {
    const source = fs.readFileSync(path.join(work, 'ts', 'apps/api/src/database/migrations', file), 'utf8');
    const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } });
    fs.writeFileSync(path.join(jsDir, file.replace(/\.ts$/, '.js')), transpiled.outputText);
  }
  const inventory = JSON.parse(execFileSync(process.execPath, ['scripts/ci/typeorm-migration-inventory.mjs', jsDir], { encoding: 'utf8' }))
    // normalize the machine-specific tmp path: the migration identity is
    // (effective_name, timestamp); the source pointer is deterministic
    .map((entry) => ({ ...entry, source_file: `transpiled/${path.basename(entry.source_file)}` }));
  fs.writeFileSync(outFile, JSON.stringify({ source_ref: ref, canonicalTypeorm: inventory }, null, 2));
  console.log(`LEDGER_SOURCE_INVENTORY=${ref};entries=${inventory.length};out=${outFile}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
