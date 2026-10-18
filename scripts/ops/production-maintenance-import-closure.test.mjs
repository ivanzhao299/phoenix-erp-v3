/** Static/literal local ESM closure only. Nonliteral dynamic imports (installed guards/dist helpers), CommonJS require, native calls, file access and full restore completeness are NOT_EVALUATED; this never claims full recovery readiness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const ts=createRequire(import.meta.url)(path.join(root,'apps/api/node_modules/typescript'));
const contract=JSON.parse(fs.readFileSync(path.join(root,'scripts/ops/production-config-contract.json'),'utf8'));
function graph(critical,{exists=file=>fs.existsSync(path.join(root,file)),read=file=>fs.readFileSync(path.join(root,file),'utf8')}={}){
 const protectedPaths=new Set(critical),queue=critical.filter(p=>p.startsWith('scripts/ops/')),seen=new Set(),edges=[],missing=new Set(),nonLiteralDynamic=[];
 while(queue.length){
  const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  assert.equal(exists(file),true,'Missing source: '+file);
  if(!/\.(?:mjs|cjs|js|ts)$/.test(file))continue;
  const source=read(file),ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
  function dependency(spec){
   if(spec.startsWith('node:')||builtinModules.includes(spec))return;
   assert.ok(spec.startsWith('.'),'Non-local dependency requires separate reviewed closure: '+file);
   const to=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));assert.ok(!to.startsWith('../')&&!to.startsWith('/'),'Outside-repo dependency');
   edges.push({from:file,to});if(!protectedPaths.has(to))missing.add(to);queue.push(to);
  }
  function visit(n){
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){assert.ok(ts.isStringLiteral(n.moduleSpecifier));dependency(n.moduleSpecifier.text);}
   if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword){if(n.arguments.length>=1&&(ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0])))dependency(n.arguments[0].text);else nonLiteralDynamic.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1});}
   ts.forEachChild(n,visit);
  }visit(ast);
 }
 return{edges,files:[...seen],missing:[...missing].sort(),nonLiteralDynamic};
}
test('protected ops entries include every statically imported local module in the floor contract',()=>{
 const g=graph(contract.criticalFiles);assert.ok(g.edges.length>0);assert.deepEqual(g.missing,[]);
});
test('removing a real imported dependency from protection is detected without changing its bytes',()=>{
 const g=graph(contract.criticalFiles),edge=g.edges.find(e=>contract.criticalFiles.includes(e.to));assert.ok(edge);
 assert.ok(graph(contract.criticalFiles.filter(p=>p!==edge.to)).missing.includes(edge.to));
});

for(const [label,source,dependency] of [
 ['literal with import attributes',"import('./dependency.json', { with: { type: 'json' } });",'scripts/ops/dependency.json'],
 ['no-substitution template', 'import(`./dependency.mjs`);','scripts/ops/dependency.mjs'],
])test(`fixed dynamic ${label} still requires the dependency pin`,()=>{
 const entry='scripts/ops/entry.mjs',files=new Map([[entry,source],[dependency,dependency.endsWith('.json')?'{}':'export {};']]);
 const io={exists:file=>files.has(file),read:file=>files.get(file)};
 const missing=graph([entry],io);assert.deepEqual(missing.missing,[dependency]);assert.deepEqual(missing.nonLiteralDynamic,[]);
 assert.deepEqual(graph([entry,dependency],io).missing,[]);
});
