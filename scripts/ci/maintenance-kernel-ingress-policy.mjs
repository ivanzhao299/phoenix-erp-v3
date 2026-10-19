/** Isolated VM experiment compiler. No production caller, authority or CLI. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exact = (object, keys) => assert.deepEqual(Object.keys(object).sort(), keys.sort());
export function compileOwnedIngressRules(scope) {
  exact(scope, ['owner', 'bridge', 'subnet', 'port']);
  assert.match(scope.owner, /^[a-f0-9]{32}$/); assert.match(scope.bridge, /^br-[a-f0-9]{12}$/);
  assert.equal(scope.port, 3100);
  const parts = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(scope.subnet);
  assert.ok(parts); const [a,b,c,d,p] = parts.slice(1).map(Number);
  assert.ok([a,b,c,d].every(n => Number.isInteger(n) && n >= 0 && n < 256));
  assert.ok((a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168)) && p>=16 && p<=28);
  const addr = ((a*256+b)*256+c)*256+d, size = 2**(32-p); assert.equal(addr % size, 0);
  assert.equal(scope.subnet, `${a}.${b}.${c}.${d}/${p}`);
  const table = `phoenix_fixture_${scope.owner}`;
  const [address,length]=scope.subnet.split('/');
  const match=(left,right)=>({match:{op:'==',left,right}});
  const meta=(key,right)=>match({meta:{key}},right);
  const payload=(protocol,field,right)=>match({payload:{protocol,field}},right);
  const tcp=[meta('l4proto','tcp'),payload('tcp','dport',3100)];
  const destination=payload('ip','daddr',{prefix:{addr:address,len:Number(length)}});
  const definitions=[
    {family:'inet',chain:'host_published',hook:'output',priority:-110,expr:[meta('nfproto','ipv4'),payload('ip','daddr','127.0.0.1'),...tcp]},
    {family:'inet',chain:'host_direct',hook:'output',priority:-5,expr:[meta('oifname',scope.bridge),meta('nfproto','ipv4'),destination,...tcp]},
    {family:'inet',chain:'routed',hook:'forward',priority:-5,expr:[meta('oifname',scope.bridge),meta('nfproto','ipv4'),destination,...tcp]},
    {family:'bridge',chain:'peer',hook:'forward',priority:-5,expr:[meta('ibrname',scope.bridge),payload('ether','type','ip'),destination,...tcp]},
  ].map(x=>({...x,expr:[...x.expr,{counter:{packets:0,bytes:0}},{drop:null}]}));
  const commands=['inet','bridge'].flatMap(family=>[
    {add:{table:{family,name:table}}},
    ...definitions.filter(d=>d.family===family).flatMap(d=>[
      {add:{chain:{family,table,name:d.chain,type:'filter',hook:d.hook,prio:d.priority,policy:'accept'}}},
      {add:{rule:{family,table,chain:d.chain,expr:d.expr}}},
    ])]);
  const program=JSON.stringify({nftables:commands});
  return { table, program, programSha256: createHash('sha256').update(program).digest('hex'), definitions,
    scope: 'OWNED_IPV4_TCP3100_NEW_INGRESS_ONLY', productionAuthority: false, continuousIngressProof: false, inflightDrain: 'NOT_PROVED' };
}
function normalizedExpressions(expressions) {
  const expanded=expressions.map(expression=>{
    if(expression.counter) return {counter:{}};
    if(expression.match) {
      const copy=structuredClone(expression);const match=copy.match;
      if(match.left?.meta?.key==='nfproto'&&match.right===2)match.right='ipv4';
      if(match.left?.meta?.key==='l4proto'&&match.right===6)match.right='tcp';
      if(match.left?.payload?.protocol==='ether'&&match.left.payload.field==='type'&&match.right===2048)match.right='ip';
      return copy;
    }
    return expression;
  });
  // nft renders protocol prerequisites implicitly once a corresponding payload
  // header is present. Normalize only exact equivalent equality predicates;
  // contradictory/unknown selectors and extra fields must still be rejected.
  const payload=protocol=>expanded.some(e=>e.match?.left?.payload?.protocol===protocol);
  const prerequisites=[
    ...(payload('ip')?[{match:{op:'==',left:{meta:{key:'nfproto'}},right:'ipv4'}},{match:{op:'==',left:{payload:{protocol:'ether',field:'type'}},right:'ip'}}]:[]),
    ...(payload('tcp')?[{match:{op:'==',left:{meta:{key:'l4proto'}},right:'tcp'}}]:[]),
  ].map(canonical);const seen=new Set();
  return expanded.filter(expression=>{const key=canonical(expression);if(!prerequisites.includes(key))return true;assert.ok(!seen.has(key),'KERNEL_FIXTURE_DUPLICATE_PROTOCOL_PREREQUISITE');seen.add(key);return false;});
}
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&Object.getPrototypeOf(item)===Object.prototype?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
/** The actual kernel JSON remains in private fixture memory. Persist a safe
 * identity+counter projection only; no arbitrary host ruleset is retained. */
