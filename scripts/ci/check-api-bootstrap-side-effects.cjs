#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../apps/api/node_modules/typescript');
function auditBootstrap(root = path.resolve(__dirname, '../..')) {
const sources = [], classes = new Map(), functions = new Map(), entries = [], factoryEntries = [];
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]); }
for(const file of files(path.join(root,'apps/api/src')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts')&&!f.includes('/database/migrations/'))) {
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);sources.push(source);
 for(const node of source.statements) {
  if(ts.isClassDeclaration(node)&&node.name) {
   const cls={name:node.name.text,source,methods:new Map(),bindings:new Map(),properties:[]};
   for(const member of node.members) {
    if(ts.isConstructorDeclaration(member)) {
     const entry={name:`${cls.name}.constructor`,node:member,cls,source};cls.methods.set('constructor',entry);if(member.body)entries.push(entry);
     for(const p of member.parameters)if(p.type)cls.bindings.set(p.name.getText(source),p.type.getText(source));
    } else if(ts.isMethodDeclaration(member)&&member.name&&member.body) {
     const name=member.name.getText(source);const entry={name:`${cls.name}.${name}`,node:member,cls,source};cls.methods.set(name,entry);
     if(['onModuleInit','onApplicationBootstrap'].includes(name))entries.push(entry);
    } else if(ts.isPropertyDeclaration(member)&&member.initializer)cls.properties.push(member.initializer);
   }
   if(!cls.methods.has('constructor')&&cls.properties.length)entries.push({name:`${cls.name}.implicitConstructor`,node,cls,source});
   classes.set(cls.name,cls);
  } else if(ts.isFunctionDeclaration(node)&&node.name&&node.body) {
   const e={name:node.name.text,node,source};if(!functions.has(node.name.text))functions.set(node.name.text,[]);functions.get(node.name.text).push(e);
   if(file.endsWith('/main.ts')&&node.name.text==='bootstrap')entries.push(e);
  }
 }
 const visit=node=>{if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='useFactory'&&ts.isFunctionLike(node.initializer))factoryEntries.push({name:`factory:${path.relative(root,file)}:${source.getLineAndCharacterOfPosition(node.pos).line+1}`,node:node.initializer,source});ts.forEachChild(node,visit);};visit(source);
}
const knownHooks=new Set(['ApiBootstrapSchemaCheck.onModuleInit','SystemController.onModuleInit','CronMonitorService.onModuleInit','IotSyncService.onModuleInit','WorkflowService.onModuleInit','WorkflowBizRegistryService.onModuleInit','SalesOrdersService.onApplicationBootstrap','PushNotificationService.onModuleInit','ChanjetAuthService.onModuleInit','ChanjetArSyncService.onModuleInit','ChanjetReadonlySyncScheduler.onApplicationBootstrap']);
const violations=[],sql=[],edges=[],deferred=[];const visited=new Set();
function locate(entry,node){return `${path.relative(root,entry.source.fileName)}:${entry.source.getLineAndCharacterOfPosition(node.getStart(entry.source)).line+1}`;}
function target(entry,expr) {
 if(ts.isIdentifier(expr)) {
  const found=functions.get(expr.text)||[];return found.length===1?found[0]:found.find(e=>e.source===entry.source);
 }
 if(ts.isPropertyAccessExpression(expr)) {
  if(expr.expression.kind===ts.SyntaxKind.ThisKeyword)return entry.cls?.methods.get(expr.name.text);
  if(ts.isPropertyAccessExpression(expr.expression)&&expr.expression.expression.kind===ts.SyntaxKind.ThisKeyword){const type=entry.cls?.bindings.get(expr.expression.name.text);return classes.get(type)?.methods.get(expr.name.text);}
 }
}
function inspect(entry) {
 const key=entry.source.fileName+':'+entry.node.pos;if(visited.has(key))return;visited.add(key);
 const visit=node=>{
  if(ts.isFunctionLike(node)&&node!==entry.node)return; // Definitions are traversed only when invoked below.
  if(ts.isCallExpression(node)) {
   const name=ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:node.expression.getText(entry.source);
   const receiver=ts.isPropertyAccessExpression(node.expression)?node.expression.expression.getText(entry.source):'';
   if(name==='query'||name==='queryRunner') {
    const arg=node.arguments[0];let text;
    if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)))text=arg.text;
    else if(arg&&ts.isTemplateExpression(arg))text=arg.head.text+arg.templateSpans.map(s=>s.literal.text).join(' ');
    if(!text)violations.push({code:'UNRESOLVED_STARTUP_SQL',at:locate(entry,node),entry:entry.name});
    else if(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|setval|nextval)\b/i.test(text))violations.push({code:'STARTUP_SQL_MUTATION',at:locate(entry,node),entry:entry.name});
    else sql.push({entry:entry.name,at:locate(entry,node),kind:'READ_METADATA_OR_STATE'});
   }
   if(['save','insert','update','delete','remove','upsert','execute'].includes(name)&&/\b(?:ds|em|mgr|manager|entityManager|queryRunner|\w*Repo|\w*Repository)\b/i.test(receiver))violations.push({code:'STARTUP_ORM_MUTATION',at:locate(entry,node),entry:entry.name});
   if(['onApproved','onRejected','onCancelled'].includes(name))violations.push({code:'STARTUP_APPROVAL_CALLBACK_EXECUTION',at:locate(entry,node),entry:entry.name});
   const called=target(entry,node.expression);if(called){edges.push([entry.name,called.name]);inspect(called);}
   if(name==='fetch') {
    const urlDeclaration=[];const find=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(entry.source)===node.arguments[0]?.getText(entry.source)&&n.initializer&&ts.isStringLiteral(n.initializer))urlDeclaration.push(n.initializer.text);ts.forEachChild(n,find);};find(entry.node);
    const url=node.arguments[0]&&ts.isStringLiteral(node.arguments[0])?node.arguments[0].text:urlDeclaration[0];
    const options=node.arguments[1];const method=options&&ts.isObjectLiteralExpression(options)?options.properties.find(p=>p.name?.getText(entry.source)==='method')?.initializer?.getText(entry.source):null;
    if(entry.name!=='ChanjetAuthService.triggerAppTicket'||url!=='https://openapi.chanjet.com/auth/appTicket/resend'||!/["']POST["']/.test(method||''))violations.push({code:'UNREVIEWED_STARTUP_REMOTE_CALL',at:locate(entry,node),entry:entry.name});
   }
   for(const arg of node.arguments) {
    const registered=(name==='register'&&['WorkflowBizRegistryService','SalesOrdersService'].includes(entry.cls?.name))||name==='setInterval';
    const callbacks=inner=>{
     if(ts.isArrowFunction(inner)||ts.isFunctionExpression(inner)) {
      if(registered)deferred.push({entry:entry.name,at:locate(entry,inner),kind:name==='register'?'APPROVAL_EVENT_CALLBACK':'RUNTIME_INTERVAL'});
      else inspect({...entry,name:entry.name+':callback',node:inner});
      return;
     }
     ts.forEachChild(inner,callbacks);
    };callbacks(arg);
   }
  }
  ts.forEachChild(node,visit);
 };
 if(entry.node.body)visit(entry.node.body);
 if(entry.node.kind===ts.SyntaxKind.Constructor||entry.name.endsWith('.implicitConstructor'))for(const p of entry.cls.properties)visit(p);
}
for(const entry of [...entries,...factoryEntries]) {
 if(/\.(?:onModuleInit|onApplicationBootstrap)$/.test(entry.name)&&!knownHooks.has(entry.name))violations.push({code:'UNREVIEWED_LIFECYCLE_ENTRY',at:locate(entry,entry.node),entry:entry.name});
 inspect(entry);
}
for(const [file,flags] of [['apps/api/src/app.module.ts',['synchronize','migrationsRun','installExtensions']],['apps/api/src/database/data-source.ts',['synchronize','migrationsRun']]]) {
 const text=fs.readFileSync(path.join(root,file),'utf8');for(const flag of flags)if(!new RegExp(`\\b${flag}\\s*:\\s*false\\b`).test(text)||new RegExp(`\\b${flag}\\s*:\\s*true\\b`).test(text))violations.push({code:'AUTOMATIC_SCHEMA_EXECUTION',at:file,flag});
}
const generic=fs.readFileSync(path.join(root,'apps/api/src/modules/generic-crud/generic-crud.service.ts'),'utf8');
if(/ensureColumn|['"`]\s*(?:CREATE\s|ALTER\s|DROP\s|SELECT\s+(?:setval|nextval))/i.test(generic))violations.push({code:'GENERIC_CRUD_AUTO_DDL',at:'GenericCrudService'});
const system=fs.readFileSync(path.join(root,'apps/api/src/modules/master/master.controller.ts'),'utf8');if(/ensureTable|CREATE TABLE|ALTER TABLE/i.test(system))violations.push({code:'BRAND_REQUEST_AUTO_DDL',at:'SystemController'});
const report = {schema:'phoenix.bootstrap-static-audit/v1',sourceFiles:sources.length,constructors:entries.filter(e=>e.name.endsWith('.constructor')).length,lifecycleEntries:entries.filter(e=>/\.(onModuleInit|onApplicationBootstrap)$/.test(e.name)).map(e=>({name:e.name,at:locate(e,e.node)})),providerFactories:factoryEntries.length,visitedMethods:visited.size,edges,sql,deferred,violations};
return report;
}
module.exports = { auditBootstrap };
if(require.main===module) { const report=auditBootstrap();console.log(JSON.stringify(report,null,2));if(report.violations.length)process.exitCode=1; }
