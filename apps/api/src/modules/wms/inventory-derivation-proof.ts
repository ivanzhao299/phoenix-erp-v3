import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Server-resolved transfer item and real target; never a client authorization flag. */
export async function bindTransferDamageBatch(m:EntityManager,itemId:string|number,batchNo:string):Promise<void>{
  const [schema]=await m.query("SELECT to_regclass('production_batch_derivation_parents') AS proofs");
  if(!schema?.proofs)return;
  const [restricted]=await m.query(`SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no=$1 AND(q.processing_stage='WIP'
    OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no))`,[batchNo]);
  if(!restricted)return;
  if(!m.queryRunner?.isTransactionActive)throw new ConflictException('派生破损交接必须保留在实际接收事务内');
  const changed=await m.query(`WITH bound AS(UPDATE wms_transfer_items SET damaged_batch_no=$2 WHERE id=$1
    AND(damaged_batch_no IS NULL OR damaged_batch_no=$2) RETURNING id) SELECT id FROM bound`,[itemId,batchNo]);
  if(changed.length!==1)throw new ConflictException('破损子批已与另一实际调拨明细绑定，请保留原单核验');
}
