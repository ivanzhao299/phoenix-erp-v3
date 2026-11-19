import {EntityManager} from 'typeorm';

/** Freeze only time in explicitly owned PG fixtures; every business statement/transaction still runs on PostgreSQL. */
export function freezeOwnedFlockClock(url:string,keepAuthWallClock=false):()=>void {
 const u=new URL(url);
 if(u.hostname!=='127.0.0.1'||!['/phoenix_flock_review','/phoenix_flock_lifecycle','/phoenix_flock_http','/phoenix_flock_downstream','/issue381_fixture'].includes(u.pathname))throw Error('Owned flock fixture required before freezing business time');
 if(!keepAuthWallClock)jest.useFakeTimers({now:new Date('2026-11-17T12:00:00+08:00'),doNotFake:['hrtime','nextTick','performance','queueMicrotask','setImmediate','clearImmediate','setTimeout','clearTimeout','setInterval','clearInterval']});
 const original=EntityManager.prototype.query;
 const query=jest.spyOn(EntityManager.prototype,'query').mockImplementation(function(this:EntityManager,sql:string,args?:any[]){
  const dated=sql.replace(/CURRENT_TIMESTAMP\s+AT\s+TIME\s+ZONE\s+'Asia\/Singapore'/gi,"TIMESTAMP '2026-11-17 12:00:00'").replace(/\bCURRENT_DATE\b/gi,"DATE '2026-11-17'");
  return original.call(this,dated,args);
 });
 return ()=>{query.mockRestore();if(!keepAuthWallClock)jest.useRealTimers();};
}
