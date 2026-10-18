/** In-memory authority/store ONLY for explicitly owned isolated fixtures.
 * No receipt from this helper is a production admission or release receipt. */
import assert from 'node:assert/strict';
import {bindingDigest} from '../ops/production-maintenance-receipts.mjs';
export function rootLeaseFixture({now=Date.now(),database: supplied,owner='23456789-1'}={}) {
  const h=c=>c.repeat(64),sha=c=>c.repeat(40),at=n=>new Date(now+n).toISOString();
  const pin=(c,revision=sha('a'))=>({id:h(c),imageId:'sha256:'+h(c),revision,startedAt:at(-100000),restartCount:0,running:true,health:'healthy',pid:123,status:'running',restarting:false,dead:false});
  const api=pin('1'),web=pin('2',sha('c')),db={...pin('3'),mountsSha256:h('4')};delete db.revision;
  const database=supplied||{containerId:db.id,imageId:db.imageId,containerStartedAt:db.startedAt,postmasterStartedAt:at(-90000).replace(/\.(\d{3})Z$/,(_,digits)=>'.'+digits+'000Z'),clusterSystemIdentifier:'1234567890123456789',databaseOid:16384};
  Object.assign(db,{id:database.containerId,imageId:database.imageId,startedAt:database.containerStartedAt});
  const context={schema:'phoenix.legacy-maintenance-context/v1',protocolVersion:1,owner,previousFloorSha:sha('a'),previousApiSha:sha('a'),previousWebSha:sha('c'),targetSha:sha('b'),
    window:{start:at(-300000),end:at(600000)},candidate:{imageId:'sha256:'+h('5'),revision:sha('b')},sourceHelperSha256:h('6'),schemaEvidenceSha256:h('7'),migrationPaths:[],preSnapshot:{api,web,db},executors:[api],replacement:{project:'phoenix-root-owned',composeFileSha256:h('8')}};
  const state={contextDigest:bindingDigest(context),stateDigest:h('9'),phase:'CANDIDATE_REPLACED'},records=new Map();
  let current=true;
  const store={directory:'/owned-fixture-memory-not-production',assertCurrent(){assert.equal(current,true);},readState(){return state;},assertOwnedIntent(op,phase,digest){assert.equal(op,'START_CANDIDATE');assert.equal(phase,state.phase);assert.equal(digest,state.stateDigest);},
    // Synthetic store only; actual pinned owner/state cases have separate tests.
    readOwnedState(){assert.equal(current,true);return state;},
    immutable(file,value){assert.equal(records.has(file),false,'immutable fixture record');records.set(file,structuredClone(value));},read(file){assert.ok(records.has(file),'fixture record exists');return structuredClone(records.get(file));}};
  return {context,database,state,store,records,now,archive(){current=false;},options:{context,database,approval:{fixtureOnly:true},expectedStateDigest:state.stateDigest,registerOwnedChild:child=>({registered:true,pid:child.pid})},dependencies:{store,guard(){},admit:async()=>true,now:()=>now}};
}
