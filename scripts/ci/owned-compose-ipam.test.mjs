import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOwnedComposeSubnet} from './owned-compose-ipam.mjs';
test('exhausted default pools do not require deleting networks; dedicated range avoids broad and host routes',()=>{
  const defaults=Array.from({length:16},(_,n)=>`172.${16+n}.0.0/16`);
  assert.equal(selectOwnedComposeSubnet([...defaults,'192.168.0.0/16','198.18.0.0/16','198.19.0.8/32']), '198.19.1.0/24');
});
test('full dedicated range occupancy or malformed inventory fails closed',()=>{
  assert.throws(()=>selectOwnedComposeSubnet(['198.18.0.0/15']),/NO_NONOVERLAPPING_RANGE/);
  for(const value of ['198.18.999.0/24','default','198.18.0.0/33','198.18.0.0;anything'])assert.throws(()=>selectOwnedComposeSubnet([value]),/INVENTORY_INVALID/);
  assert.equal(selectOwnedComposeSubnet([],511),'198.19.255.0/24');
});
