import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {load} from "./app.mjs";

const locale={};
vm.runInNewContext(readFileSync(new URL("../en.js",import.meta.url),"utf8"),locale);
function summary(body,language="th"){
  return load(["symptomSummary"],{S:{body},
    MUSCLES:{chest:language==="th"?"อก":"chest",shoulders:language==="th"?"ไหล่":"shoulders"},
    JOINTS:{knee:language==="th"?"เข่า":"knee"},t:key=>language==="en"?(locale.EN[key]??key):key
  }).symptomSummary();
}
test("symptom row: no soreness or pain in both languages",()=>{
  assert.deepEqual({...summary({})},{text:"ไม่มีอาการเมื่อย/เจ็บ",hasPain:false});
  assert.deepEqual({...summary({},"en")},{text:"No soreness or pain",hasPain:false});
});
test("symptom row: soreness uses existing muscle names, without pain styling",()=>{
  assert.deepEqual({...summary({"m:shoulders":"sore"})},{text:"เมื่อย: ไหล่",hasPain:false});
  assert.deepEqual({...summary({"m:shoulders":"sore"},"en")},{text:"Sore: shoulders",hasPain:false});
});
test("symptom row: painful joints trigger pain styling in both languages",()=>{
  assert.deepEqual({...summary({"j:knee":"pain"})},{text:"เจ็บ: เข่า",hasPain:true});
  assert.deepEqual({...summary({"j:knee":"pain"},"en")},{text:"Pain: knee",hasPain:true});
});
test("pain stays first when soreness is also present; formatting never mutates or adds symptom state",()=>{
  const body=Object.freeze({"m:chest":"sore","m:shoulders":"sore","j:knee":"pain","m:unknown":"pain","not-a-body-key":"pain"});
  const before=JSON.stringify(body);
  assert.deepEqual({...summary(body)},{text:"เจ็บ: เข่า · เมื่อย: อก, ไหล่",hasPain:true});
  assert.equal(JSON.stringify(body),before);
});
test("Edit opens original muscle choices, scrolls to the original check-in and focuses its first option",()=>{
  const first={focus:options=>{assert.equal(options.preventScroll,true);first.focused=true;}};
  const nodes={muscles:{hidden:true,querySelector:()=>first},"cap-m":{setAttribute:(key,value)=>{nodes["cap-m"][key]=value;}},ci:{scrollIntoView:options=>{nodes.ci.options=options;}}};
  const a=load(["editSymptoms"],{$:id=>nodes[id],window:{matchMedia:()=>({matches:true})}});
  a.editSymptoms();
  assert.equal(nodes.muscles.hidden,false);assert.equal(nodes["cap-m"]["aria-expanded"],"true");
  assert.equal(nodes.ci.options.behavior,"auto");assert.equal(first.focused,true);
});
