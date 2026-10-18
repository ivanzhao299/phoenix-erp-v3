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
   const cls={name:node.name.text,node,source,methods:new Map(),bindings:new Map(),properties:[]};
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
const knownHooks=new Set(['ApiBootstrapSchemaCheck.onModuleInit','SystemController.onModuleInit','CronMonitorService.onModuleInit','IotSyncService.onModuleInit','WorkflowService.onModuleInit','WorkflowBizRegistryService.onModuleInit','SalesOrdersService.onApplicationBootstrap','PushNotificationService.onModuleInit','ChanjetAuthService.onModuleInit','ChanjetArSyncService.onModuleInit','ChanjetReadonlySyncScheduler.onApplicationBootstrap','BackgroundTaskService.onModuleInit']);
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
// Dynamic forwarding is reviewed only after ALL source call sites and the exact
// control-session plumbing are validated. This is not a general SQL exception.
const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const isThis = (node, name) => !!node && ts.isPropertyAccessExpression(node)
 && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === name;
// Only TypeScript's erased non-null assertion may wrap the reviewed receiver.
// Casts, aliases, optional access and arbitrary driver expressions are not proof.
const withoutNonNull = node => node && ts.isNonNullExpression(node) ? withoutNonNull(node.expression) : node;
const controlClass = classes.get('BackgroundLockBackend');
const controlQuery = controlClass?.methods.get('query');
const controlUnlock = controlClass?.methods.get('unlock');
const controlObserver = controlClass?.methods.get('observeQuery');
const controlSql = new Set([
 'SELECT pg_try_advisory_lock_shared($1::int, $2::int) AS acquired',
 'SELECT pg_advisory_unlock_shared($1::int, $2::int)',
 'SELECT pg_advisory_unlock_shared($1::int, $2::int) AS released',
 'SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe',
 "SELECT pg_backend_pid() AS pid, (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid, (SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at, (SELECT to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at_us, current_setting('application_name') AS application_name, $1::int AS namespace, $2::int AS session_probe",
 'SELECT 1',
]);
const normalizeSql = value => value?.replace(/\s+/g, ' ').trim();
let controlSqlSafe = !!controlQuery;
const controlForwarders = new Set();
const controlSessionSetters = new Set();
function exactControlQueryOwner(node) {
 let current=node.parent;
 while(current&&current!==controlQuery?.node) {
  if(ts.isFunctionLike(current)) {
   const admission=current.parent;
   if(!ts.isArrowFunction(current)||current.parameters.length!==0||current.body!==node
    ||!ts.isCallExpression(admission)||admission.arguments.length!==1||admission.arguments[0]!==current
    ||!isThis(admission.expression,'observeQuery')||target(controlQuery,admission.expression)!==controlObserver
    ||!controlObserver?.node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.PrivateKeyword)
    ||controlObserver.node.parameters.length!==1||controlObserver.node.parameters[0].name.getText()!=='work')return false;
  }
  current=current.parent;
 }
 return current===controlQuery?.node;
}
function reviewedControlNode(entry,node,nodes) {
 return controlSqlSafe&&entry.cls===controlClass&&entry.source===controlClass.source
  &&nodes.has(node)&&exactControlQueryOwner(node);
}
function controlFail(entry, node, reason) {
 controlSqlSafe = false;
 violations.push({code:'UNREVIEWED_BACKGROUND_CONTROL_SQL',at:locate(entry,node),entry:entry.name,reason});
}
if(controlQuery) {
 const constantsSource=sources.find(source=>source.fileName.endsWith('/modules/background-control/background-control.types.ts'));
 const constants=new Map();
 if(constantsSource)for(const statement of constantsSource.statements)if(ts.isVariableStatement(statement)
  && (statement.declarationList.flags & ts.NodeFlags.Const))for(const declaration of statement.declarationList.declarations)
   if(ts.isIdentifier(declaration.name)&&declaration.initializer&&ts.isNumericLiteral(declaration.initializer))constants.set(declaration.name.text,Number(declaration.initializer.text));
 if(constants.get('BACKGROUND_NAMESPACE')!==17455||constants.get('BACKGROUND_ADMISSION_KEY')!==1||constants.get('BACKGROUND_EXECUTION_KEY')!==2)
  controlFail(controlQuery,controlQuery.node,'CONTROL_NAMESPACE_OR_KEYS_CHANGED');
 const imports=controlClass.source.statements.filter(ts.isImportDeclaration).filter(node=>literal(node.moduleSpecifier)==='./background-control.types');
 const names=new Set(imports.flatMap(node=>node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)
  ?node.importClause.namedBindings.elements.filter(element=>!element.propertyName).map(element=>element.name.text):[]));
 if(!['BACKGROUND_NAMESPACE','BACKGROUND_ADMISSION_KEY','BACKGROUND_EXECUTION_KEY'].every(name=>names.has(name)))
  controlFail(controlQuery,controlQuery.node,'CONTROL_CONSTANT_BINDING_CHANGED');
 if(!controlQuery.node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.PrivateKeyword)
  ||controlQuery.node.parameters.length!==2||controlQuery.node.parameters[0].name.getText()!=='sql'||controlQuery.node.parameters[1].name.getText()!=='key')
  controlFail(controlQuery,controlQuery.node,'CONTROL_FORWARDER_SHAPE_CHANGED');
 const identityBinding=controlClass.methods.get('bindIdentity');
 let identitySafe=false;
 if(identityBinding) {
  const statements=identityBinding.node.body.statements;const guard=statements[0];const assignment=statements[1]?.expression;
  const expectedGuard="this.runner||this.closed||this.broken||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bootId)";
  identitySafe=identityBinding.node.parameters.length===1&&identityBinding.node.parameters[0].name.getText()==='bootId'
   &&statements.length===2&&ts.isIfStatement(guard)&&guard.expression.getText(controlClass.source).replace(/\s+/g,'')===expectedGuard
   &&ts.isThrowStatement(guard.thenStatement)&&assignment&&ts.isBinaryExpression(assignment)&&assignment.operatorToken.kind===ts.SyntaxKind.EqualsToken
   &&isThis(assignment.left,'applicationName')&&ts.isTemplateExpression(assignment.right)&&assignment.right.head.text==='phoenix-fence:'
   &&assignment.right.templateSpans.length===1&&ts.isIdentifier(assignment.right.templateSpans[0].expression)
   &&assignment.right.templateSpans[0].expression.text==='bootId'&&assignment.right.templateSpans[0].literal.text==='';
  const checkAssignments=node=>{
   if(ts.isPropertyDeclaration(node)&&node.name.getText()==='applicationName'&&literal(node.initializer)!=='')identitySafe=false;
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&isThis(node.left,'applicationName')&&node!==assignment)identitySafe=false;
   ts.forEachChild(node,checkAssignments);
  };checkAssignments(controlClass.node);
  if(!identitySafe)controlFail(identityBinding,identityBinding.node,'CONTROL_BOOT_NONCE_BINDING_CHANGED');
 }
 const verifyForward=node=>{
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='query') {
   const args=node.arguments,values=args[1];
   const receiver=isThis(withoutNonNull(node.expression.expression),'runner')&&!node.expression.questionDotToken;
   if(!exactControlQueryOwner(node))controlFail(controlQuery,node,'CONTROL_QUERY_CALLBACK_OWNER_CHANGED');
   const sessionSetter=receiver&&args.length===2
    &&literal(args[0])==="SELECT set_config('application_name', $1, false)"
    &&values&&ts.isArrayLiteralExpression(values)&&values.elements.length===1&&isThis(values.elements[0],'applicationName');
   if(sessionSetter&&identitySafe)controlSessionSetters.add(node);
   else if(!receiver||args.length!==2||!ts.isIdentifier(args[0])||args[0].text!=='sql'
    ||!values||!ts.isArrayLiteralExpression(values)||values.elements.length!==2
    ||!ts.isIdentifier(values.elements[0])||values.elements[0].text!=='BACKGROUND_NAMESPACE'
    ||!ts.isIdentifier(values.elements[1])||values.elements[1].text!=='key')controlFail(controlQuery,node,'CONTROL_FORWARDER_ARGUMENTS_CHANGED');
   else controlForwarders.add(node);
  }
  // Reassigning parameters/constants would make literal callers insufficient.
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)
   if(['sql','key','BACKGROUND_NAMESPACE'].includes(node.left.getText(controlClass.source))||isThis(node.left,'runner')
    ||(ts.isElementAccessExpression(node.left)&&node.left.expression.kind===ts.SyntaxKind.ThisKeyword&&literal(node.left.argumentExpression)==='runner'))controlFail(controlQuery,node,'CONTROL_ARGUMENT_REASSIGNED');
  ts.forEachChild(node,verifyForward);
 };verifyForward(controlQuery.node);
 if(controlForwarders.size!==1)controlFail(controlQuery,controlQuery.node,'CONTROL_FORWARDER_NOT_UNIQUE');
 if(controlSessionSetters.size>1)controlFail(controlQuery,controlQuery.node,'CONTROL_SESSION_SETTER_NOT_UNIQUE');
 // sql/key may only occur as the method parameters and the exact forwarding
 // argument nodes. In particular, closure shadowing and helper escapes fail.
 const forward=[...controlForwarders][0];
 const parameterUses=new Set([controlQuery.node.parameters[0].name,controlQuery.node.parameters[1].name,
  forward?.arguments[0],forward?.arguments[1]?.elements?.[0],forward?.arguments[1]?.elements?.[1]]);
 const checkParameterUses=node=>{
  if(ts.isIdentifier(node)&&['sql','key','BACKGROUND_NAMESPACE'].includes(node.text)&&!parameterUses.has(node))controlFail(controlQuery,node,'CONTROL_ARGUMENT_ESCAPED_OR_SHADOWED');
  ts.forEachChild(node,checkParameterUses);
 };checkParameterUses(controlQuery.node);
 if(controlUnlock&&(!controlUnlock.node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.PrivateKeyword)
  ||controlUnlock.node.parameters.length!==1||controlUnlock.node.parameters[0].name.getText()!=='key'))
  controlFail(controlUnlock,controlUnlock.node,'CONTROL_UNLOCK_BINDING_CHANGED');
 for(const cls of classes.values()) {
  const entry={name:cls.name+'.allMembers',node:cls.node,source:cls.source,cls};
  const verify=node=>{
   if(ts.isPropertyAccessExpression(node)&&target(entry,node)===controlQuery) {
    const call=node.parent;
    if(!ts.isCallExpression(call)||call.expression!==node)controlFail(entry,node,'CONTROL_QUERY_REFERENCE_ESCAPED');
    else {
     const text=normalizeSql(literal(call.arguments[0]));const key=call.arguments[1];
     const lock=text?.includes('pg_try_advisory_lock_shared')||text?.includes('pg_advisory_unlock_shared');
     let member=node;while(member&&!ts.isMethodDeclaration(member))member=member.parent;
     const checkedUnlock=controlUnlock&&member===controlUnlock.node&&text==='SELECT pg_advisory_unlock_shared($1::int, $2::int) AS released'
      &&key&&ts.isIdentifier(key)&&key.text==='key';
     const keyOk=lock?(key&&ts.isIdentifier(key)&&['BACKGROUND_ADMISSION_KEY','BACKGROUND_EXECUTION_KEY'].includes(key.text))||checkedUnlock
      :key&&ts.isNumericLiteral(key)&&Number(key.text)===0;
     if(cls!==controlClass||call.arguments.length!==2||!controlSql.has(text)||!keyOk)
      controlFail(entry,call,'CONTROL_CALL_MUST_USE_FIXED_SELECT_AND_KEY');
    }
   }
   if(controlUnlock&&ts.isPropertyAccessExpression(node)&&target(entry,node)===controlUnlock) {
    const call=node.parent,key=ts.isCallExpression(call)?call.arguments[0]:undefined;
    if(cls!==controlClass||!ts.isCallExpression(call)||call.expression!==node||call.arguments.length!==1
     ||!key||!ts.isIdentifier(key)||!['BACKGROUND_ADMISSION_KEY','BACKGROUND_EXECUTION_KEY'].includes(key.text))
     controlFail(entry,node,'CONTROL_UNLOCK_REQUIRES_FIXED_KEY');
   }
   if(controlUnlock&&ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment) {
    let member=node;while(member&&!ts.isMethodDeclaration(member))member=member.parent;
    if(member===controlUnlock.node&&node.left.getText(cls.source)==='key')controlFail(entry,node,'CONTROL_UNLOCK_KEY_REASSIGNED');
   }
   ts.forEachChild(node,verify);
  };verify(cls.node);
 }
}
// The sole admitted resend helper is private and may be called ONLY by the
// exact public CHANJET_AUTH run callback. Inspect even startup-unreachable calls.
const authClass=classes.get('ChanjetAuthService');
const authWrapper=authClass?.methods.get('triggerAppTicket');
const authHelper=authClass?.methods.get('triggerAppTicketAdmitted');
let admittedTicketSafe=!!authWrapper&&!!authHelper;
let admittedTicketCalls=0;
function ticketFail(entry,node,reason) {
 admittedTicketSafe=false;
 violations.push({code:'UNGUARDED_STARTUP_REMOTE_HELPER',at:locate(entry,node),entry:entry.name,reason});
}
if(authHelper) {
 if(!authHelper.node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.PrivateKeyword))ticketFail(authHelper,authHelper.node,'REMOTE_HELPER_MUST_BE_PRIVATE');
 for(const source of sources) {
  const visit=node=>{
   if((ts.isPropertyAccessExpression(node)&&node.name.text==='triggerAppTicketAdmitted')
    ||(ts.isElementAccessExpression(node)&&literal(node.argumentExpression)==='triggerAppTicketAdmitted')) {
    const call=node.parent,callback=call.parent,admission=callback?.parent;
    const valid=ts.isCallExpression(call)&&call.expression===node&&call.arguments.length===0
     &&isThis(node,'triggerAppTicketAdmitted')&&ts.isArrowFunction(callback)&&callback.body===call&&callback.parameters.length===0
     &&ts.isCallExpression(admission)&&admission.arguments.length===3&&admission.arguments[2]===callback
     &&ts.isPropertyAccessExpression(admission.expression)&&admission.expression.name.text==='run'
     &&isThis(admission.expression.expression,'background')&&authClass.bindings.get('background')==='BackgroundTaskService'
     &&literal(admission.arguments[0])==='chanjet-triggerAppTicket'&&literal(admission.arguments[1])==='CHANJET_AUTH'
     &&authWrapper?.node.body?.statements.length===1&&ts.isReturnStatement(admission.parent)
     &&admission.parent.expression===admission&&admission.parent.parent===authWrapper.node.body;
    if(valid)admittedTicketCalls++;
    else ticketFail({name:'ChanjetAuthService.triggerAppTicketAdmitted:reference',source},node,'REMOTE_HELPER_CALL_OUTSIDE_EXACT_ADMISSION');
   }
   ts.forEachChild(node,visit);
  };visit(source);
 }
 if(admittedTicketCalls!==1)ticketFail(authHelper,authHelper.node,'REMOTE_HELPER_MUST_HAVE_ONE_GUARDED_CALL');
 if(authWrapper?.node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.PrivateKeyword||modifier.kind===ts.SyntaxKind.ProtectedKeyword))
  ticketFail(authWrapper,authWrapper.node,'REMOTE_ADMISSION_WRAPPER_MUST_BE_PUBLIC');
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
    if(reviewedControlNode(entry,node,controlSessionSetters))sql.push({entry:entry.name,at:locate(entry,node),kind:'FIXED_SESSION_APPLICATION_NAME'});
    else if(reviewedControlNode(entry,node,controlForwarders))sql.push({entry:entry.name,at:locate(entry,node),kind:'FIXED_CONTROL_SELECT_FORWARDER'});
    else if(!text)violations.push({code:'UNRESOLVED_STARTUP_SQL',at:locate(entry,node),entry:entry.name});
    else if(/\bset_config\s*\(/i.test(text)||/(?:^|;)\s*(?:SET|RESET)\b/i.test(text.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'')))violations.push({code:'UNREVIEWED_STARTUP_SESSION_SQL',at:locate(entry,node),entry:entry.name});
    else if(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|setval|nextval)\b/i.test(text))violations.push({code:'STARTUP_SQL_MUTATION',at:locate(entry,node),entry:entry.name});
    else sql.push({entry:entry.name,at:locate(entry,node),kind:'READ_METADATA_OR_STATE'});
   }
   if(['save','insert','update','delete','remove','upsert','execute'].includes(name)&&/\b(?:ds|em|mgr|manager|entityManager|queryRunner|\w*Repo|\w*Repository)\b/i.test(receiver))violations.push({code:'STARTUP_ORM_MUTATION',at:locate(entry,node),entry:entry.name});
   if(['onApproved','onRejected','onCancelled'].includes(name))violations.push({code:'STARTUP_APPROVAL_CALLBACK_EXECUTION',at:locate(entry,node),entry:entry.name});
   const called=target(entry,node.expression);if(called){edges.push([entry.name,called.name]);inspect(called);}
   if(name==='fetch') {
    const urlDeclaration=[];const find=n=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(node.arguments[0])&&n.name.getText(entry.source)===node.arguments[0].text&&n.initializer&&(n.parent.flags&ts.NodeFlags.Const))urlDeclaration.push(literal(n.initializer));ts.forEachChild(n,find);};find(entry.node);
    const url=literal(node.arguments[0])??(urlDeclaration.length===1?urlDeclaration[0]:undefined);
    const options=node.arguments[1];const option=name=>{if(!options||!ts.isObjectLiteralExpression(options)||!options.properties.every(ts.isPropertyAssignment))return undefined;const values=options.properties.filter(p=>p.name?.getText(entry.source)===name);return values.length===1?literal(values[0].initializer):undefined;};
    if(entry.name!=='ChanjetAuthService.triggerAppTicketAdmitted'||!admittedTicketSafe||url!=='https://openapi.chanjet.com/auth/appTicket/resend'||option('method')!=='POST'||option('redirect')!=='manual')violations.push({code:'UNREVIEWED_STARTUP_REMOTE_CALL',at:locate(entry,node),entry:entry.name});
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
