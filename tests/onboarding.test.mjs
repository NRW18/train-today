import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

test("schedule gate rejects fractional or out-of-range days with a clear validation message", () => {
  const app=load(["valid","validationMessage"],{draft:{days:3,minutes:45}});
  for(const days of [2.5,3.1,5.9,1,7,null,NaN]) {
    app.draft.days=days;
    assert.equal(app.valid("schedule"),false,`must block proceeding with ${days} days`);
    assert.equal(app.validationMessage("schedule"),"จำนวนวันต้องเป็นจำนวนเต็ม 2–6 วันต่อสัปดาห์");
  }
  app.draft.days=3;assert.equal(app.valid("schedule"),true);assert.equal(app.validationMessage("schedule"),"");
  app.draft.minutes=35;assert.equal(app.valid("schedule"),false);
});

test("every accepted integer day count survives preference save/reload without being dropped", () => {
  const app=load(["valid","cleanPrefs"],{draft:{days:3,minutes:45}});
  for(const days of [2,3,4,5,6]) for(const minutes of [30,45,60,90]) {
    app.draft.days=days;app.draft.minutes=minutes;
    assert.equal(app.valid("schedule"),true);
    const saved=JSON.stringify({prefs:app.cleanPrefs({days,minutes})});
    const reloaded=app.cleanPrefs(JSON.parse(saved).prefs);
    assert.equal(reloaded.days,days);assert.equal(reloaded.minutes,minutes);
  }
});

