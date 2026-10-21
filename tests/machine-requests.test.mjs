import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../proxy/worker.js';
import {load,fnSource} from './app.mjs';
const origin='https://nrw18.github.io',key='test-only-stats-key',anon='anonymous-0001';
const day=offset=>new Date(Date.now()+7*3600e3+offset*864e5).toISOString().slice(0,10);
function database(){
  const raw=new DatabaseSync(':memory:');
  function stmt(sql,args=[]){return {sql,args,bind:(...values)=>stmt(sql,values),first:async()=>raw.prepare(sql).get(...args),run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}})};}
  return {raw,prepare:sql=>stmt(sql),batch:async rows=>{raw.exec('BEGIN IMMEDIATE');try{const result=rows.map(s=>/^\s*SELECT/i.test(s.sql)?{results:raw.prepare(s.sql).all(...s.args)}:{results:[],meta:{changes:Number(raw.prepare(s.sql).run(...s.args).changes)}});raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
function request(body={name:'treadmill'},extra={}){return new Request('https://proxy.example/machine-request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Stats-Id':anon,...extra},body:typeof body==='string'?body:JSON.stringify(body)});}
function stats(secret=key,days=1){return new Request('https://proxy.example/stats?days='+days,{headers:{Origin:origin,'X-Stats-Key':secret}});}
test('machine requests accept only the exact normalized name shape; reject photos and extra fields',async()=>{
 const DB=database();
 const invalid=[{},null,[],{name:''},{name:'x'.repeat(61)},{name:'leg_press'},{name:'Leg press'},{name:' leg press'},{name:'leg press '},{name:'เครื่อง'},{name:'123'},{name:'a@b.com'},{name:'<img>'},{name:'treadmill',photo:'data:image/jpeg;base64,abc'},{name:'treadmill',a:anon},{name:'treadmill',weight:30},{name:'treadmill',device:{}},{name:123},'{bad'];
 for(const body of invalid)assert.equal((await worker.fetch(request(body),{DB})).status,400,JSON.stringify(body));
 assert.equal((await worker.fetch(request({name:'a'.repeat(60)}),{DB})).status,204);
 const oversized='{"name":"'+'x'.repeat(1000)+'"}';assert.equal((await worker.fetch(request(oversized),{DB})).status,400);
});
test('machine requests enforce origin, method, anonymous ID and CORS before database writes',async()=>{
 const DB=database();
 for(const bad of ['https://evil.example','null',''])assert.equal((await worker.fetch(request(undefined,{Origin:bad}),{DB})).status,403);
 for(const value of ['','short','has spaces','x'.repeat(41)])assert.equal((await worker.fetch(request(undefined,{'X-Stats-Id':value}),{DB})).status,400);
 assert.equal((await worker.fetch(new Request('https://proxy.example/machine-request',{headers:{Origin:origin}}),{DB})).status,405);
 const pre=await worker.fetch(new Request('https://proxy.example/machine-request',{method:'OPTIONS',headers:{Origin:origin}}),{DB});
 assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);assert.match(pre.headers.get('Access-Control-Allow-Headers'),/X-Stats-Id/);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'machine_requests'").get().n,0);
});
test('daily upsert increments one row atomically and keeps only anonymous quota data outside the aggregate',async()=>{
 const DB=database();
 const responses=await Promise.all(Array.from({length:12},()=>worker.fetch(request(),{DB})));
 assert.ok(responses.every(res=>res.status===204));
 assert.deepEqual({...DB.raw.prepare('SELECT * FROM machine_requests').get()},{name:'treadmill',day:day(0),count:12});
 assert.deepEqual(DB.raw.prepare('PRAGMA table_info(machine_requests)').all().map(col=>col.name),['name','day','count']);
 assert.equal(DB.raw.prepare('SELECT count FROM machine_request_limits').get().count,12);
});
test('machine requests and /e share the existing 400 per-device daily budget without KV writes',async()=>{
 const DB=database();await worker.fetch(request(),{DB,RL:{put(){throw Error('must not use KV');}}});
 DB.raw.prepare('UPDATE machine_request_limits SET count = 399').run();
 const responses=await Promise.all([worker.fetch(request(),{DB}),worker.fetch(request(),{DB})]);
 assert.deepEqual(responses.map(res=>res.status).sort(),[204,429]);
 assert.equal(DB.raw.prepare('SELECT count FROM machine_requests').get().count,2);
 const e=new Request('https://proxy.example/e',{method:'POST',headers:{Origin:origin},body:JSON.stringify({a:anon,e:[['open',Date.now()]]})});
 assert.equal((await worker.fetch(e,{DB})).status,204);assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM ev').get().n,0);
 const other='anonymous-0002';
 DB.raw.prepare('INSERT INTO ev(day,ts,anon,ev) VALUES(?,?,?,?)').run(day(0),Date.now(),other,'open');
 DB.raw.prepare('INSERT INTO machine_request_limits(anon,day,count) VALUES(?,?,?)').run(other,day(0),399);
 assert.equal((await worker.fetch(request(undefined,{'X-Stats-Id':other}),{DB})).status,429);
 DB.raw.prepare('INSERT INTO machine_request_limits(anon,day,count) VALUES(?,?,?)').run('expired-device',day(-30),400);
 await worker.fetch(request(undefined,{'X-Stats-Id':'anonymous-0003'}),{DB});
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM machine_request_limits WHERE day < ?').get(day(-29)).n,0);
});
test('machine requests have an app-wide daily cap that forged device IDs cannot get around',async()=>{
 const DB=database();await worker.fetch(request(),{DB});
 DB.raw.prepare('UPDATE machine_requests SET count = 1999').run();
 DB.raw.prepare('INSERT INTO machine_requests(name,day,count) VALUES(?,?,?)').run('treadmill',day(-1),5000);
 assert.equal((await worker.fetch(request({name:'rower'}),{DB})).status,204,'yesterday does not count against today');
 for(const id of ['anonymous-0002','anonymous-0003','forged-device-4'])assert.equal((await worker.fetch(request({name:'new machine '+id.slice(-1)},{'X-Stats-Id':id}),{DB})).status,429,id);
 assert.equal((await worker.fetch(request(),{DB})).status,429,'the original device is capped too');
 assert.equal(DB.raw.prepare('SELECT SUM(count) AS n FROM machine_requests WHERE day = ?').get(day(0)).n,2000);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM machine_requests WHERE day = ?').get(day(0)).n,2,'rejected names are not stored');
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM machine_request_limits WHERE anon <> ?').get(anon).n,0,'rejected devices leave no quota rows');
 const e=new Request('https://proxy.example/e',{method:'POST',headers:{Origin:origin},body:JSON.stringify({a:'anonymous-0009',e:[['open',Date.now()]]})});
 assert.equal((await worker.fetch(e,{DB})).status,204);assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM ev WHERE anon = ?').get('anonymous-0009').n,1,'/e is not affected by the photo-request cap');
 assert.match(readFileSync(new URL('../proxy/worker.js',import.meta.url),'utf8'),/MACHINE_REQUESTS_DAILY = 2000/);
});
test('/stats protects machine requests with STATS_KEY and uses a fixed Bangkok 30-day window, top 30',async()=>{
 const DB=database(),env={DB,STATS_KEY:key};await worker.fetch(request(),env);
 DB.raw.prepare('INSERT INTO machine_requests VALUES(?,?,?)').run('old',day(-30),9000);
 DB.raw.prepare('INSERT INTO machine_requests VALUES(?,?,?)').run('treadmill',day(-29),4);
 DB.raw.prepare('INSERT INTO machine_requests VALUES(?,?,?)').run('future',day(1),9000);
 for(let i=0;i<31;i++)DB.raw.prepare('INSERT INTO machine_requests VALUES(?,?,?)').run('station '+String(i).padStart(2,'0'),day(0),2);
 assert.equal((await worker.fetch(stats('wrong'),env)).status,401);
 const output=await (await worker.fetch(stats(),env)).json();
 assert.equal(output.machineRequestsDays,30);assert.equal(output.machineRequests.length,30);
 assert.deepEqual(output.machineRequests[0],{name:'treadmill',count:5});
 assert.equal(output.machineRequests.some(row=>['old','future'].includes(row.name)),false);
 assert.equal(output.machineRequests[1].name,'station 00');
});
test('migration SQL is idempotent and worker failures return retryable status without logging payloads',async()=>{
 const DB=database();const migration=readFileSync(new URL('../proxy/migrations/0001_machine_requests.sql',import.meta.url),'utf8');
 DB.raw.exec(migration);DB.raw.exec(migration);
 assert.equal((await worker.fetch(request(),{})).status,503);
 assert.equal((await worker.fetch(request(),{DB:{batch:async()=>{throw Error('database unavailable');},prepare(){}}})).status,503);
});
function client(){
 const stored=new Map(),posts=[],messages=[],events=[];
 const a=load(['cleanPhotoRequestName','photoRequestsSent','photoRequestHtml','requestMachinePhoto'],{
   AbortController,setTimeout,clearTimeout,
   PHOTO_REQUEST_KEY:'requests',photoRequestPending:{},MACHINE_PHOTOS:{photo:{src:'example.webp'}},
   localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
   statsOn:()=>true,statsLive:true,navigator:{onLine:true},anonId:()=>anon,PROXY_URL:'https://proxy.example/',
   refreshPhotoRequests(){},toast:message=>messages.push(message),track:event=>events.push(event),
   esc:value=>String(value).replaceAll('<','&lt;').replaceAll('"','&quot;'),
   fetch:async(url,options)=>{posts.push({url,...options});return {ok:true,status:204};}
 });return {a,stored,posts,messages,events};
}
test('client requires tap, consent, connectivity and persistent storage; sends only name plus existing stats ID',async()=>{
 const {a,stored,posts}=client();
 assert.equal(posts.length,0);a.statsOn=()=>false;await a.requestMachinePhoto('Treadmill');assert.equal(posts.length,0);
 a.statsOn=()=>true;a.statsLive=false;await a.requestMachinePhoto('Treadmill');assert.equal(posts.length,0);
 a.statsLive=true;await a.requestMachinePhoto(' Treadmill ');assert.equal(posts.length,1);
 assert.equal(posts[0].url,'https://proxy.example/machine-request');assert.deepEqual(JSON.parse(posts[0].body),{name:'treadmill'});
 assert.equal(posts[0].headers['X-Stats-Id'],anon);assert.equal(posts[0].credentials,'omit');assert.equal(posts[0].referrerPolicy,'no-referrer');
 await a.requestMachinePhoto('treadmill');assert.equal(posts.length,1);assert.match(stored.get('requests'),/treadmill/);
 a.localStorage.setItem=()=>{throw Error('quota');};await a.requestMachinePhoto('elliptical');assert.equal(posts.length,1);
});
test('failed client requests can retry; double taps, malformed storage and user-typed labels cannot leak',async()=>{
 const {a,posts,stored}=client();let finish;
 a.fetch=async(url,options)=>{posts.push({url,...options});await new Promise(resolve=>finish=resolve);return {ok:false};};
 const first=a.requestMachinePhoto('rower');await a.requestMachinePhoto('rower');assert.equal(posts.length,1);finish();await first;
 assert.equal(a.photoRequestsSent().includes('rower'),false);
 stored.set('requests','[{},null,42,"valid name"]');assert.deepEqual(Array.from(a.photoRequestsSent()),['valid name']);
 assert.equal(a.photoRequestHtml({id:'photo'},'treadmill'),'');
 assert.match(a.photoRequestHtml({name:'USER TYPED PRIVATE NAME'},''),/disabled/);
 assert.doesNotMatch(a.photoRequestHtml({name:'USER TYPED PRIVATE NAME'},''),/USER TYPED/);
 for(const value of ['name@example.com','<img src=x>','a'.repeat(61),'ชื่อไทย'])assert.equal(a.cleanPhotoRequestName(value),'');
 assert.doesNotMatch(fnSource('requestMachinePhoto'),/scanThumb|weight|\.name\b|photo:|image:/);
});
test('waiting for a tab lock rechecks consent and storage; lock rejection stays recoverable',async()=>{
 const {a,posts}=client();
 a.navigator.locks={request:async(name,send)=>{a.statsOn=()=>false;await send();}};
 await a.requestMachinePhoto('treadmill');assert.equal(posts.length,0);assert.equal(a.photoRequestsSent().length,0);
 a.statsOn=()=>true;a.navigator.locks.request=async()=>{throw Error('locks blocked');};
 await a.requestMachinePhoto('treadmill');assert.equal(posts.length,0);assert.equal(a.photoRequestPending.treadmill,undefined);
});
