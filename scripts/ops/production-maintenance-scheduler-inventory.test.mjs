import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionMaintenanceSchedulerUnits} from './production-maintenance-root-readers.mjs';

test('actual uninstantiated template does not abort ordinary unit properties or disappear',()=>{
 const result=partitionMaintenanceSchedulerUnits('apport-coredump-hook@.service static -\ncron.service enabled enabled\ngetty@tty1.service enabled enabled\n');
 assert.deepEqual(result.instances,['cron.service','getty@tty1.service']);
 assert.deepEqual(result.templates,['apport-coredump-hook@.service']);
 assert.equal(result.entries.length,3);
});
test('masked template state is explicit and unmasking returns its definitions to capture',()=>{
 const masked=partitionMaintenanceSchedulerUnits('example@.service masked enabled');
 assert.deepEqual(masked.templates,[]);
 assert.deepEqual(masked.maskedTemplates,[{name:'example@.service',state:'masked'}]);
 assert.deepEqual(partitionMaintenanceSchedulerUnits('example@.service disabled enabled').templates,['example@.service']);
});
test('unknown states, ambiguous duplicates and malformed identifiers fail closed',()=>{
 for(const text of ['cron.service UNVERIFIED enabled','cron.service enabled\ncron.service disabled','../cron.service enabled'])assert.throws(()=>partitionMaintenanceSchedulerUnits(text),/ROOT_READER_UNIT_INVENTORY/);
});
