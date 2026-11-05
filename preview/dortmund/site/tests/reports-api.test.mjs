import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {handleReports} from '../lib/reports-api.mjs';
const network={stations:[{id:'a',name:'Hbf',lat:51.5,lng:7.4},{id:'a2',name:'Hbf',lat:51.5001,lng:7.4001},{id:'b',name:'Hafen',lat:51.52,lng:7.42},{id:'c',name:'Süd',lat:51.48,lng:7.39}],lines:[{name:'U41',stationIds:['a','b']},{name:'U41',stationIds:['a2','b']},{name:'U41',stationIds:['a','c']},{name:'S1',stationIds:['b','c']}]};
function setup(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){const execute=()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}});return {execute,first:async()=>sqlite.prepare(sql).get(...args),all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>execute()};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 return {call:(method='GET',body,userId='alice',now=10000000,tail='',origin)=>handleReports(new Request('https://example.test/api/reports'+tail,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined}),{DB},network,{userId,now})};
}
const sighting=(patch={})=>({id:crypto.randomUUID(),stationId:'a',lineName:'U41',directionId:'b',...patch});
const feedback=kind=>({id:crypto.randomUUID(),kind});
async function list(call,user='alice',now=10000000){return (await (await call('GET',undefined,user,now)).json()).reports;}
test('sighting lifecycle, replay and privacy; persisted request IDs resist changed payloads',async()=>{
 const {call}=setup(),entry=sighting(),response=await call('POST',entry);assert.equal(response.status,201);const saved=await response.json();const [report]=await list(call);assert.equal(report.id,saved.id);assert.equal(report.status,'unconfirmed');assert.equal(report.seenBy,1);assert.equal(report.own,true);assert.equal(report.actor_key,undefined);assert.equal(report.actorKey,undefined);
 assert.equal((await call('POST',entry)).status,200);assert.equal((await call('POST',{...entry,stationId:'a2'})).status,409);assert.equal((await call('POST',sighting())).status,429);
 assert.equal((await call('DELETE',undefined,'bob',10001000,'/'+saved.id)).status,404);assert.equal((await call('DELETE',undefined,'alice',10001000,'/'+saved.id)).status,200);assert.equal((await list(call,'alice',10001000)).length,0);
});
test('merge nearby platforms with same name, line and direction; own repeats never add trust',async()=>{
 const {call}=setup();const first=await (await call('POST',sighting())).json();const second=await (await call('POST',sighting({stationId:'a2'}),'bob')).json();assert.equal(second.id,first.id);assert.equal(second.merged,true);let reports=await list(call);assert.equal(reports.length,1);assert.equal(reports[0].status,'confirmed');assert.equal(reports[0].seenBy,2);assert.equal(reports[0].confirmations,1);
 await call('POST',feedback('seen'),'alice',10011000,'/'+first.id+'/feedback');reports=await list(call,'alice',10011000);assert.equal(reports[0].seenBy,2);
 const separate=await (await call('POST',sighting({directionId:'c'}),'charlie')).json();assert.notEqual(separate.id,first.id);assert.equal((await list(call)).length,2);
});
test('concurrent matching submissions create one group and independent sightings',async()=>{
 const {call}=setup();const responses=await Promise.all([call('POST',sighting(),'alice'),call('POST',sighting(),'bob')]);assert.ok(responses.every(r=>[200,201].includes(r.status)));const reports=await list(call);assert.equal(reports.length,1);assert.equal(reports[0].seenBy,2);
});
test('uncertainty does not expire an event; two independent clears after last sighting resolve it',async()=>{
 const {call}=setup(),saved=await (await call('POST',sighting())).json(),tail='/'+saved.id+'/feedback';
 assert.equal((await call('POST',feedback('unsure'),'bob',10001000,tail)).status,200);let [report]=await list(call,'alice',10001000);assert.equal(report.status,'unconfirmed');assert.equal(report.expiresAt,13600000);
 await call('POST',feedback('clear'),'charlie',10002000,tail);[report]=await list(call,'alice',10002000);assert.equal(report.status,'disputed');assert.equal(report.clearBy,1);
 await call('POST',feedback('clear'),'dora',10003000,tail);[report]=await list(call,'alice',10003000);assert.equal(report.status,'resolved');assert.equal(report.clearBy,2);
 await call('POST',feedback('seen'),'ellen',10004000,tail);[report]=await list(call,'ellen',10004000);assert.equal(report.status,'unconfirmed');assert.equal(report.seenBy,1);assert.equal(report.lastSeenAt,10004000);
});
test('withdrawing an own sighting preserves independent observations',async()=>{
 const {call}=setup(),saved=await (await call('POST',sighting())).json();await call('POST',sighting(),'bob');await call('DELETE',undefined,'alice',10001000,'/'+saved.id);const [report]=await list(call,'alice',10001000);assert.equal(report.seenBy,1);assert.equal(report.own,false);assert.equal(report.status,'unconfirmed');
});
test('positive observations refresh expiry, unsure/clear do not, expired feedback is rejected',async()=>{
 const {call}=setup(),saved=await (await call('POST',sighting())).json(),tail='/'+saved.id+'/feedback';await call('POST',feedback('seen'),'bob',11800000,tail);let [report]=await list(call,'alice',13600001);assert.equal(report.seenBy,1);assert.equal(report.expiresAt,15400000);assert.equal((await list(call,'alice',15400001)).length,0);assert.equal((await call('POST',feedback('seen'),'bob',15400001,tail)).status,410);
 const reopened=await (await call('POST',sighting(),'charlie',15400001)).json();assert.equal(reopened.id,saved.id);[report]=await list(call,'charlie',15400001);assert.equal(report.seenBy,1);assert.equal(report.createdAt,15400001);
});
test('validation, auth, origin and duplicate feedback request IDs',async()=>{
 const {call}=setup();for(const patch of [{stationId:'missing'},{lineName:'S1'},{directionId:'a'}])assert.equal((await call('POST',sighting(patch))).status,400);
 assert.equal((await call('GET',undefined,null)).status,401);assert.equal((await call('POST',sighting(),'alice',10000000,'','https://other.test')).status,403);
 const saved=await (await call('POST',sighting())).json(),entry=feedback('seen'),tail='/'+saved.id+'/feedback';assert.equal((await call('POST',entry,'bob',10001000,tail)).status,200);assert.equal((await call('POST',entry,'bob',10002000,tail)).status,200);assert.equal((await list(call,'alice',10002000))[0].seenBy,2);assert.equal((await call('POST',feedback('clear'),'bob',10002000,tail)).status,429);
});
