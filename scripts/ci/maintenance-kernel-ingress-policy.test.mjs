import test from 'node:test';import assert from 'node:assert/strict';
import {compileOwnedIngressRules,projectOwnedIngressTable,ingressIdentity} from './maintenance-kernel-ingress-policy.mjs';
const scope={owner:'a'.repeat(32),bridge:'br-'+'b'.repeat(12),subnet:'172.18.0.0/16',port:3100};
test('fixed JSON rules bind host publication, exact owned bridge outputs and peer bridge; no global drop policy',()=>{
 const x=compileOwnedIngressRules(scope),commands=JSON.parse(x.program).nftables;
 assert.equal(x.definitions.length,4);assert.equal(commands.filter(x=>x.add?.chain?.policy==='accept').length,4);
 assert.equal(x.definitions.find(x=>x.chain==='host_published').priority,-110);
 for(const chain of ['host_direct','routed'])assert.deepEqual(x.definitions.find(x=>x.chain===chain).expr[0],{match:{op:'==',left:{meta:{key:'oifname'}},right:scope.bridge}});
 assert.equal(x.productionAuthority,false);assert.equal(x.continuousIngressProof,false);assert.equal(x.inflightDrain,'NOT_PROVED');
});
for(const [key,value] of [['owner','a;flush ruleset'],['bridge','docker0'],['subnet','0.0.0.0/0'],['subnet','172.18.0.1/16'],['subnet','172.018.0.0/16'],['subnet','203.0.113.0/24'],['subnet','::/0'],['port',5432]])test(`reject unapproved ${key} ${value}`,()=>assert.throws(()=>compileOwnedIngressRules({...scope,[key]:value})));
test('no extra command field and no global flush/accept permission',()=>assert.throws(()=>compileOwnedIngressRules({...scope,command:'flush ruleset'})));
const table=compileOwnedIngressRules(scope).table;
function kernel(){return {nftables:[{metainfo:{}},{table:{family:'bridge',name:table,handle:1}},{chain:{family:'bridge',table,name:'peer',type:'filter',policy:'accept',prio:-5,hook:'forward',handle:2}},{rule:{family:'bridge',table,chain:'peer',handle:3,expr:structuredClone(compileOwnedIngressRules(scope).definitions.find(x=>x.chain==='peer').expr)}}]};}
test('kernel projection binds real handles and expressions, while packet counters may advance',()=>{
 const a=kernel(),b=kernel();b.nftables[3].rule.expr.find(x=>x.counter).counter.packets=3;const p=projectOwnedIngressTable(a,'bridge',scope),q=projectOwnedIngressTable(b,'bridge',scope);assert.deepEqual(ingressIdentity([p]),ingressIdentity([q]));
 b.nftables[3].rule.handle=4;assert.notDeepEqual(ingressIdentity([p]),ingressIdentity([projectOwnedIngressTable(b,'bridge',scope)]));
});
for(const mutation of [x=>x.nftables.pop(),x=>x.nftables[3].rule.expr[0].match.right='foreign',x=>x.nftables[3].rule.expr.push({accept:null}),x=>x.nftables[1].table.flags=['dormant'],x=>x.nftables[3].rule.chain='unapproved',x=>x.nftables[3].rule.table='foreign',x=>x.nftables[2].chain.policy='drop',x=>x.nftables[3].rule.handle=Number.MAX_SAFE_INTEGER+1,x=>x.nftables.push(structuredClone(x.nftables[3]))])test('missing/foreign/unsafe/extra kernel object is HOLD',()=>{const x=kernel();mutation(x);assert.throws(()=>projectOwnedIngressTable(x,'bridge',scope));});

function inetKernel(){const compiled=compileOwnedIngressRules(scope);return {nftables:[{metainfo:{}},{table:{family:'inet',name:table,handle:1}},...compiled.definitions.filter(x=>x.family==='inet').flatMap((d,i)=>[{chain:{family:'inet',table,name:d.chain,type:'filter',policy:'accept',prio:d.priority,hook:d.hook,handle:i*2+2}},{rule:{family:'inet',table,chain:d.chain,handle:i*2+3,expr:structuredClone(d.expr)}}])]};}
function renderedPrerequisites(x){for(const row of x.nftables){if(row.rule)row.rule.expr=row.rule.expr.filter(e=>!['nfproto','l4proto'].includes(e.match?.left?.meta?.key));}return x;}
test('actual nft inet rendering may omit exact implied IPv4/TCP prerequisites',()=>{
 const explicit=inetKernel(),rendered=renderedPrerequisites(inetKernel());assert.deepEqual(ingressIdentity([projectOwnedIngressTable(explicit,'inet',scope)]),ingressIdentity([projectOwnedIngressTable(rendered,'inet',scope)]));
});
test('implied IPv4 payload may replace exact EtherType prerequisite in bridge rendering',()=>{const x=kernel();x.nftables[3].rule.expr=x.nftables[3].rule.expr.filter(e=>e.match?.left?.payload?.protocol!=='ether'&&e.match?.left?.meta?.key!=='l4proto');assert.deepEqual(ingressIdentity([projectOwnedIngressTable(kernel(),'bridge',scope)]),ingressIdentity([projectOwnedIngressTable(x,'bridge',scope)]));});
for(const change of [
 expr=>expr.find(e=>e.match?.left?.meta?.key==='nfproto').match.right='ipv6',
 expr=>expr.find(e=>e.match?.left?.meta?.key==='l4proto').match.right='udp',
 expr=>expr.find(e=>e.match?.left?.meta?.key==='nfproto').match.op='!=',
 expr=>expr.push(structuredClone(expr.find(e=>e.match?.left?.meta?.key==='nfproto'))),
 expr=>expr.find(e=>e.match?.left?.meta?.key==='nfproto').match.extra='unexpected',
 expr=>expr.splice(expr.findIndex(e=>e.match?.left?.payload?.protocol==='ip'),1),
 expr=>expr.find(e=>e.match?.left?.payload?.protocol==='tcp').match.right=3101,
 expr=>expr.find(e=>e.match?.left?.payload?.protocol==='ip').match.left.payload.field='saddr',
])test('implied prerequisite normalization cannot accept conflicting or changed predicates',()=>{const x=inetKernel();change(x.nftables.find(e=>e.rule).rule.expr);assert.throws(()=>projectOwnedIngressTable(x,'inet',scope));});
