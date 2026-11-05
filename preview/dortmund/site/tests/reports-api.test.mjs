import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleReports} from '../lib/reports-api.mjs';
const network={stations:[{id:'a'},{id:'b'},{id:'c'}],lines:[{name:'U41',stationIds:['a','b']},{name:'S1',stationIds:['b','c']}]};
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE reports(id TEXT PRIMARY KEY,station_id TEXT NOT NULL,line_name TEXT,direction_id TEXT,created_at INTEGER NOT NULL,actor_key TEXT NOT NULL)');
 return {DB:{prepare(sql){return {bind(...args){return {
  first:async()=>sqlite.prepare(sql).get(...args),
  all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})
 };}};}}};
}
function request(method='GET',body,tail='',origin){return new Request('https://example.test/api/reports'+tail,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined});}
const body=()=>({id:crypto.randomUUID(),stationId:'a',lineName:'U41',directionId:'b'});
test('create, list without identity leakage, replay, cooldown, expire and delete own report',async()=>{const env=setup(),now=10000000,entry=body();const call=(req,userId='alice',at=now)=>handleReports(req,env,network,{userId,now:at});assert.equal((await call(request('POST',entry))).status,201);let payload=await (await call(request())).json();assert.equal(payload.reports.length,1);assert.equal(payload.reports[0].own,true);assert.equal(payload.reports[0].actor_key,undefined);assert.equal((await call(request('POST',entry))).status,200);assert.equal((await call(request('POST',body()))).status,429);assert.equal((await call(request('DELETE',null,'/'+entry.id),'bob')).status,404);assert.equal((await (await call(request(),'bob',now+3600001)).json()).reports.length,0);assert.equal((await call(request('DELETE',null,'/'+entry.id))).status,200);assert.equal((await (await call(request())).json()).reports.length,0);});
test('reject invalid station/line/direction and missing auth; writes require same origin',async()=>{const env=setup();for(const patch of [{stationId:'missing'},{lineName:'S1'},{directionId:'c'}])assert.equal((await handleReports(request('POST',{...body(),...patch}),env,network,{userId:'alice'})).status,400);assert.equal((await handleReports(request(),env,network,{})).status,401);assert.equal((await handleReports(request('POST',body(),'','https://other.test'),env,network,{userId:'alice'})).status,403);});
test('line and direction are optional; replay with changed content conflicts',async()=>{const env=setup(),entry={id:crypto.randomUUID(),stationId:'a'};assert.equal((await handleReports(request('POST',entry),env,network,{userId:'alice'})).status,201);assert.equal((await handleReports(request('POST',{...entry,stationId:'b'}),env,network,{userId:'alice'})).status,409);});
