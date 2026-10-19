// Opt-in live evaluation, never part of tests/*.test.mjs. No image/key files written.
// Google REST fields: https://ai.google.dev/api/generate-content?hl=en
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import vm from "node:vm";
import "../ai-config.js";
import {load, html} from "./app.mjs";

const policy=globalThis.KryvosAI;
const mime={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"};
const help=`Usage: node tests/ai-eval.mjs <image-folder> [--task scan|food] [--lang th|en] [--limit N] [--model ID]
Requires GEMINI_KEY in the environment; never pass a key as an argument.
Default: scan, Thai, first 5 JPEG/PNG/WebP files in sorted order (2 calls/file).
Sends images to Google. Use consented, pre-resized 1024px/JPEG .82 fixtures for app comparisons.
Old: JSON + temperature .2, no cap/thinking/media override. New: current shared policy.
Same image bytes and real app prompt for both; no cache. Does not test 768px compression.
Reports recognized names/IDs, usageMetadata, model version, finish reason, and total request time.
No accuracy percentage without human reference labels; repeat runs to assess variance.`;

function options(args) {
  if(args.includes("--help"))return null;
  const folder=args[0];
  if(!folder || folder.startsWith("--"))throw Error("Provide an image folder; use --help.");
  const parsed={folder,task:"scan",language:"th",limit:5};
  for(let i=1;i<args.length;i+=2){
    const name={"--task":"task","--lang":"language","--limit":"limit","--model":"model"}[args[i]];
    if(!name || !args[i+1])throw Error("Invalid option; use --help.");
    parsed[name]=args[i+1];
  }
  parsed.limit=Number(parsed.limit);
  if(!["scan","food"].includes(parsed.task) || !["th","en"].includes(parsed.language) ||
    !Number.isInteger(parsed.limit) || parsed.limit<1 || parsed.limit>100 ||
    parsed.model && !policy.models(parsed.task).includes(parsed.model))throw Error("Invalid task/language/limit/model; use --help.");
  return parsed;
}

function appPrompt(task, language, englishSource) {
  const translations={};
  vm.runInNewContext(englishSource,translations);
  const a=load(["buildPrompt","foodPrompt","withLang"],{
    AI_LANG:language==="th"?"Thai":"English",
    t:value=>language==="en"?translations.EN[value]||value:value,
    EX:[]
  },["MUSCLES","JOINTS","LANG_RULE"]);
  // Evaluate only the app's canonical exercise declarations, not app startup or user storage.
  const start=html.indexOf("var BASE_EX = ["),end=html.indexOf("// English names",start);
  vm.runInContext(html.slice(start,end),a);a.EX=a.BASE_EX;
  return a.withLang([{text:task==="scan"?a.buildPrompt():a.foodPrompt()}])[0].text;
}

function printable(value,key) {
  const clean=String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g," ");
  return key?clean.split(key).join("[redacted]"):clean;
}
function count(value){return Number.isInteger(value)&&value>=0?value:null;}

