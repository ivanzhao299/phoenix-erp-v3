/** Runner-only static source artifact. Contains source evidence, no runtime
 * permission, credentials, grant or fabricated deployment success. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const fail=()=>{throw Error('MAINTENANCE_RELEASE_INPUT=INVALID');};
export function validateMaintenanceReleaseInput(raw,target){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>65536||!/^[a-f0-9]{40}$/.test(target||''))fail();
 let input;try{input=JSON.parse(raw);}catch{fail();}
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='ownerSource,sourceReviewReceiptBase64')fail();
 const request=input.ownerSource,fields=['repository','prNumber','sourceHeadSha','sourceTreeSha','expectedMainSha','reviewId','delegateUserId','delegateLogin','ownerDelegationDigest','sourceReviewReceiptDigest','pinnedReviewRecordSha256'];
 if(!request||Object.keys(request).sort().join(',')!==fields.sort().join(',')||request.repository!=='ivanzhao299/phoenix-erp-v3'
  ||request.expectedMainSha!==target||request.delegateUserId!==7245339||request.delegateLogin!=='emvia'
  ||![request.sourceHeadSha,request.sourceTreeSha].every(v=>/^[a-f0-9]{40}$/.test(v||''))
  ||![request.ownerDelegationDigest,request.sourceReviewReceiptDigest,request.pinnedReviewRecordSha256].every(v=>/^[a-f0-9]{64}$/.test(v||''))
  ||![request.prNumber,request.reviewId].every(v=>Number.isSafeInteger(v)&&v>0)||typeof input.sourceReviewReceiptBase64!=='string')fail();
 const receipt=Buffer.from(input.sourceReviewReceiptBase64,'base64');
 if(!receipt.length||receipt.length>32768||receipt.toString('base64')!==input.sourceReviewReceiptBase64
  ||createHash('sha256').update(receipt).digest('hex')!==request.sourceReviewReceiptDigest)fail();
 return {ownerSource:request,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=validateMaintenanceReleaseInput(process.env.MAINTENANCE_RELEASE_INPUT,process.env.TARGET_SHA);
 if(!path.isAbsolute(process.env.RUNNER_TEMP||''))fail();
 const directory=path.join(process.env.RUNNER_TEMP,'phoenix-legacy-release-source');fs.mkdirSync(directory,{mode:0o700});
 fs.writeFileSync(path.join(directory,'source-review-receipt.json'),input.receipt,{mode:0o600,flag:'wx'});
 fs.writeFileSync(path.join(directory,'owner-source.json'),JSON.stringify(input.ownerSource)+'\n',{mode:0o600,flag:'wx'});
 console.log('LEGACY_SOURCE_ARTIFACT=SOURCE_ONLY');
}
