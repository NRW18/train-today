import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {load,html,fnSource} from "./app.mjs";

const original=JSON.parse(readFileSync(new URL("./fixtures/catalog-original.json",import.meta.url),"utf8"));
const english={};vm.runInNewContext(readFileSync(new URL("../en.js",import.meta.url),"utf8"),english);
const svg=readFileSync(new URL("../assets/machines.svg",import.meta.url),"utf8");
function data(language="th") {
  const a=load([],{t:value=>language==="en"?english.EN[value]||value:value},["MUSCLES","JOINTS","DAYS","ORDER","EN_NAME","GUIDE"]);
  vm.runInContext(html.slice(html.indexOf("var BASE_EX = ["),html.indexOf("var EN_NAME = {")),a);
  return a;
}
const clean=value=>JSON.parse(JSON.stringify(value));
function stateApp() {
  const storage=new Map(),a=data();
  Object.assign(a,{KEY:"train-today-v1",localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    cleanLog:value=>value||[],cleanFood:value=>value||[],cleanW:value=>value||[],cleanRuns:value=>value||[],
    cleanPrefs:value=>value||{},cleanProfile:value=>value||{},cleanShoe:value=>value||null,cleanShoeQ:value=>value||{},
    cleanDraft:()=>({}),cleanScanThumbs:()=>({}),checkLoadedThumbnails:()=>{},
    DATA_WORDS:{},confirm:()=>true,toast:()=>{},renderAll:()=>{},EXBY:{},EX:[],ALL_EX:[]});
  const names=["blankState","load","snapshot","save","rebuildEx","cleanCustom","cleanGuide","cleanEn","strList","dayKey","importBackup","dataList","draftTicked"];
  vm.runInContext(names.map(fnSource).join("\n"),a);a.S=a.blankState();a.storage=a.localStorage;return a;
}

test("catalog keeps all original metadata and has 40-60 unique complete bilingual entries",()=>{
  const a=data(),en=data("en"),items=Array.from(a.BASE_EX);
  assert.ok(items.length>=40&&items.length<=60);
  assert.equal(new Set(items.map(ex=>ex.id)).size,items.length);
  assert.deepEqual(clean(items.filter(ex=>!ex.optional)),original);
  for(const ex of items){
    assert.ok(a.DAYS[ex.day]);assert.ok(ex.m.length&&ex.m.every(key=>a.MUSCLES[key]),ex.id+" muscles");
    assert.ok(ex.j.every(key=>a.JOINTS[key]),ex.id+" joints");
    assert.ok(a.EN_NAME[ex.id]);assert.notEqual(en.BASE_EX.find(row=>row.id===ex.id).name,ex.name,ex.id+" name is translated");
    assert.equal(a.GUIDE[ex.id].how.length,3,ex.id+" steps");assert.equal(a.GUIDE[ex.id].miss.length,2,ex.id+" mistakes");
    assert.ok(a.GUIDE[ex.id].how.concat(a.GUIDE[ex.id].miss).every(text=>text.trim()));
    assert.match(svg,new RegExp('<symbol id="'+ex.id+'" viewBox="0 0 120 90">'),ex.id+" has a named SVG");
  }
  assert.equal(a.BASE_EX.find(ex=>ex.id==="hip_adduction").m[0],"adductors");
});

test("all machines are searchable by Thai and English in either UI language",()=>{
  for(const language of ["th","en"]){
    const a=data(language);a.machineAliases=null;a.EN=english.EN;
    vm.runInContext(fnSource("machineMatches"),a);
    const thai=data();
    for(const ex of a.BASE_EX){
      assert.equal(a.machineMatches(ex,thai.BASE_EX.find(row=>row.id===ex.id).name),true,ex.id+" Thai");
      assert.equal(a.machineMatches(ex,a.EN_NAME[ex.id].toUpperCase()),true,ex.id+" English");
      assert.equal(a.machineMatches(ex,"a phrase with no machine match"),false);
    }
  }
});

