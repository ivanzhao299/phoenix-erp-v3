import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const compose = fs.readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
const lines = compose.split('\n');

test('every Phoenix production service has bounded Docker logs', () => {
  for (const service of ['db', 'api', 'web']) {
    const start = lines.findIndex((line) => line === `  ${service}:`);
    assert.notEqual(start, -1, `missing ${service} service`);
    const nextOffset = lines.slice(start + 1).findIndex((line) => /^  [a-zA-Z0-9_-]+:$/.test(line));
    const end = nextOffset === -1 ? lines.length : start + 1 + nextOffset;
    const block = lines.slice(start, end).join('\n');
    assert.match(block, /logging:\n\s+driver: json-file/);
    assert.match(block, /max-size: "10m"/);
    assert.match(block, /max-file: "3"/);
  }
});
