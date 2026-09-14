import { ConflictException, Injectable } from '@nestjs/common';
import {InjectEntityManager} from '@nestjs/typeorm';
import {EntityManager} from 'typeorm';
export interface PackingPolicy { version:string; R:boolean; B:boolean; P:boolean; V:boolean; H:boolean; Q:boolean; encodingVersion:string|null; receiptMode:'C'; deviceProfile?:string; }
/** Trusted sys_dict configuration, exact company/site only; no pilot/config rows are seeded or enabled here. */
@Injectable()
export class PackagingWorkflowPolicy {
 constructor(@InjectEntityManager() private readonly em?:EntityManager){}
 get(companyCode:string,siteCode:string):PackingPolicy|Promise<PackingPolicy> {
  const disabled:PackingPolicy={version:'disabled',R:false,B:false,P:false,V:false,H:false,Q:false,encodingVersion:null,receiptMode:'C'};
  if(!this.em)return disabled;
  return this.em.query(`SELECT config_json FROM sys_dict WHERE dict_type='PKG_HISTORY_POLICY' AND dict_code=$1 AND status='ACTIVE'`,[`${companyCode}:${siteCode}`]).then(rows=>{
   if(rows.length!==1)return disabled;
   const p=rows[0].config_json;
   if(!p||p.companyCode!==companyCode||p.siteCode!==siteCode||p.receiptMode!=='C'||typeof p.version!=='string'
     ||!p.version||['R','B','P','V','H','Q'].some(k=>typeof p[k]!=='boolean'))throw new ConflictException('INVALID_WORKFLOW_POLICY');
   // Q comes only from a separately authorized physical qualification record in trusted configuration.
   const q=p.Q===true&&p.encodingVersion==='PBX-v1'&&typeof p.deviceProfile==='string'&&p.deviceProfile.length>0
     &&p.qualification?.accepted===true&&typeof p.qualification.evidenceRef==='string'&&p.qualification.evidenceRef.length>0
     &&typeof p.qualification.acceptedAt==='string'&&Number.isFinite(Date.parse(p.qualification.acceptedAt));
   const policy:PackingPolicy={version:p.version,R:p.R,B:p.B,P:p.P,V:p.V,H:p.H,Q:q,encodingVersion:p.encodingVersion,receiptMode:'C',deviceProfile:p.deviceProfile};
   if(policy.H&&(!policy.R||!policy.B||!policy.P||!policy.V||!policy.Q))throw new ConflictException('INVALID_WORKFLOW_POLICY');
   return policy;
  });
 }
 assert(policy:PackingPolicy,action:string) {
  const required=action==='REGISTER'||action==='VOID'?['R','B','Q']:action==='PRINT'?['R','B','P','Q']:
    action==='SESSION'||action==='SCAN'?['R','B','V']:['R','B','P','V','H','Q'];
  if(policy.receiptMode!=='C'||(policy.H&&(!policy.B||!policy.P||!policy.V||!policy.Q))
    ||required.some(k=>!policy[k as keyof PackingPolicy]))throw new ConflictException('WORKFLOW_NOT_READY');
 }
}