test("every new row is off initially, old data/backups stay compatible, and explicit activation survives",()=>{
  const a=stateApp();a.BASE_EX=clean(data().BASE_EX);a.MUSCLES=clean(data().MUSCLES);a.JOINTS=clean(data().JOINTS);
  a.S=a.blankState();const added=a.BASE_EX.filter(ex=>ex.optional).map(ex=>ex.id);
  assert.deepEqual(Array.from(a.S.off),added);
  const old={log:[],off:["leg_press"],custom:[{id:"c_same",name:a.BASE_EX.find(ex=>ex.id==="cable_row").name,day:"pull",m:["back"],j:["shoulder"]}]};
  a.storage.setItem("train-today-v1",JSON.stringify(old));a.load();
  assert.ok(added.every(id=>a.S.off.includes(id)));assert.ok(a.S.off.includes("leg_press"));assert.equal(a.S.custom.length,1);
  a.S.off=a.S.off.filter(id=>id!=="cable_row");a.save();a.S=a.blankState();a.load();
  assert.equal(a.S.off.includes("cable_row"),false);assert.equal(a.S.custom[0].id,"c_same");
  const backup=JSON.stringify(a.snapshot());a.S=a.blankState();a.importBackup(backup);
  assert.equal(a.S.off.includes("cable_row"),false);assert.equal(a.S.custom[0].id,"c_same");
  a.S=a.blankState();a.importBackup(JSON.stringify(old));assert.ok(added.every(id=>a.S.off.includes(id)));
  a.importBackup(JSON.stringify({...old,catalogVersion:1,off:["leg_press"]}));
  assert.equal(a.S.off.includes("smith_squat"),false,"draft catalog activation survives");
  assert.ok(a.BASE_EX.filter(ex=>ex.catalogVersion===2).every(ex=>a.S.off.includes(ex.id)),"only newer additions start off");
});

function planner(items,state) {
  const a=data();Object.assign(a,{S:clean(state),EX:clean(items),ALL_EX:clean(items),EXBY:Object.fromEntries(items.map(ex=>[ex.id,ex])),RECOVER_H:48,LO:8,HI:12,STEP:2.5});
  const names=["plan","homePlan","lastTrained","hoursSince","bodyState","exStatus","isPainful","names","fmtH","firstWeekLevel","capPlanMinutes","extraItems","skippedToday","suggest","lastEntry","unit"];
  vm.runInContext(names.map(fnSource).join("\n"),a);return a;
}
test("disabled catalog expansion leaves original plan and suggested loads identical across realistic scenarios",()=>{
  const all=clean(data().BASE_EX),added=all.filter(ex=>ex.optional).map(ex=>ex.id);
  for(const slot of ["any","am","pm"])for(const energy of ["great","ok","tired"])for(const place of ["gym","home"]){
    for(const body of [{},{"m:chest":"sore"},{"j:knee":"pain"}]){
      const state={slot,energy,body,log:[],runs:[],off:[],today:{skip:[],add:[]},prefs:{place,minutes:45,rest:90}};
      const before=planner(original,state),after=planner(all,{...state,off:added});
      assert.deepEqual(clean(after.plan()),clean(before.plan()),slot+" "+energy+" "+place+" "+JSON.stringify(body));
      for(const ex of original)assert.deepEqual(clean(after.suggest(ex,energy==="tired")),clean(before.suggest(ex,energy==="tired")));
    }
  }
  const history={slot:"pm",energy:"tired",body:{},off:["plank"],today:{skip:["calf_raise"],add:[]},prefs:{place:"gym",minutes:60,rest:90},
    log:[{ts:Date.now()-10*864e5,day:"legs",entries:[{ex:"leg_press",sets:[{kg:60,reps:12},{kg:60,reps:12}]}]}],runs:[{ts:Date.now()-8*36e5,km:6}]};
  const before=planner(original,history),after=planner(all,{...history,off:history.off.concat(added)});
  assert.deepEqual(clean(after.plan()),clean(before.plan()));
  for(const ex of original)assert.deepEqual(clean(after.suggest(ex,true)),clean(before.suggest(ex,true)));
});

