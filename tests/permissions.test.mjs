import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

const keys={EXPLANATION_KEY:"kryvos-permission-explanations-v1",VIBRATION_KEY:"kryvos-vibration-enabled",STATS_OFF:"kryvos-stats-off",STATS_Q:"kryvos-stats-q"};
function storage(initial={}) {
  const data=new Map(Object.entries(initial));
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}
const memory={explainedHere:{},vibrationHere:null};

test("explanations persist independently per feature without granting permission or changing personal data",()=>{
  const localStorage=storage({"train-today-v1":"old workout/profile backup","kryvos-stats-off":"1"});
  const a=load(["readExplanations","explanationSeen","markExplanationShown"],{...keys,...memory,explainedHere:{},localStorage});
  assert.equal(a.explanationSeen("machine"),false);a.markExplanationShown("machine");
  assert.equal(a.explanationSeen("machine"),true);assert.equal(a.explanationSeen("food"),false);
  a.markExplanationShown("food");a.explainedHere={}; // simulate a reload
  assert.equal(a.explanationSeen("machine"),true);assert.equal(a.explanationSeen("food"),true);assert.equal(a.explanationSeen("vibration"),false);
  assert.equal(localStorage.getItem("kryvos-vibration-enabled"),null);
  assert.equal(localStorage.getItem("train-today-v1"),"old workout/profile backup");assert.equal(localStorage.getItem("kryvos-stats-off"),"1");
});

test("malformed and blocked storage remain safe and explanation-once works in memory",()=>{
  for(const raw of ["{broken","null",'"bad"','{"machine":"true","food":true}']){
    const a=load(["readExplanations","explanationSeen","markExplanationShown"],{...keys,explainedHere:{},localStorage:storage({[keys.EXPLANATION_KEY]:raw})});
    assert.equal(a.explanationSeen("machine"),false);a.markExplanationShown("machine");assert.equal(a.explanationSeen("machine"),true);
  }
  const a=load(["readExplanations","explanationSeen","markExplanationShown"],{...keys,explainedHere:{},localStorage:{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("full");}}});
  assert.doesNotThrow(()=>a.markExplanationShown("machine"));assert.equal(a.explanationSeen("machine"),true);
});

test("first explanation defers the action; dismissal cancels it and Continue is the only first-use trigger",()=>{
  let opened=0,proceeded=0,onClose,choice;
  const sheet={focus(){}};
  const a=load(["readExplanations","explanationSeen","markExplanationShown","explainOnce"],{...keys,explainedHere:{},localStorage:storage(),sheet,openSheet:(_,cb)=>{opened++;onClose=cb;},closeSheet:()=>onClose?.(),permissionIcon:()=>"",sheetHead:()=>"",setVibrationChoice:value=>choice=value});
  a.explainOnce("vibration",()=>proceeded++);assert.equal(opened,1);assert.equal(proceeded,0);
  sheet.onclick({target:{closest:sel=>sel==='[data-close]'}});assert.equal(choice,false);assert.equal(proceeded,0);
  a.explainOnce("vibration",()=>proceeded++);assert.equal(opened,1);assert.equal(proceeded,1);
  a.explainOnce("food",()=>proceeded++);assert.equal(opened,2);assert.equal(proceeded,1);
  sheet.onclick({target:{closest:sel=>sel==='[data-permission-continue]'}});assert.equal(proceeded,2);
});

test("denied camera routes to help without a picker; gallery remains available and unknown is not denied",()=>{
  const fallback=[],picked=[];
  const a=load(["requestPhoto"],{cameraState:"denied",explainOnce:(_,cb)=>cb(),showPhotoFallback:(...args)=>fallback.push(args),openPhotoPicker:(...args)=>picked.push(args)});
  a.requestPhoto("machine",false);assert.equal(picked.length,0);assert.equal(fallback[0][1],"denied");
  a.requestPhoto("machine",true);assert.deepEqual(picked[0],["machine",true]);
  a.cameraState="unknown";a.requestPhoto("food",false);assert.deepEqual(picked[1],["food",false]);
});

