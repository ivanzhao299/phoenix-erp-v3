import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

export function normalizedPackingCode(input:unknown):string {
  if(typeof input!=='string')throw new BadRequestException('INVALID_BOX_SET');
  const code=input.trim();
  if(!code||code.length>100||Array.from(code).some(char => {
    const codePoint = char.charCodeAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  }))throw new BadRequestException('INVALID_BOX_SET');
  return code;
}
@Injectable()
export class PackagingBoxService {
  /** Caller holds packaging-chain and sorted original-record locks. Namespace rows serialize cross-record claims. */
  async claim(db:EntityManager,items:Array<{code:string,boxId:string,kind:'CANONICAL'|'ALIAS',eventId:string}>) {
    const codes=[...new Set(items.map(i=>normalizedPackingCode(i.code)))].sort();
    const created=new Set<string>();
    for(const code of codes){
      const added=await db.query(`INSERT INTO pkg_packing_code_registry(normalized_code,state) VALUES($1,'RETIRED') ON CONFLICT DO NOTHING RETURNING normalized_code`,[code]);
      if(added.length)created.add(code);
      await db.query('SELECT normalized_code FROM pkg_packing_code_registry WHERE normalized_code=$1 FOR UPDATE',[code]);
    }
    for(const item of items){
      const code=normalizedPackingCode(item.code);
      const [r]=await db.query('SELECT * FROM pkg_packing_code_registry WHERE normalized_code=$1',[code]);
      const claims=await db.query('SELECT * FROM pkg_packing_code_claims WHERE normalized_code=$1',[code]);
      if(item.kind==='CANONICAL' && (!created.has(code)||claims.length))throw new ConflictException('LABEL_UNRESOLVABLE');
      if(claims.some((c:any)=>c.box_id===item.boxId&&c.kind===item.kind&&c.status==='VOID'))throw new ConflictException('LABEL_UNRESOLVABLE');
      if(item.kind==='ALIAS' && r.state==='RETIRED' && !created.has(code))throw new ConflictException('LABEL_UNRESOLVABLE');
      await db.query(`INSERT INTO pkg_packing_code_claims(id,normalized_code,box_id,kind,raw_code,status,evidence_event_id)
        VALUES($1,$2,$3,$4,$5,'ACTIVE',$6) ON CONFLICT(normalized_code,box_id,kind) DO NOTHING`,[randomUUID(),code,item.boxId,item.kind,item.code,item.eventId]);
      const owners=[...new Set([...claims.filter((c:any)=>c.status==='ACTIVE').map((c:any)=>c.box_id),item.boxId])];
      await db.query('UPDATE pkg_packing_code_registry SET state=$2,owner_box_id=$3 WHERE normalized_code=$1',
        [code,owners.length===1?'BOUND':'AMBIGUOUS',owners.length===1?owners[0]:null]);
    }
  }
  async resolve(db:EntityManager,packingId:string,labelCode:string) {
    const code=normalizedPackingCode(labelCode);
    const [box]=await db.query(`SELECT b.*,r.normalized_code FROM pkg_packing_code_registry r
      JOIN pkg_packing_boxes b ON b.id=r.owner_box_id JOIN pkg_packing_code_claims c ON c.normalized_code=r.normalized_code AND c.box_id=b.id AND c.status='ACTIVE'
      WHERE r.normalized_code=$1 AND r.state='BOUND' AND b.packing_id=$2 LIMIT 1`,[code,packingId]);
    if(!box)throw new ConflictException('LABEL_UNRESOLVABLE');
    return box;
  }
}
