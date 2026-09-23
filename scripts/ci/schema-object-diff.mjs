#!/usr/bin/env node

import fs from 'node:fs';

const FAMILIES = ['table', 'column', 'constraint', 'index', 'type'];

function parseManifest(text) {
  const records = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    if (tab <= 0) throw new Error(`invalid manifest line: ${raw}`);
    const family = raw.slice(0, tab);
    if (!FAMILIES.includes(family)) throw new Error(`unknown manifest family: ${family}`);
    const payload = raw.slice(tab + 1);
    const colon = payload.indexOf(':');
    const identity = family === 'table' ? payload : colon === -1 ? payload : payload.slice(0, colon);
    records.push({ family, identity, payload, raw });
  }
  return records;
}

function mapRecords(records) {
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, new Map()]));
  for (const record of records) {
    const family = byFamily[record.family];
    if (!family.has(record.identity)) family.set(record.identity, new Set());
    family.get(record.identity).add(record.payload);
  }
  return byFamily;
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function bounded(values, maxDiff) {
  const items = sorted(values);
  return { count: items.length, items: items.slice(0, maxDiff), truncated: items.length > maxDiff };
}

function compareFamily(production, canonical, maxDiff) {
  const productionOnly = [];
  const canonicalOnly = [];
  const mismatches = [];
  const identities = new Set([...production.keys(), ...canonical.keys()]);
  for (const identity of sorted(identities)) {
    const p = production.get(identity);
    const c = canonical.get(identity);
    if (!c) {
      productionOnly.push(identity);
      continue;
    }
    if (!p) {
      canonicalOnly.push(identity);
      continue;
    }
    const pDefs = sorted(p);
    const cDefs = sorted(c);
    if (JSON.stringify(pDefs) !== JSON.stringify(cDefs)) {
      mismatches.push({ identity, production: pDefs, canonical: cDefs });
    }
  }
  return {
    productionOnly: bounded(productionOnly, maxDiff),
    canonicalOnly: bounded(canonicalOnly, maxDiff),
    definitionMismatches: { count: mismatches.length, items: mismatches.slice(0, maxDiff), truncated: mismatches.length > maxDiff },
  };
}

export function compareManifests(productionText, canonicalText, maxDiff = 200) {
  const productionRecords = parseManifest(productionText);
  const canonicalRecords = parseManifest(canonicalText);
  const production = mapRecords(productionRecords);
  const canonical = mapRecords(canonicalRecords);
  const families = {};
  for (const family of FAMILIES) families[family] = compareFamily(production[family], canonical[family], maxDiff);

  const productionOnlyTables = families.table.productionOnly.count;
  const canonicalOnlyTables = families.table.canonicalOnly.count;
  const commonTableMismatches = families.table.definitionMismatches.count;
  const anyCanonicalOnly = FAMILIES.some((family) => families[family].canonicalOnly.count || families[family].definitionMismatches.count);
  const anyProductionOnly = FAMILIES.some((family) => families[family].productionOnly.count);
  let verdict = 'NO_OBJECT_DRIFT';
  if (anyCanonicalOnly && canonicalOnlyTables > 0) verdict = 'CANONICAL_OBJECTS_MISSING_IN_PRODUCTION';
  else if (anyCanonicalOnly) verdict = 'COMMON_OBJECT_SCHEMA_DRIFT';
  else if (anyProductionOnly) verdict = 'EXTRA_OBJECTS_ONLY';

  return {
    productionRecordCount: productionRecords.length,
    canonicalRecordCount: canonicalRecords.length,
    counts: Object.fromEntries(FAMILIES.map((family) => [family, {
      production: production[family].size,
      canonical: canonical[family].size,
    }])),
    tables: {
      productionOnly: families.table.productionOnly,
      canonicalOnly: families.table.canonicalOnly,
      common: Math.max(0, production.table.size - productionOnlyTables),
      mismatched: commonTableMismatches,
    },
    families,
    invariant: {
      netTableDelta: productionOnlyTables - canonicalOnlyTables,
      expectedNetTableDelta: production.table.size - canonical.table.size,
      valid: productionOnlyTables - canonicalOnlyTables === production.table.size - canonical.table.size,
    },
    verdict,
  };
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const productionPath = arg('--production');
  const canonicalPath = arg('--canonical');
  if (!productionPath || !canonicalPath) throw new Error('usage: schema-object-diff.mjs --production FILE --canonical FILE [--max-diff N]');
  const maxDiff = Number(arg('--max-diff', '200'));
  const result = compareManifests(fs.readFileSync(productionPath, 'utf8'), fs.readFileSync(canonicalPath, 'utf8'), maxDiff);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
