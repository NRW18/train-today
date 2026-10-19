import {test} from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {load, html} from "./app.mjs";

test("personal-key requests use the shared task budget and task-specific model order", async () => {
  for (const [task, max] of [["scan",800],["food",500],["explain",300],["week",500]]) {
    const calls=[];
    const a=load(["callGemini"], {navigator:{onLine:true},getKey:()=>"test",withLang:parts=>parts,
      fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{"answer":1}');},
      readAIResponse:res=>res.json(),parseGemini:json=>json.answer});
    assert.equal(await a.callGemini([{text:"test"}],0,null,task),1);
    assert.match(calls[0].url, task==="explain"||task==="week" ? /gemini-3.1-flash-lite:/ : /gemini-3-flash-preview:/);
    const config=calls[0].body.generationConfig;
    assert.equal(config.maxOutputTokens,max);
    assert.equal(config.thinkingConfig.thinkingLevel,"minimal");
    assert.equal(config.mediaResolution,task==="scan"||task==="food"?"MEDIA_RESOLUTION_MEDIUM":undefined);
    assert.equal(a.KryvosAI.config(task,"gemini-flash-latest").thinkingConfig,undefined,"do not guess the moving alias's thinking API");
  }
});

test("personal fallback skips an unsupported-config model, keeping task on the next request", async () => {
  const urls=[],configs=[];
  const a=load(["callGemini"], {navigator:{onLine:true},getKey:()=>"test",withLang:parts=>parts,
    fetch:async(url,options)=>{urls.push(url);configs.push(JSON.parse(options.body).generationConfig);return urls.length===1 ?
      new Response('{"error":{"message":"thinkingLevel is not supported"}}',{status:400}):new Response('{"answer":1}');},
    readAIResponse:res=>res.json(),parseGemini:json=>json.answer});
  assert.equal(await a.callGemini([{text:"p"}],0,null,"explain"),1);
  assert.match(urls[0],/flash-lite:/);assert.match(urls[1],/3-flash-preview:/);
  assert.ok(configs.every(config=>config.maxOutputTokens===300));
});

test("proxy retry sends only the task and parts, never client token config", async () => {
  const bodies=[];
  const a=load(["callProxy"], {PROXY_URL:"https://worker.test/",setTimeout:fn=>fn(),
    fetch:async(_,options)=>{bodies.push(JSON.parse(options.body));return new Response('{"answer":1}',{status:bodies.length===1?503:200});},
    readAIResponse:res=>res.json(),parseGemini:json=>json.answer});
  assert.equal(await a.callProxy([{text:"p"}],false,null,"food"),1);
  assert.deepEqual(bodies,[{parts:[{text:"p"}],task:"food"},{parts:[{text:"p"}],task:"food"}]);
});

function scanner() {
  let calls=0;
  const a=load(["scanCacheKey","scanAI"], {crypto:webcrypto,TextEncoder,Uint8Array,scanCache:new Map(),
    withLang:parts=>parts,validateScan:raw=>{if(!raw.equipment)throw Error("invalid");return raw;},
    callGemini:async()=>{calls++;return {equipment:[{ids:["press"]}],fresh:[]};}});
  const parts=(image="photo",prompt="known press; English")=>[{text:prompt},{inline_data:{mime_type:"image/jpeg",data:image}}];
  return {a,parts,get calls(){return calls;}};
}
test("resized scan hash deduplicates concurrent/repeated photos, clones results, and keeps at most five", async () => {
  const s=scanner();
  const [one,two]=await Promise.all([s.a.scanAI(s.parts(),{}),s.a.scanAI(s.parts(),{})]);
  assert.equal(s.calls,1);one.equipment[0].ids.push("changed");
  assert.deepEqual(Array.from(two.equipment[0].ids),["press"]);
  assert.deepEqual(Array.from((await s.a.scanAI(s.parts(),{})).equipment[0].ids),["press"]);
  for(let i=0;i<5;i++)await s.a.scanAI(s.parts("photo"+i),{});
  assert.equal(s.a.scanCache.size,5);
  await s.a.scanAI(s.parts(),{});assert.equal(s.calls,7,"oldest photo was evicted");
  assert.ok([...s.a.scanCache.keys()].every(key=>/^[a-f0-9]{64}$/.test(key)));
});
test("scan cache invalidates on language/prompt changes and never caches failed validation or API calls", async () => {
  const s=scanner();
  await s.a.scanAI(s.parts(),{});await s.a.scanAI(s.parts("photo","known press; Thai"),{});
  assert.equal(s.calls,2);
  s.a.callGemini=async()=>({bad:true});await assert.rejects(s.a.scanAI(s.parts("invalid"),{}));assert.equal(s.a.scanCache.size,2);
  s.a.callGemini=async()=>{throw Error("network");};await assert.rejects(s.a.scanAI(s.parts("offline"),{}));assert.equal(s.a.scanCache.size,2);
  delete s.a.crypto;
  s.a.callGemini=async()=>({equipment:[],fresh:[]});await s.a.scanAI(s.parts(),{});
});

