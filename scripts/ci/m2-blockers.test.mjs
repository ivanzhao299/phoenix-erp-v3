import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const helperPath = new URL('scripts/ops/capture-m2-image-baseline.sh', root).pathname;

function mockDockerFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-m2-image-baseline-'));
  const dockerPath = join(dir, 'docker');
  const statePath = join(dir, 'tags.json');
  writeFileSync(statePath, '{}\n');
  writeFileSync(dockerPath, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const statePath = process.env.M2_MOCK_TAG_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const apiId = 'sha256:${'a'.repeat(64)}';
const webId = 'sha256:${'b'.repeat(64)}';
const apiRevision = '86d18b123f823abb73a4d8cc2049cd9ef2e92402';
const webRevision = '5425089bcb51338d4780d6f37782440bade8b90c';
const last = args.at(-1);
if (args[0] === 'inspect' && args.includes('--type') && last === 'phoenix-v3-api') process.stdout.write(apiId + '\\n');
else if (args[0] === 'inspect' && args.includes('--type') && last === 'phoenix-v3-web') process.stdout.write(webId + '\\n');
else if (args[0] === 'image' && args[1] === 'inspect') {
  if (args.includes('' + apiId) && args.some((arg) => arg.includes('revision'))) process.stdout.write(apiRevision + '\\n');
  else if (args.includes('' + webId) && args.some((arg) => arg.includes('revision'))) process.stdout.write(webRevision + '\\n');
  else if (state[last]) process.stdout.write(state[last] + '\\n');
  else process.exit(1);
} else if (args[0] === 'tag') {
  state[last] = args[1];
  fs.writeFileSync(statePath, JSON.stringify(state));
} else process.exit(2);
`);
  chmodSync(dockerPath, 0o755);
  return { dir, dockerPath, statePath };
}

test('M2 image baseline helper pins running image IDs without latest/pull/build/push', () => {
  const helper = readFileSync(helperPath, 'utf8');
  assert.doesNotMatch(helper, /docker\s+(?:pull|build|push)\b/);
  const fixture = mockDockerFixture();
  try {
    const output = execFileSync('bash', [helperPath], {
      env: {
        ...process.env,
        PATH: `${fixture.dir}:${process.env.PATH}`,
        M2_MOCK_TAG_STATE: fixture.statePath,
      },
      encoding: 'utf8',
    });
    assert.match(output, /API_RUNNING_IMAGE_ID=sha256:a{64}/);
    assert.match(output, /WEB_RUNNING_IMAGE_ID=sha256:b{64}/);
    assert.match(output, /M2_API_IMAGE=phoenix-m2-api:baseline-86d18b123f823abb73a4d8cc2049cd9ef2e92402/);
    assert.match(output, /M2_WEB_IMAGE=phoenix-m2-web:baseline-5425089bcb51338d4780d6f37782440bade8b90c/);
    assert.match(output, /M2_API_IMAGE_PINNED=YES/);
    assert.match(output, /M2_WEB_IMAGE_PINNED=YES/);
    assert.match(output, /NO_LATEST_IMAGE_USAGE=YES/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('M2 image baseline helper fails closed on an unexpected revision', () => {
  const fixture = mockDockerFixture();
  try {
    assert.throws(
      () => execFileSync('bash', [helperPath, '--expected-api-revision', 'deadbeef'], {
        env: {
          ...process.env,
          PATH: `${fixture.dir}:${process.env.PATH}`,
          M2_MOCK_TAG_STATE: fixture.statePath,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      (error) => error.status === 1,
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