test("new primary muscles use existing soreness and painful joint exclusions",()=>{
  const all=clean(data().BASE_EX),off=all.filter(ex=>ex.optional&&ex.id!=="hip_adduction").map(ex=>ex.id);
  const state={slot:"pm",energy:"ok",body:{},off,today:{skip:[],add:[]},prefs:{place:"gym",rest:90},runs:[],
    log:[{ts:Date.now()-24*36e5,day:"legs",entries:[{ex:"hip_adduction",sets:[{kg:15,reps:10}]}]}]};
  const a=planner(all,state),result=a.plan();
  assert.ok(result.items.some(item=>item.e.id==="hip_adduction"));
  a.S.body={"m:adductors":"sore"};assert.equal(a.plan().items.some(item=>item.e.id==="hip_adduction"),false);
  a.S.body={"j:hip":"pain"};assert.equal(a.plan().items.some(item=>item.e.id==="hip_adduction"),false);
});

test("assisted stations log repetitions without treating assistance as resistance",()=>{
  const all=clean(data().BASE_EX),a=planner(all,{log:[],prefs:{},off:[],today:{skip:[],add:[]}});
  for(const id of ["assisted_dip","assisted_pullup"]){
    const ex=all.find(row=>row.id===id);assert.equal(ex.t,"reps");
    assert.equal(a.suggest(ex,false).kg,"");
    assert.equal(a.unit(ex),"");
  }
});

test("cardio remains available for scanning and guides but outside strength planning even after remembering",()=>{
  const a=stateApp();a.BASE_EX=clean(data().BASE_EX);a.S=a.blankState();a.S.custom=[];
  a.rebuildEx();
  const cardio=a.BASE_EX.filter(ex=>ex.catalogOnly);
  assert.equal(cardio.length,5);
  for(const ex of cardio){assert.ok(a.EXBY[ex.id]);assert.equal(a.EX.some(row=>row.id===ex.id),false);}
});

test("exact bilingual AI aliases resolve to catalog IDs before creating a custom exercise",()=>{
  const a=data();a.EX=a.BASE_EX;a.EXBY=Object.fromEntries(a.EX.map(ex=>[ex.id,ex]));a.S={custom:[]};
  vm.runInContext(["catalogMatch","cleanEn","validate"].map(fnSource).join("\n"),a);
  for(const [label,id] of [["TREADMILL","treadmill"],["exercise bike","stationary_bike"],["rowing machine","rower"],["cable crossover","cable_fly"]]){
    const r=a.validate({equipment:[{label_en:label,known:["invented"],confidence:.9}],new_exercises:[{name_th:label,name_en:label,day:"legs",muscles:["quads"],joints:["knee"]}]});
    assert.equal(r.fresh.length,0);assert.equal(r.equipment[0].ids[0],id);
  }
  assert.equal(a.catalogMatch("unknown treadmill accessory"),null);
});

test("plan, suggested loads and recovery functions retain their original source",()=>{
  const source=JSON.parse(readFileSync(new URL("./fixtures/catalog-algorithms.json",import.meta.url),"utf8"));
  for(const [name,body] of Object.entries(source))assert.equal(fnSource(name).replace(/\r\n/g,"\n"),body,name);
});

test("all five mobile filter choices are complete and deterministically categorize the catalog",()=>{
  const a=data();vm.runInContext(fnSource("machineFilterCategory"),a);
  const categories=new Set(a.BASE_EX.map(a.machineFilterCategory));
  assert.deepEqual([...categories].sort(),["cardio","free","lower","upper"]);
  assert.equal(a.machineFilterCategory(a.BASE_EX.find(ex=>ex.id==="db_curl")),"free");
  assert.equal(a.machineFilterCategory(a.BASE_EX.find(ex=>ex.id==="leg_press")),"lower");
});

test("category preference reads tolerate blocked storage, invalid JSON and non-object values",()=>{
  const a=load(["machineGroups"],{localStorage:{getItem:()=>{throw Error("blocked");}}});
  assert.deepEqual(clean(a.machineGroups()),{});
  for(const value of ["broken","[]","null","42"]){a.localStorage.getItem=()=>value;assert.deepEqual(clean(a.machineGroups()),{});}
});

test("Gemini sees all canonical IDs and must match catalog before proposing new exercises",()=>{
  const a=data();a.EX=a.BASE_EX;a.AI_LANG="Thai";vm.runInContext(fnSource("buildPrompt"),a);
  const prompt=a.buildPrompt();for(const ex of a.BASE_EX)assert.ok(prompt.includes(ex.id+": "));
  assert.match(prompt,/NO matching catalog id/);assert.ok(prompt.length+350<8000,"prompt plus language rule must fit Worker text limit");
});