async function request(parts,task,variant,key,model,fetchImpl) {
  const started=performance.now();
  const models=model?[model]:policy.models("scan"); // Scan/food preserve the baseline model order.
  for(let i=0;i<models.length;i++){
    const selected=models[i];
    const generationConfig=variant==="old"?{responseMimeType:"application/json",temperature:.2}:policy.config(task,selected);
    let response,body;
    try {
      response=await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/"+selected+":generateContent",{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({contents:[{parts}],generationConfig}),signal:AbortSignal.timeout(120000)
      });
      if(response.status===404 && i+1<models.length)continue;
      try {body=await response.json();} catch {return {variant,model:selected,status:"response_json",names:"",input:null,output:null,thinking:null,total:null,ms:Math.round(performance.now()-started)};}
    } catch {return {variant,model:selected,status:"network/timeout",names:"",input:null,output:null,thinking:null,total:null,ms:Math.round(performance.now()-started)};}
    if(i+1<models.length && (response.status===404 || variant==="new" && policy.unsupportedConfig(response.status,body)))continue;
    const candidate=body && Array.isArray(body.candidates)?body.candidates[0]:null;
    const finish=candidate?.finishReason || "unknown",usage=body?.usageMetadata;
    let names="",status=response.ok?finish:"HTTP "+response.status;
    if(response.ok && finish==="STOP"){
      const text=(Array.isArray(candidate?.content?.parts)?candidate.content.parts:[])
        .filter(part=>part?.thought!==true && typeof part?.text==="string").map(part=>part.text).join("").trim();
      try {
        const result=JSON.parse(text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,"$1"));
        const labels=task==="scan"?
          (Array.isArray(result.equipment)?result.equipment:[]).map(item=>[item?.label_th||item?.label_en,Array.isArray(item?.known)?item.known.join(","):""].filter(Boolean).join(" / "))
            .concat((Array.isArray(result.new_exercises)?result.new_exercises:[]).map(item=>item?.name_th||item?.name_en)):
          (Array.isArray(result.items)?result.items:[]).map(item=>item?.name_th);
        names=labels.filter(label=>typeof label==="string" && label).join("; ");
        if(task==="scan"?!Array.isArray(result.equipment)||!Array.isArray(result.new_exercises):!Array.isArray(result.items))status="invalid shape";
      } catch {status="invalid JSON";}
    }
    return {variant,model:printable(body?.modelVersion||selected,key),status:printable(status,key),
      names:printable(names,key),input:count(usage?.promptTokenCount),output:count(usage?.candidatesTokenCount),
      thinking:count(usage?.thoughtsTokenCount),total:count(usage?.totalTokenCount),ms:Math.round(performance.now()-started)};
  }
}

export async function evaluateFolder({folder,task="scan",language="th",limit=5,model,key,fetchImpl=fetch}) {
  if(typeof key!=="string" || !key.trim())throw Error("Set GEMINI_KEY in the environment; do not put it in a command or file.");
  if(!["scan","food"].includes(task)||!["th","en"].includes(language)||!Number.isInteger(limit)||limit<1||limit>100||model&&!policy.models(task).includes(model))throw Error("Invalid evaluation options.");
  const englishSource=await readFile(new URL("../en.js",import.meta.url),"utf8");
  const prompt=appPrompt(task,language,englishSource);
  const files=(await readdir(folder,{withFileTypes:true})).filter(entry=>entry.isFile()&&mime[path.extname(entry.name).toLowerCase()])
    .map(entry=>entry.name).sort().slice(0,limit);
  if(!files.length)throw Error("No supported images found.");
  const rows=[];
  for(const [index,file] of files.entries()){
    const bytes=await readFile(path.join(folder,file));
    if(!bytes.length || bytes.length>10*1024*1024)throw Error("Image is empty or exceeds the 10 MB evaluation limit.");
    const parts=[{text:prompt},{inline_data:{mime_type:mime[path.extname(file).toLowerCase()],data:bytes.toString("base64")}}];
    // Alternate pair order to reduce systematic warm-up bias. Both still use identical inputs.
    const pair=[];
    for(const variant of index%2?["new","old"]:["old","new"])pair.push({file:printable(file,key),...await request(parts,task,variant,key,model,fetchImpl)});
    rows.push(...pair.sort((a,b)=>a.variant==="old"?-1:1));
  }
  return rows;
}

export async function main(args=process.argv.slice(2),env=process.env) {
  let parsed;
  try {parsed=options(args);}catch(error){console.error(error.message);return 1;}
  if(!parsed){console.log(help);return 0;}
  let rows;
  try {rows=await evaluateFolder({...parsed,key:env.GEMINI_KEY});}
  catch {console.error("Evaluation could not run. Check GEMINI_KEY, options, folder and image sizes; use --help. No key/error body printed.");return 1;}
  console.log("Paired live evaluation; same input bytes. Missing usage fields are null, not estimated. Results need human reference review.");
  console.table(rows);
  if(rows.length<10)console.log("Fewer than five image pairs: insufficient for the five-photo quality gate.");
  return rows.some(row=>row.status!=="STOP")?1:0;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)process.exitCode=await main();
