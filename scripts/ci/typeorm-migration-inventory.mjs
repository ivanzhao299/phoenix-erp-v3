#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migrationsDir = path.resolve(process.argv[2] ?? 'apps/api/dist/database/migrations');

function fail(message) {
  console.error(`CANONICAL_TYPEORM_INVENTORY_INVALID: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(migrationsDir)) fail(`directory not found: ${migrationsDir}`);
else {
  const inventory = [];
  const seenNames = new Set();
  const seenTimestamps = new Set();
  for (const file of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.js')).sort()) {
    const sourceFile = path.join(migrationsDir, file);
    let moduleExports;
    try { moduleExports = require(sourceFile); } catch (error) { fail(`${file}: ${error.message}`); continue; }
    const candidates = Object.values(moduleExports).filter((value) => typeof value === 'function' && value.prototype && typeof value.prototype.up === 'function' && typeof value.prototype.down === 'function');
    if (candidates.length !== 1) { fail(`${file}: expected exactly one migration class, found ${candidates.length}`); continue; }
    const Migration = candidates[0];
    let instance;
    try { instance = new Migration(); } catch (error) { fail(`${file}: cannot instantiate migration: ${error.message}`); continue; }
    const effectiveName = typeof instance.name === 'string' && instance.name.trim() ? instance.name.trim() : Migration.name;
    if (!effectiveName) { fail(`${file}: empty effective name`); continue; }
    const match = effectiveName.match(/(\d{13})$/);
    if (!match) { fail(`${file}: effective name lacks trailing 13-digit timestamp (${effectiveName})`); continue; }
    const timestamp = Number(match[1]);
    if (seenNames.has(effectiveName)) fail(`duplicate effective name: ${effectiveName}`);
    if (seenTimestamps.has(timestamp)) fail(`duplicate migration timestamp: ${timestamp}`);
    seenNames.add(effectiveName); seenTimestamps.add(timestamp);
    inventory.push({ source_file: path.relative(process.cwd(), sourceFile), class_name: Migration.name, effective_name: effectiveName, timestamp });
  }
  if (!process.exitCode) process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}
