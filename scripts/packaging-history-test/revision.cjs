// Capture only source/config paths, never environment files or authentication artifacts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const targets=['.github/workflows','scripts/check-constraint-drift.js','scripts/check-nullable-in-unique.js','scripts/check-entity-drift-baseline.sh','scripts/check-ts-migration-down.sh','scripts/check-ts-migration-no-data-dml.sh','apps/api/jest.config.js','apps/web/vitest.config.ts','Dockerfile','docker-compose.yml','apps/api/Dockerfile','apps/web/Dockerfile','apps/api/src','apps/web/src','scripts/packaging-history-test','scripts/entity-alignment','apps/api/test/scope-audit.sh','apps/api/migrations','migrations','package.json','pnpm-lock.yaml','apps/api/package.json','apps/web/package.json','apps/api/tsconfig.json','apps/web/tsconfig.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function capture(){
 const git=args=>{
  const dir=fs.mkdtempSync('/tmp/packaging-revision-'),out=path.join(dir,'stdout'),err=path.join(dir,'stderr');
  const a=fs.openSync(out,'w'),b=fs.openSync(err,'w');
  try{execFileSync('git',args,{cwd:root,stdio:['ignore',a,b]});}finally{fs.closeSync(a);fs.closeSync(b);}
  return fs.readFileSync(out,'utf8');
 };
 const files=git(['ls-files','-z','--cached','--others','--exclude-standard','--',...targets]).split('\0').filter(Boolean).sort();
 const hashes={};for(const file of files){const p=path.join(root,file);hashes[file]=fs.existsSync(p)?hash(fs.readFileSync(p)):'DELETED';}
 const diff=git(['diff','--no-ext-diff','--binary','HEAD','--',...targets]);
 return {capturedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']).trim(),headTree:git(['rev-parse','HEAD^{tree}']).trim(),stagedDiffSha256:hash(git(['diff','--cached','--no-ext-diff','--binary','--',...targets])),branch:git(['branch','--show-current']).trim(),targets,fileSha256:hashes,sourceFingerprint:hash(JSON.stringify(hashes)),dirtyDiffSha256:hash(diff),dirtyDiff:diff};
}
module.exports={capture};
