// Load ONLY the actual policy class through the existing TypeScript compiler; never AppModule or DB credentials.
const path=require('node:path'),assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('../../apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
const {PackagingWorkflowPolicy}=require('../../apps/api/src/modules/bff/packaging-workflow-policy.ts');
const {flags}=require('../ops/readonly-audits/packaging-metadata.cjs');
const off={companyCode:'TEST',siteCode:'TEST',version:'TEST',receiptMode:'C',R:false,B:false,P:false,V:false,H:false,Q:false};
const qualified={...off,R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'PBX-v1',deviceProfile:'TEST',qualification:{accepted:true,evidenceRef:'TEST',acceptedAt:'2026-09-14'}};
(async()=>{
 const cases=[off,JSON.stringify(off),null,{}, {...off,R:'true'}, {...off,siteCode:'OTHER'}, {...off,Q:true}, qualified,
  {...qualified,qualification:{...qualified.qualification,acceptedAt:'invalid'}},
  {...qualified,H:false,qualification:{accepted:false}}, {...qualified,qualification:{...qualified.qualification,acceptedAt:'September 14, 2026'}},
  {...off,receiptMode:'A'}, {...off,version:''}];
 for(const p of cases){let actual,failed=false;try{actual=await new PackagingWorkflowPolicy({query:async()=>[{config_json:p}]}).get('TEST','TEST');}catch{failed=true;}
  const result=flags([{dict_code:'TEST:TEST',config_json:p}]);assert.equal(result.state==='malformed',failed);
  if(!failed)for(const k of ['R','B','P','V','H','Q'])assert.equal(result.effective[k],actual[k]);
 }
 console.log(JSON.stringify({cases:cases.length,passed:true}));
})().catch(()=>{console.log(JSON.stringify({passed:false,class:'POLICY_PARITY'}));process.exitCode=1;});
