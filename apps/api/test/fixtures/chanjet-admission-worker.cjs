// SYNTHETIC isolated PostgreSQL reservation contender; no provider transport.
const { DataSource } = require('typeorm');
let source, store, context, work;
process.on('message', async message => {
  try {
    if (message.operation === 'prepare') {
      const parsed = new URL(message.url);
      if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/chanjet_admission_fixture') throw Error('isolated fixture required');
      source = new DataSource({ type:'postgres',url:message.url,synchronize:false });
      await source.initialize();
      store = new (require(message.compiledStore).ChanjetExecutionAdmissionStore)(source.manager);
      context = message.context; work = message.work;
      process.send({ state:'READY', pid:process.pid });
    } else if (message.operation === 'checkpoint') {
      const ticket=await store.reserve(context,'BUSINESS');
      await store.acknowledge(context,ticket.ticket);
      const row=await store.finish(context,'PROBED');
      process.send({state:'CHECKPOINT',pid:process.pid,count:row.request_count,startedAt:row.started_at.toISOString(),deadlineAt:row.deadline_at.toISOString()});
      await source.destroy();process.disconnect();
    } else if (message.operation === 'resume') {
      const prior=await store.recoverInterrupted(context.manifest);
      await store.begin(context.manifest,'SYNCING',context.leaseId);
      const ticket=await store.reserve(context,'BUSINESS');await store.acknowledge(context,ticket.ticket);
      await store.finish(context,'VERIFIED');
      process.send({state:'RESUMED',pid:process.pid,countBefore:prior.request_count,phaseBefore:prior.phase,startedAt:prior.started_at.toISOString(),deadlineAt:prior.deadline_at.toISOString()});
      await source.destroy();process.disconnect();
    } else if (message.operation === 'go') {
      const results = await Promise.allSettled(Array.from({length:work}, () => store.reserve(context,'BUSINESS')));
      process.send({ state:'DONE', accepted:results.filter(r => r.status==='fulfilled').length, rejected:results.filter(r => r.status==='rejected').length });
      await source.destroy(); process.disconnect();
    }
  } catch { process.send({ state:'FAILED' }); if(source?.isInitialized) await source.destroy(); process.exitCode=1; process.disconnect(); }
});