export function projectOwnedIngressTable(value, family, scope) {
  assert.ok(['inet','bridge'].includes(family));const compiled=compileOwnedIngressRules(scope),table=compiled.table;const expected=compiled.definitions.filter(d=>d.family===family);
  assert.ok(Array.isArray(value.nftables)); const objects = value.nftables.filter(x => !x.metainfo);
  assert.deepEqual(objects.map(x=>Object.keys(x).length),objects.map(()=>1));
  const rows = objects.map(object => {
    const [kind] = Object.keys(object); const body=object[kind]; assert.ok(['table','chain','rule'].includes(kind));
    exact(body, kind==='table'?['family','name','handle']:kind==='chain'?['family','table','name','handle','type','policy','prio','hook']:['family','table','chain','handle','expr']);
    assert.equal(body.family,family); assert.equal(kind==='table'?body.name:body.table,table);
    assert.ok(Number.isSafeInteger(body.handle)&&body.handle>0);
    if (kind==='table') return {kind,family,name:body.name,handle:body.handle};
    if (kind==='chain') { assert.equal(body.type,'filter');assert.equal(body.policy,'accept');const definition=expected.find(d=>d.chain===body.name);assert.ok(definition);assert.equal(body.prio,definition.priority);
      assert.ok((family==='inet'&&['host_published','host_direct','routed'].includes(body.name))||(family==='bridge'&&body.name==='peer'));
      assert.equal(body.hook,{host_published:'output',host_direct:'output',routed:'forward',peer:'forward'}[body.name]);
      return {kind,family,table,handle:body.handle,name:body.name,hook:body.hook,priority:body.prio}; }
    assert.ok((family==='inet'&&['host_published','host_direct','routed'].includes(body.chain))||(family==='bridge'&&body.chain==='peer'));
    assert.ok(Array.isArray(body.expr));for(const expression of body.expr)assert.equal(Object.keys(expression).length,1); const counters=body.expr.filter(x=>x.counter);
    assert.equal(counters.length,1);assert.ok(Number.isSafeInteger(counters[0].counter.packets)&&counters[0].counter.packets>=0);assert.ok(Number.isSafeInteger(counters[0].counter.bytes)&&counters[0].counter.bytes>=0);
    const normalized=normalizedExpressions(body.expr);const definition=expected.find(d=>d.chain===body.chain);assert.ok(definition);assert.equal(canonical(normalized),canonical(normalizedExpressions(definition.expr)),'KERNEL_FIXTURE_UNEXPECTED_RULE_EXPRESSION');
    return {kind,family,table,handle:body.handle,chain:body.chain,expressionSha256:createHash('sha256').update(canonical(normalized)).digest('hex'),packets:counters[0].counter.packets};
  });
  assert.equal(rows.filter(x=>x.kind==='table').length,1);
  assert.equal(rows.filter(x=>x.kind==='chain').length,family==='inet'?3:1);
  assert.equal(rows.filter(x=>x.kind==='rule').length,family==='inet'?3:1);
  assert.equal(new Set(rows.filter(x=>x.kind==='rule').map(x=>x.chain)).size,family==='inet'?3:1);
  return rows;
}
export function ingressIdentity(tables) { return tables.flat().map(({packets,...identity})=>identity); }