function weekly() {
  let now=Date.UTC(2026,9,19,12),stats={sessions:1},calls=0;
  const nodes={},messages=[];
  class Clock extends Date {static now(){return now;}}
  const a=load(["weekCacheKey","weekAI"], {Date:Clock,weekPending:null,AI_LANG:"English",
    dayKey:ts=>new Date(ts).toISOString().slice(0,10),S:{prefs:{goal:"keep"}},weekStats:()=>stats,
    $:id=>nodes[id]||=( {} ),track:()=>{},toast:message=>messages.push(message),errText:()=>"error",
    renderWeek:()=>{},save:()=>{},strList:values=>values,
    callGemini:async(parts,index,diagnostic,task)=>{assert.equal(task,"week");calls++;return {summary_th:"Keep going",tips_th:["Rest"]};}});
  return {a,messages,get calls(){return calls;},nextDay(){now+=864e5;},change(){stats={sessions:2};}};
}
test("week cache reuses same-day stats, survives reload, and supports explicit regeneration", async () => {
  const w=weekly();await Promise.all([w.a.weekAI(),w.a.weekAI()]);assert.equal(w.calls,1);
  await w.a.weekAI();assert.equal(w.calls,1);
  const reloaded=weekly();reloaded.a.S.summary=JSON.parse(JSON.stringify(w.a.S.summary));
  await reloaded.a.weekAI();assert.equal(reloaded.calls,0);
  await w.a.weekAI(true);assert.equal(w.calls,2);
  assert.match(html,/id="week-ai-refresh"/);assert.match(html,/weekAI\(true\)/);
});
test("week cache invalidates after midnight, changed stats, goal/language and old summary without key", async () => {
  const w=weekly();await w.a.weekAI();w.nextDay();await w.a.weekAI();assert.equal(w.calls,2);
  w.change();await w.a.weekAI();w.a.S.prefs.goal="gain";await w.a.weekAI();w.a.AI_LANG="Thai";await w.a.weekAI();
  assert.equal(w.calls,5);delete w.a.S.summary.cacheKey;await w.a.weekAI();assert.equal(w.calls,6);
});
test("failed week requests unlock retry, retain old summaries and never write after data replacement", async () => {
  const w=weekly();await w.a.weekAI();const summary=w.a.S.summary;
  w.a.callGemini=async()=>{throw Error("upstream");};await w.a.weekAI(true);
  assert.equal(w.a.weekPending,null);assert.equal(w.a.S.summary,summary);assert.equal(w.messages.length,1);
  w.a.callGemini=async()=>{w.a.S={prefs:{goal:"keep"}};return {summary_th:"stale",tips_th:[]};};
  await w.a.weekAI(true);assert.equal(w.a.S.summary,undefined);
});
test("shrink retains original image quality until five real-photo comparisons approve a reduction", async () => {
  for(const [width,height,expected] of [[2048,1024,[1024,512]],[512,2048,[256,1024]],[320,200,[320,200]]]){
    let quality,mime,revoked=0;const canvas={getContext:()=>({drawImage(){}}),toDataURL:(type,value)=>{mime=type;quality=value;return "jpeg";}};
    class Picture {constructor(){this.naturalWidth=width;this.naturalHeight=height;}set src(value){queueMicrotask(()=>this.onload());}}
    const a=load(["shrink"], {Image:Picture,URL:{createObjectURL:()=>"blob:test",revokeObjectURL:()=>revoked++},document:{createElement:()=>canvas}});
    assert.equal(await a.shrink({}),"jpeg");assert.deepEqual([canvas.width,canvas.height],expected);
    assert.equal(quality,.82);assert.equal(mime,"image/jpeg");assert.equal(revoked,1);
  }
});
