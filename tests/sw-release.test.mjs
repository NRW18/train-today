import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {html} from "./app.mjs";

const source=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const version=source.match(/var VERSION = "([^"]+)"/)[1];
const base="https://example.test/train-today/";
function worker() {
  const events={},oldEntries=new Map([["en.js","old English"],["index.html","old HTML"]]);
  const currentEntries=new Map([["en.js","current English"],["index.html","current HTML"]]);
  let installed;
  const lookup=(entries,req,options={})=>{
    const url=new URL(typeof req==="string"?req:req.url,base);
    return entries.get(url.pathname.split("/").pop()+(options.ignoreSearch?"":url.search));
  };
  const context=vm.createContext({URL,Response,location:{origin:new URL(base).origin},
    Request:class extends Request {constructor(url,init){super(new URL(url,base),init);}},
    self:{addEventListener:(name,callback)=>{events[name]=callback;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    fetch:async()=>{throw Error("offline");},
    caches:{open:async key=>({match:async(req,options)=>lookup(key===version?currentEntries:oldEntries,req,options),
      addAll:async requests=>{installed=requests;},put:async()=>{}}),
      match:async req=>lookup(oldEntries,req),keys:async()=>["train-today-v57",version],delete:async()=>true}
  });
  vm.runInContext(source,context);
  async function request(file,mode="same-origin") {
    let response;
    events.fetch({request:{url:new URL(file,base).href,method:"GET",mode},respondWith:value=>{response=value;},waitUntil(){}});
    return await response;
  }
  return {events,context,request,get installed(){return installed;}};
}
test("current worker ignores an old cache recreated by an in-flight old request",async()=>{
  const w=worker();
  assert.equal(await w.request("en.js"),"current English");
  assert.equal(await w.request("en.js?v="+version.match(/v(\d+)$/)[1]),"current English","version-tagged scripts work offline with the canonical cached shell");
  assert.equal(await w.request("./","navigate"),"current HTML");
  w.context.fetch=async()=>"future English";
  assert.equal(await w.request("en.js?v=9999"),"future English","a future release tag must reach the network rather than use this worker's old shell");
});
test("shell installation refreshes HTTP cache without requiring optional model files",async()=>{
  const w=worker();let installed;
  w.events.install({waitUntil:promise=>{installed=promise;}});await installed;
  assert.ok(w.installed.length>15);
  assert.ok(w.installed.every(request=>request.cache==="reload"));
  assert.ok(w.installed.every(request=>!request.url.includes("/models/machines/")));
});
test("every page CSS/script release tag stays in step with the service worker",()=>{
  const release=version.match(/v(\d+)$/)[1];
  const files=[...html.matchAll(/(?:<script src|<link rel="stylesheet" href)="([^":]+)"/g)].map(match=>match[1]);
  assert.equal(files.length,7);
  for(const file of files) {
    assert.ok(file.endsWith("?v="+release),file+" must use the current release tag");
    assert.ok(source.includes(JSON.stringify(file.split("?")[0])),file+" must be cached");
  }
});
test("version probe reports only the worker's public version on the provided port",()=>{
  const w=worker();let reply;
  w.events.message({data:{type:"KRYVOS_VERSION"},ports:[{postMessage:value=>{reply=value;}}]});
  assert.equal(reply,version);
  assert.doesNotThrow(()=>w.events.message({data:null,ports:[]}));
});
