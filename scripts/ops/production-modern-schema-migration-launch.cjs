/** One bounded private stdin frame; no credential in container creation
 * configuration, command line, evidence file, or normal diagnostics. */
'use strict';
const {spawn}=require('node:child_process');
let chunks=[],bytes=0;const timer=setTimeout(()=>process.exit(64),10000);
process.stdin.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)process.exit(64);chunks.push(chunk);});
process.stdin.on('error',()=>process.exit(64));
process.stdin.on('end',()=>{
 clearTimeout(timer);let input;const raw=Buffer.concat(chunks);chunks=[];
 try{input=JSON.parse(raw.toString('utf8'));}catch{process.exit(64);}finally{raw.fill(0);}
 if(!input||JSON.stringify(Object.keys(input).sort())!==JSON.stringify(['nonce','owner','password','schema'])||input.schema!=='phoenix.modern-schema-cli-private-input/v1'
  ||input.owner!==process.env.PHOENIX_SCHEMA_GATE_OWNER||input.nonce!==process.env.PHOENIX_SCHEMA_GATE_NONCE||typeof input.password!=='string'||input.password.length>2048||/[\0\r\n]/.test(input.password))process.exit(64);
 const argv=process.argv.slice(2),mode=process.env.PHOENIX_SCHEMA_GATE_MODE,expected=['-d','dist/database/data-source.js','migration:'+mode,...(mode==='run'?['--transaction','all']:[])];
 if(JSON.stringify(argv)!==JSON.stringify(expected)||Object.hasOwn(process.env,'DB_PASSWORD'))process.exit(64);
 const environment={...process.env,DB_PASSWORD:input.password};input.password='';
 const child=spawn('/app/node_modules/.bin/typeorm',argv,{env:environment,stdio:['ignore','inherit','inherit']});environment.DB_PASSWORD='';
 child.on('error',()=>process.exit(64));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{try{child.kill(signal);}catch{}});
 child.on('exit',(code,signal)=>process.exit(signal?128+(signal==='SIGTERM'?15:2):Number.isInteger(code)?code:64));
});
