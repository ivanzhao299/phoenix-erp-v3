import {BadRequestException} from '@nestjs/common';
import {EntityManager} from 'typeorm';
import {randomUUID} from 'crypto';
import {birdCount} from '../farm/daily-stock-policy';

export async function writeHenhouse(m:EntityManager,body:Record<string,unknown>,existing?:{pkName:string;id:unknown}){
 const valid=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
 if(!body||Object.keys(body).some(key=>!valid.test(key))||existing&&!valid.test(existing.pkName))throw new BadRequestException('鸡舍字段无效');
 return m.transaction(async tx=>{
  const [identity]=existing?await tx.query(`SELECT house_code FROM brd_houses WHERE "${existing.pkName}"=$1`,[existing.id]):[];
  const code=existing?identity?.house_code:`HSE-${randomUUID().replace(/-/g,'').slice(0,20).toUpperCase()}`;
  if(!code)throw new BadRequestException('鸡舍不存在');
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[code]);
  const [current]=existing?await tx.query('SELECT * FROM brd_houses WHERE house_code=$1 FOR UPDATE',[code]):[];
  if(current)for(const key of ['house_code','farm_code'])if(body[key]!==undefined&&body[key]!==current[key])throw new BadRequestException('鸡舍编码及农场归属不可直接变更，须核对追溯关系');
  if(body.current_birds!==undefined&&Number(body.current_birds)!==0)throw new BadRequestException('鸡舍存栏来自群事件账，设施档案不能写数量');
  const farmCode=String(body.farm_code??current?.farm_code??'');
  const [farm]=await tx.query("SELECT farm_code,farm_name FROM brd_farms WHERE farm_code=$1 AND status='ACTIVE' FOR SHARE",[farmCode]);
  if(!farm)throw new BadRequestException('请选择有效农场；鸡舍必须有真实启用归属');
  if(body.status!==undefined&&!['ACTIVE','INACTIVE'].includes(String(body.status)))throw new BadRequestException('设施状态只能启用/停用，清舍验收走独立流程');
  const capacity=body.max_capacity??body.capacity;
  if(capacity!==undefined&&(birdCount(capacity,'设计容量')<1))throw new BadRequestException('设计容量必须为正整数');
  if(body.capacity!==undefined&&body.max_capacity!==undefined&&Number(body.capacity)!==Number(body.max_capacity))throw new BadRequestException('设计容量字段不一致');
  const active=current?await tx.query("SELECT 1 FROM brd_flocks WHERE house_code=$1 AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0) LIMIT 1",[code]):[];
  if(active.length&&capacity!==undefined&&Number(capacity)!==Number(current.max_capacity??current.capacity))throw new BadRequestException('在栏期间不能改设施容量，须先核对并关闭占栏');
  if(current&&body.status!==undefined&&body.status!=='ACTIVE'){
   if(active.length)throw new BadRequestException('鸡舍仍有在栏或待核对群，不能停用；清舍请用独立验收流程');
   const [tables]=await tx.query("SELECT to_regclass('brd_flock_documents') AS docs,to_regclass('inv_batches') AS stock,to_regclass('mon_house_device_mapping') AS devices,to_regclass('brd_flock_held_balances') AS held");
   if(tables?.held&&(await tx.query('SELECT 1 FROM brd_flock_held_balances WHERE house_code=$1 AND quantity>0 LIMIT 1',[code])).length)throw new BadRequestException('鸡舍仍有实际待售鸡余额，请先交付核销并核对安置位置，不能停用');
   if(tables?.docs&&(await tx.query("SELECT 1 FROM brd_flock_documents WHERE house_code=$1 AND status IN ('DRAFT','SUBMITTED','APPROVED') LIMIT 1",[code])).length)throw new BadRequestException('鸡舍有未完单据，不能停用');
   if(tables?.stock&&(await tx.query("SELECT 1 FROM inv_batches WHERE collection_batch_ref=$1 AND qty_available>0 LIMIT 1",[`HOUSE-${code}`])).length)throw new BadRequestException('鸡舍仍有关联库存，请先核对追溯影响');
   if(tables?.devices&&(await tx.query("SELECT 1 FROM mon_house_device_mapping WHERE erp_house_code=$1 AND status='ACTIVE' LIMIT 1",[code])).length)throw new BadRequestException('请先停用设备映射再停用设施');
  }
  const valuesBody:Record<string,unknown>={...body,farm_name:farm.farm_name??farmCode,...(!current?{house_code:code}:{}),...(capacity!==undefined?{max_capacity:Number(capacity),capacity:Number(capacity)}:{})};
  delete valuesBody['updated_at'];
  const keys=Object.keys(valuesBody),values=Object.values(valuesBody);
  if(current)await tx.query(`UPDATE brd_houses SET ${keys.map((key,i)=>`"${key}"=$${i+1}`).join(',')},updated_at=now() WHERE house_code=$${values.length+1}`,[...values,code]);
  else await tx.query(`INSERT INTO brd_houses(${keys.map(key=>`"${key}"`).join(',')}) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')})`,values);
  return {msg:current?'Updated successfully':'Created successfully',houseCode:code};
 });
}
