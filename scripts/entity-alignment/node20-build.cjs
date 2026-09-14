// Official Dockerfiles, tracked-only source copy; no root workspace Docker context.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts','entity-node20-'+Date.now());fs.mkdirSync(dir);
const git=a=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim(),head=git(['rev-parse','HEAD']);
const files=git(['ls-files','apps/api','apps/web','packages','package.json','pnpm-workspace.yaml','pnpm-lock.yaml','tsconfig.json']).split('\n').filter(f=>!/(^|\/)(\.env[^/]*|artifacts|uploads|node_modules|\.next|dist|[^/]*auth[^/]*artifact[^/]*)(\/|$)/i.test(f));
const archive=cp.execFileSync('git',['archive',head,'--',...files],{cwd:root,maxBuffer:120*1024*1024});fs.writeFileSync(path.join(dir,'source.tar'),archive,{flag:'wx'});const context=path.join(dir,'context');fs.mkdirSync(context);cp.execFileSync('tar',['-xf',path.join(dir,'source.tar'),'-C',context]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const result={head,tree:git(['rev-parse','HEAD^{tree}']),archiveSha256:hash(archive),files,harness:hash(fs.readFileSync(__filename)),source:require('../packaging-history-test/revision.cjs').capture(),runs:[]};
const save=()=>fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));save();
(async()=>{for(const app of ['api','web']){
 const tag='packaging-history-node20-'+app+':'+head.slice(0,8),args=['build','--progress=plain','--build-arg','GIT_SHA='+head,'--build-arg','API_TARGET=http://127.0.0.1:3100','-t',tag,'-f','apps/'+app+'/Dockerfile','.'];
 const fd=fs.openSync(path.join(dir,app+'.log'),'wx'),started=new Date().toISOString();const exit=await new Promise(resolve=>{const child=cp.spawn('docker',args,{cwd:context,env:{PATH:process.env.PATH,LANG:'C.UTF-8'},stdio:['ignore',fd,fd]});child.once('error',e=>resolve({code:null,error:e.code}));child.once('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);
 const row={app,tag,args,started,finished:new Date().toISOString(),...exit};
 if(exit.code===0){row.imageId=cp.execFileSync('docker',['image','inspect',tag,'--format','{{.Id}}'],{encoding:'utf8'}).trim();row.node=cp.execFileSync('docker',['run','--name','packaging-node20-version-'+app+'-'+Date.now(),'--network','none','--entrypoint','node',row.imageId,'--version'],{encoding:'utf8'}).trim();}
 result.runs.push(row);save();console.log(app,JSON.stringify({code:row.code,imageId:row.imageId,node:row.node}));
 }result.after=require('../packaging-history-test/revision.cjs').capture();result.exit=result.runs.some(r=>r.code!==0)?1:0;save();console.log(dir);process.exitCode=result.exit;})();
