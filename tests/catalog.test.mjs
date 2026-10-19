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

test("explicitly enabled new primary muscles participate in recovery and painful hip exclusions",()=>{
  const all=clean(data().BASE_EX),off=all.filter(ex=>ex.optional&&ex.id!=="hip_adduction").map(ex=>ex.id);
  const state={slot:"pm",energy:"ok",body:{},off,today:{skip:[],add:[]},prefs:{place:"gym",rest:90},runs:[],
    log:[{ts:Date.now()-24*36e5,day:"legs",entries:[{ex:"hip_adduction",sets:[{kg:15,reps:10}]}]}]};
  const a=planner(all,state),result=a.plan();
  assert.equal(result.items.find(item=>item.e.id==="hip_adduction").sets,2);
  assert.ok(result.why.join(" ").includes(a.MUSCLES.adductors));
  a.S.body={"j:hip":"pain"};assert.equal(a.plan().items.some(item=>item.e.id==="hip_adduction"),false);
});

test("assisted stations keep support kilograms manual rather than increasing them as resistance",()=>{
  const all=clean(data().BASE_EX),a=planner(all,{log:[],prefs:{},off:[],today:{skip:[],add:[]}});
  for(const id of ["assisted_dip","assisted_pullup"]){
    const ex=all.find(row=>row.id===id);assert.equal(ex.assisted,true);
    assert.equal(a.suggest(ex,false).kg,"");
    a.S.log=[{ts:Date.now(),entries:[{ex:id,sets:[{kg:20,reps:12},{kg:20,reps:12}]}]}];
    assert.equal(a.suggest(ex,false).kg,20);assert.equal(a.suggest(ex,true).kg,20);
    assert.ok(a.unit(ex).includes("แรงช่วย"));a.S.log=[];
  }
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