test("picker access failures offer fallbacks while ordinary errors are not misreported as permission denial",()=>{
  let error={name:"NotAllowedError"};const fallback=[];
  const a=load(["openPhotoPicker","photoFailureState"],{$:()=>({click(){throw error;}}),showPhotoFallback:(...args)=>fallback.push(args)});
  a.openPhotoPicker("food",false);assert.deepEqual(fallback[0],["food","denied"]);
  error={name:"Error"};a.openPhotoPicker("machine",false);assert.deepEqual(fallback[1],["machine","unknown"]);
});

test("denial help routes gallery through the explanation gate and preserves manual alternatives",()=>{
  const actions=[],sheet={focus(){}};
  const a=load(["showPhotoFallback"],{sheet,openSheet(){},closeSheet(){},sheetHead:()=>"",permissionIcon:()=>"",requestPhoto:(...args)=>actions.push(args),manualPhotoFallback:feature=>actions.push(feature)});
  a.showPhotoFallback("food","denied");assert.match(sheet.innerHTML,/ตั้งค่าโทรศัพท์/);assert.match(sheet.innerHTML,/data-gallery/);assert.match(sheet.innerHTML,/กรอกอาหารเอง/);
  sheet.onclick({target:{closest:sel=>sel==='[data-gallery]'}});assert.deepEqual(actions[0].slice(0,2),["food",true]);
  sheet.onclick({target:{closest:sel=>sel==='[data-manual]'}});assert.equal(actions[1],"food");
});

test("camera status is queried only, updates after revocation, and unsupported/failed queries are unknown",async()=>{
  const queried=[],status={state:"denied"};
  const a=load(["queryCameraPermission","refreshCameraPermission"],{cameraState:"unknown",navigator:{permissions:{query:desc=>{queried.push(desc.name);return Promise.resolve(status);}}},renderPermissions(){}});
  await a.refreshCameraPermission();assert.equal(a.cameraState,"denied");assert.deepEqual(queried,["camera"]);
  status.state="granted";status.onchange();assert.equal(a.cameraState,"granted");
  a.navigator={permissions:{query:()=>Promise.reject(Error("unsupported"))}};await a.refreshCameraPermission();assert.equal(a.cameraState,"unknown");
  a.navigator={};assert.equal(await a.queryCameraPermission(),null);
});

test("vibration requires a shown explanation and explicit choice, with no permission query",()=>{
  const calls=[],localStorage=storage();
  const a=load(["readExplanations","explanationSeen","markExplanationShown","vibrationEnabled","setVibrationChoice","vibrateRest"],{...keys,explainedHere:{},vibrationHere:null,localStorage,navigator:{vibrate:pattern=>calls.push([...pattern])},renderPermissions(){}});
  a.vibrateRest();assert.equal(calls.length,0);a.markExplanationShown("vibration");a.setVibrationChoice(false);a.vibrateRest();assert.equal(calls.length,0);
  a.setVibrationChoice(true);a.vibrateRest();assert.deepEqual(calls,[[250,120,250]]);
  a.setVibrationChoice(false);a.vibrationHere=null;assert.equal(a.vibrationEnabled(),false);a.vibrateRest();assert.equal(calls.length,1);
  a.navigator={};assert.doesNotThrow(()=>a.vibrateRest());
});

test("both stats switches share existing consent and opt-out clears queued events",()=>{
  const nodes={},localStorage=storage({[keys.STATS_OFF]:"1",[keys.STATS_Q]:'[["open",1]]'});
  const a=load(["setStatsConsent","statsOn","renderPermissions","cameraStatusText","vibrationEnabled"],{...keys,vibrationHere:null,cameraState:"unknown",navigator:{},localStorage,$:id=>nodes[id]??=( {} )});
  a.renderPermissions();assert.equal(nodes["stats-on"].checked,false);assert.equal(nodes["permission-stats-on"].checked,false);
  a.setStatsConsent(true);assert.equal(nodes["stats-on"].checked,true);assert.equal(nodes["permission-stats-on"].checked,true);
  a.setStatsConsent(false);assert.equal(nodes["stats-on"].checked,false);assert.equal(nodes["permission-stats-on"].checked,false);assert.equal(localStorage.getItem(keys.STATS_Q),null);
});
