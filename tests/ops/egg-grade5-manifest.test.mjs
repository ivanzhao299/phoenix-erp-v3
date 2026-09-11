import test from 'node:test'; import assert from 'node:assert/strict';
import { validateManifest, manifestHash, CONFIRM } from '../../scripts/ops/egg-grade5-manifest.mjs';
const base={version:1,revision:'0123456789abcdef0123456789abcdef01234567',confirmation:CONFIRM,product_code:'EGG',grade_code:'GRADE_5',spec_code:'PKG_PACK_SPEC_3',targets:[{sku_code:'SKU-G5-X',source_no:'EGG-G5-20260911',product_code:'EGG',grade_code:'GRADE_5',spec_code:'PKG_PACK_SPEC_3'}]};
test('accepts canonical tuple',()=>assert.equal(validateManifest(base),true));
test('rejects grade1/2',()=>assert.throws(()=>validateManifest({...base,grade_code:'GRADE_1'})));
test('rejects arbitrary product',()=>assert.throws(()=>validateManifest({...base,product_code:'OTHER',targets:[{...base.targets[0],product_code:'OTHER'}]})));
test('hash deterministic',()=>assert.equal(manifestHash('{}'),manifestHash('{}')));
