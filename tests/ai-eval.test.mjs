// Offline tests for the opt-in evaluator. No Google calls or real photos/keys.
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {evaluateFolder} from "./ai-eval.mjs";

async function fixtures(run) {
  const folder=await mkdtemp(path.join(os.tmpdir(),"kryvos-ai-eval-"));
  try {
    for(let i=0;i<5;i++)await writeFile(path.join(folder,i+".jpg"),"synthetic bytes "+i);
    return await run(folder);
  } finally {
    assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith("kryvos-ai-eval-"));
    await rm(folder,{recursive:true,force:true});
  }
}

test("eval pairs five images with actual app prompts, old/new config, reported usage and elapsed time",()=>fixtures(async folder=>{
  const calls=[];
  const rows=await evaluateFolder({folder,key:"test-only-not-a-real-key",fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    assert.equal(options.headers["x-goog-api-key"],"test-only-not-a-real-key");
    return new Response(JSON.stringify({modelVersion:"gemini-3-flash-preview",usageMetadata:{promptTokenCount:111,candidatesTokenCount:22,totalTokenCount:133},
      candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({equipment:[{label_th:"Press",known:["chest_press"]}],new_exercises:[]})}]}}]}));
  }});
  assert.equal(rows.length,10);assert.equal(calls.length,10);
  for(let i=0;i<10;i+=2){
    assert.deepEqual(calls[i].contents,calls[i+1].contents,"same bytes/prompt in both variants");
    assert.deepEqual(rows.slice(i,i+2).map(row=>row.variant),["old","new"]);
    assert.equal(calls[i+(i/2%2?1:0)].generationConfig.maxOutputTokens,undefined);
    assert.equal(calls[i+(i/2%2?0:1)].generationConfig.maxOutputTokens,2000);
  }
  assert.match(calls[0].contents[0].parts[0].text,/Known exercises.*chest_press/s);
  assert.ok(rows.every(row=>row.names==="Press / chest_press"&&row.total===133&&row.input===111&&row.output===22&&row.thinking===null&&row.ms>=0));
}));

test("eval handles food, truncation and network/HTTP errors without exposing secrets or inventing usage",()=>fixtures(async folder=>{
  const key="eval-secret-sentinel";
  const rows=await evaluateFolder({folder,key,limit:1,task:"food",language:"en",fetchImpl:async(_,options)=>{
    const body=JSON.parse(options.body);assert.match(body.contents[0].parts[0].text,/Estimate the food.*LANGUAGE:.*English/s);
    if(!body.generationConfig.maxOutputTokens)return new Response(JSON.stringify({candidates:[{finishReason:"MAX_TOKENS"}]}));
    assert.equal(body.generationConfig.maxOutputTokens,1000);
    return new Response(JSON.stringify({error:{message:key}}),{status:403});
  }});
  assert.equal(rows[0].status,"MAX_TOKENS");assert.equal(rows[1].status,"HTTP 403");
  assert.equal(rows[0].total,null);assert.ok(!JSON.stringify(rows).includes(key));
  const network=await evaluateFolder({folder,key,limit:1,fetchImpl:async()=>{throw Error(key);}});
  assert.ok(network.every(row=>row.status==="network/timeout"&&row.total===null));assert.ok(!JSON.stringify(network).includes(key));
  await assert.rejects(evaluateFolder({folder,key:""}),/GEMINI_KEY/);
}));