test("profile setup goal mappings preserve running focus separately", () => {
  const a = load(["setupGoal"]);
  for (const [choice, goal, runFocus] of [["lose","lose",false],["gain","gain",false],["keep","keep",false],["run","keep",true]]) assert.deepEqual({...a.setupGoal(choice)},{goal,runFocus});
});
test("cleaners retain new setup fields and reject corrupt fields while old data keeps the same defaults", () => {
  const a = load(["cleanPrefs","cleanProfile"]);
  assert.deepEqual({...a.cleanPrefs({})},{rest:90,kcal:2800,protein:null,goalKg:null,goal:"gain"});
  const p = a.cleanPrefs({level:0,place:"home",days:2,minutes:30,focus:["arms","arms","core","bad"],runFocus:true});
  assert.deepEqual(JSON.parse(JSON.stringify(p.focus)),["arms","core"]);
  for(const key of ["level","place","days","minutes","runFocus"]) assert.equal(p[key],{level:0,place:"home",days:2,minutes:30,runFocus:true}[key]);
  const bad = a.cleanPrefs({level:8,place:"bad",days:9,minutes:5,runFocus:"yes"});
  assert.equal(bad.level,undefined); assert.equal(bad.minutes,undefined);
  assert.equal(a.cleanProfile({sex:"u",age:28,h:174,act:1.2}).sex,"u");
  assert.equal(a.cleanProfile({age:999,h:20,act:999}).age,null);
});
test("unspecified sex averages the male/female energy formulas", () => {
  const a = load(["energyPlan"],{},["GOAL_KCAL","PROTEIN_PER_KG"]);
  const pf = {age:28,h:174,act:1.55};
  const base = 10*70+6.25*174-5*28;
  assert.equal(a.energyPlan({...pf,sex:"u"},70,"keep").bmr,Math.round(base+(5-161)/2));
  assert.equal(a.energyPlan({...pf,sex:"u"},70,"keep").kcal,Math.round((base-78)*1.55/10)*10);
});
test("home/gym round trips preserve manually disabled machines and bodyweight exercises", () => {
  const exercises=[{id:"machine",t:"kg"},{id:"manual",t:"kg"},{id:"pushup",t:"reps"},{id:"plank",t:"sec"}];
  const a = load(["placeOff","setTrainingPlace","cleanPrefs"],{S:{prefs:{place:"gym"},off:["manual","plank"]},EX:exercises});
  a.setTrainingPlace("home");
  assert.deepEqual([...a.S.off],["manual","plank","machine"]);
  assert.deepEqual([...a.S.prefs.homeAutoOff],["machine"]);
  a.S.prefs = a.cleanPrefs(JSON.parse(JSON.stringify(a.S.prefs))); // reload/backup round trip
  a.setTrainingPlace("home"); // repeated selection must retain original ownership
  a.setTrainingPlace("gym");
  assert.deepEqual([...a.S.off],["manual","plank"]);
  a.setTrainingPlace("home");a.setTrainingPlace("both");
  assert.deepEqual([...a.S.off],["manual","plank"]);
  assert.equal(exercises.length,4);
});
test("legacy home backups without ownership never accidentally enable disabled equipment", () => {
  const a=load(["placeOff","setTrainingPlace"],{S:{prefs:{place:"home"},off:["machine","plank"]},EX:[{id:"machine",t:"kg"},{id:"plank",t:"sec"}]});
  a.setTrainingPlace("gym");assert.deepEqual([...a.S.off],["machine","plank"]);
});
test("explicit manual choice overrides temporary home ownership and invalid metadata is cleaned", () => {
  const a=load(["placeOff","setTrainingPlace","cleanPrefs"],{S:{prefs:{place:"home",homeAutoOff:[]},off:["machine"]},EX:[{id:"machine",t:"kg"}]});
  a.setTrainingPlace("gym");assert.deepEqual([...a.S.off],["machine"]);
  assert.deepEqual([...a.cleanPrefs({homeAutoOff:["machine",null,"machine",12]}).homeAutoOff],["machine"]);
});
test("body diagram highlights exactly the selected regions on the appropriate views", () => {
  const a=load(["setupBody"],{esc:String});
  const html=a.setupBody(["chest","back"]);
  assert.equal((html.match(/data-body-region="chest" class="body-region on"/g)||[]).length,1);
  assert.equal((html.match(/data-body-region="back" class="body-region on"/g)||[]).length,1);
  assert.equal((html.match(/data-body-region="legs" class="body-region on"/g)||[]).length,0);
  assert.equal((a.setupBody(["whole"]).match(/class="body-region on"/g)||[]).length,7);
});
test("session cap fits estimated sets, rests and warm-up inside selected minutes", () => {
  const a = load(["capPlanMinutes"]), items=Array.from({length:8},()=>({sets:3}));
  assert.equal(a.capPlanMinutes(items,30,90).length,3);
  assert.equal(a.capPlanMinutes(items,60,90).length,8);
  assert.equal(a.capPlanMinutes(items,undefined,90).length,8);
});
test("focus changes priority only and first-week experience expires after seven days", () => {
  const a = load(["focusRank","firstWeekLevel"],{S:{prefs:{focus:["core"],level:0},log:[]}});
  assert.equal(a.focusRank({m:["core"]}),1); assert.equal(a.focusRank({m:["chest"]}),0);
  assert.equal(a.firstWeekLevel(),0);a.S.log=[{ts:Date.now()-8*864e5}];assert.equal(a.firstWeekLevel(),null);
});
test("new-user experience gives safe manual weights and level-specific starting reps", () => {
  const a=load(["suggest","lastEntry","unit"],{S:{log:[],prefs:{level:0}},HI:12,LO:8,STEP:2.5});
  assert.equal(a.suggest({id:"press",t:"kg"},false).kg,"");
  assert.equal(a.suggest({id:"press",t:"kg"},false).reps,8);
  assert.equal(a.suggest({id:"pushup",t:"reps"},false).reps,3);
  a.S.prefs.level=3;assert.equal(a.suggest({id:"plank",t:"sec"},false).reps,40);
  a.S.log=[{ts:Date.now()-8*864e5,entries:[]}];assert.equal(a.suggest({id:"plank",t:"sec"},false).reps,30);
});

test("home plan uses bodyweight, checks recovery and preserves painful-muscle exclusions", () => {
  const exercises=[{id:"press",t:"kg",day:"push",m:["chest"]},{id:"pushup",t:"reps",day:"push",m:["chest"]},{id:"plank",t:"sec",day:"pull",m:["core"]}];
  const a=load(["homePlan","capPlanMinutes"],{S:{prefs:{minutes:30,rest:90},off:["press"],energy:"ok",today:{skip:[]}},EX:exercises,RECOVER_H:48,lastTrained:()=>({}),hoursSince:()=>1,exStatus:()=>({}),isPainful:e=>e.id==="plank",firstWeekLevel:()=>0,suggest:()=>({reps:3}),skippedToday:()=>[],extraItems:()=>[]});
  const p=a.homePlan();assert.equal(p.rest,false);assert.equal(p.items.length,1);assert.equal(p.items[0].e.id,"pushup");assert.equal(p.items[0].sets,2);
  a.lastTrained=()=>({chest:Date.now()});assert.equal(a.homePlan().rest,true);
});
