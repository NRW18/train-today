import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {load,html,fnSource} from "./app.mjs";

const english={};vm.runInNewContext(readFileSync(new URL("../en.js",import.meta.url),"utf8"),english);
const original={
  smith_squat:{day:"legs",m:["quads","glutes","hamstrings"],j:["hip","knee","ankle","lowback"],t:"kg"},
  cable_row:{day:"pull",m:["back","biceps"],j:["shoulder","elbow","lowback"],t:"kg"},
  hip_thrust_machine:{day:"legs",m:["glutes","hamstrings"],j:["hip","lowback"],t:"kg"},
  assisted_pullup:{day:"pull",m:["back","biceps"],j:["shoulder","elbow","wrist"],t:"reps"}
};
const plain=value=>JSON.parse(JSON.stringify(value));
function knowledge(language="th"){
  const scope=load([],{t:value=>language==="en"?english.EN[value]||value:value},["MUSCLES","JOINTS","DAYS","ORDER","EN_NAME","GUIDE"]);
  vm.runInContext(html.slice(html.indexOf("var BASE_EX = ["),html.indexOf("var EN_NAME = {")),scope);
  return scope;
}

test("TASKS 3 reuses each existing ID and keeps all four day/muscle/joint/unit records",()=>{
  const scope=knowledge(),ids=Array.from(scope.BASE_EX,ex=>ex.id);
  assert.equal(new Set(ids).size,ids.length,"no duplicate catalog IDs");
  for(const [id,expected] of Object.entries(original)){
    const rows=scope.BASE_EX.filter(ex=>ex.id===id);assert.equal(rows.length,1,id);
    const {day,m,j,t:unit}=rows[0];assert.deepEqual(plain({day,m,j,t:unit}),expected);
  }
  assert.equal(scope.EN_NAME.cable_row,"Seated cable row");
  assert.ok(scope.BASE_EX.some(ex=>ex.id==="seated_row"),"original machine-row history ID remains separate");
});

test("all four guides have complete Thai/English steps and mistakes; assisted pull-up describes moving the body",()=>{
  const thai=knowledge(),en=knowledge("en");
  for(const id of Object.keys(original)){
    assert.notEqual(thai.BASE_EX.find(ex=>ex.id===id).name,en.BASE_EX.find(ex=>ex.id===id).name);
    for(const field of ["how","miss"]){
      assert.equal(thai.GUIDE[id][field].length,field==="how"?3:2);
      for(const [index,text] of thai.GUIDE[id][field].entries()){
        assert.ok(english.EN[text],id+" "+text);assert.equal(en.GUIDE[id][field][index],english.EN[text]);
      }
    }
  }
  assert.equal(thai.GUIDE.assisted_pullup.miss.includes("ดึงด้ามลงด้านหลังคอ"),false);
  assert.ok(en.GUIDE.assisted_pullup.miss.some(text=>/controlling the lowering phase/.test(text)));
});

test("every declared painful joint excludes the matching existing exercise",()=>{
  const scope=knowledge();scope.S={body:{}};
  vm.runInContext(["bodyState","exStatus"].map(fnSource).join("\n"),scope);
  for(const id of Object.keys(original)){
    const ex=scope.BASE_EX.find(row=>row.id===id);
    scope.S.body={};assert.deepEqual(plain(scope.exStatus(ex)),{});
    for(const joint of ex.j){scope.S.body={["j:"+joint]:"pain"};assert.ok(scope.exStatus(ex).out?.includes(scope.JOINTS[joint]),id+" "+joint);}
  }
});

function stateApp(storage){
  const scope=knowledge();Object.assign(scope,{KEY:"train-today-v1",DRAFT_TTL:12*36e5,atob,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    checkLoadedThumbnails(){},toast(){},confirm:()=>true,renderAll(){},DATA_WORDS:{}});
  const functions=["blankState","load","save","snapshot","rebuildEx","cleanLog","okTs","cleanCustom","strList","cleanGuide","cleanEn","cleanPrefs","cleanProfile","cleanFood","cleanW","cleanRuns","gpsCoordinate","cleanRoute","cleanShoe","cleanShoeQ","cleanDraft","cleanScanThumbs","cleanThumbnail","dayKey","importBackup","dataList","draftTicked","lastEntry","lastTrained"];
  const extra=load([],{t:value=>value},["SHOE_BRANDS","RUN_TYPES","SHOE_USE"]);Object.assign(scope,extra);
  vm.runInContext(functions.map(fnSource).join("\n"),scope);scope.S=scope.blankState();return scope;
}

test("legacy history for the four IDs, original seated_row and hidden custom rows survives load/save/backup",async()=>{
  const storage=new Map(),start=Date.now()-10*864e5;
  const ids=Object.keys(original).concat("seated_row","c_old_cable_row");
  const log=ids.map((id,index)=>({ts:start+index*1000,day:original[id]?.day||"pull",entries:[{ex:id,sets:[{kg:20+index,reps:8},{kg:20+index,reps:9}]}]}));
  const old={log,off:["plank"],seen:ids,custom:[{id:"c_old_cable_row",name:"Old cable row",en:"Seated cable row",day:"pull",m:["back"],j:["shoulder","elbow"],t:"kg",ai:true,hidden:true}]};
  storage.set("train-today-v1",JSON.stringify(old));const app=stateApp(storage);app.load();
  assert.deepEqual(plain(app.S.log),log);assert.equal(app.S.custom.length,1);assert.equal(app.EXBY.c_old_cable_row.hidden,true);
  for(const id of ids){assert.ok(app.EXBY[id],id+" still resolves");assert.equal(app.lastEntry(id).sets[0].kg,20+ids.indexOf(id));}
  app.save();const reopened=stateApp(storage);reopened.load();assert.deepEqual(plain(reopened.S.log),log);
  for(const backup of [old,plain(reopened.snapshot())]){
    const restored=stateApp(new Map());await restored.importBackup(JSON.stringify(backup));
    assert.deepEqual(plain(restored.S.log),log);assert.equal(restored.S.custom.length,1);
    assert.equal(restored.EXBY.c_old_cable_row.hidden,true);for(const id of ids)assert.ok(restored.EXBY[id]);
    assert.equal(restored.S.off.includes("plank"),true);
  }
});
