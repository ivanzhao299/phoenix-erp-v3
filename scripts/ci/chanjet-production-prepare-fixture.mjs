// Explicit owned-fixture harness. The production executable itself stays HOLD.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireChanjetBackgroundFixture, createChanjetBackgroundFixture } from './chanjet-background-fixture.mjs';
try {
  const manifest = JSON.parse(process.env.R42D_MANIFEST || 'null');
  const pgUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
  const proof = requireChanjetBackgroundFixture({ pgUrl, providerBase: process.env.CHANJET_PROVIDER_BASE_URL, manifest,
    container: process.env.CHANJET_STOP_DB_CONTAINER, owner: process.env.CHANJET_FIXTURE_OWNER });
  const entry = process.argv[2];
  if (!entry || !path.isAbsolute(entry) || path.basename(entry) !== 'chanjet-readonly-production-prepare.mjs') throw Error('FIXTURE_PREPARE_ENTRY_REQUIRED');
  const { runProductionPrepareCore } = await import(pathToFileURL(entry).href);
  await runProductionPrepareCore({ createBackground: ds => createChanjetBackgroundFixture(proof, ds) });
} catch (error) {
  console.log(`PREPARE=HOLD;${JSON.stringify({ reason: String(error?.message || error).replace(/[^A-Za-z0-9_=:-]/g, '_').slice(0, 160) })}`);
  process.exitCode = 4;
}
