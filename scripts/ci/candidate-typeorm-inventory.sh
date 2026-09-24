#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?candidate API image is required}"
docker run --rm --network none --entrypoint node "$IMAGE" - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = '/app/dist/database/migrations';
const seenNames = new Set();
const seenTimestamps = new Set();
const inventory = [];
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort()) {
  const exports = require(path.join(dir, file));
  const candidates = Object.values(exports).filter((value) => typeof value === 'function' && value.prototype && typeof value.prototype.up === 'function' && typeof value.prototype.down === 'function');
  if (candidates.length !== 1) throw new Error(`${file}: expected exactly one migration class`);
  const Migration = candidates[0];
  const instance = new Migration();
  const effectiveName = typeof instance.name === 'string' && instance.name.trim() ? instance.name.trim() : Migration.name;
  const match = effectiveName.match(/(\d{13})$/);
  if (!match || seenNames.has(effectiveName) || seenTimestamps.has(match[1])) throw new Error(`${file}: invalid or duplicate effective migration identity`);
  seenNames.add(effectiveName); seenTimestamps.add(match[1]);
  inventory.push({ source_file: file, class_name: Migration.name, effective_name: effectiveName, timestamp: Number(match[1]) });
}
process.stdout.write(JSON.stringify(inventory));
NODE
