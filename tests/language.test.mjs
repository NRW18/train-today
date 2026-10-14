import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./app.mjs";

test("language preselection reuses saved preference before device detection", () => {
  for (const [saved, device, expected] of [[null,"th-TH","th"],[null,"en-US","en"],[null,"fr-FR","en"],["th","en-US","th"],["en","th-TH","en"],["bad","th-TH","th"]]) {
    const app=load(["detectLanguage"],{LANG_KEY:"kryvos-lang",navigator:{language:device},localStorage:{getItem:key=>{assert.equal(key,"kryvos-lang");return saved;}}});
    assert.equal(app.detectLanguage(),expected);
  }
});

test("choice persists in the existing language key and is used on the next app load", () => {
  const store=new Map([["train-today-v1","existing profile, backup and workout data"],["kryvos-stats-off","1"]]);
  let reloads=0;
  const app=load(["detectLanguage","saveLanguage","setLang"],{LANG_KEY:"kryvos-lang",navigator:{language:"en-US"},localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},location:{reload:()=>reloads++}});
  app.saveLanguage("th");assert.equal(app.detectLanguage(),"th");assert.equal(reloads,0);
  app.setLang("en");assert.equal(store.get("kryvos-lang"),"en");assert.equal(app.detectLanguage(),"en");assert.equal(reloads,1);
  app.saveLanguage("invalid");assert.equal(store.get("kryvos-lang"),"en");
  assert.equal(store.get("train-today-v1"),"existing profile, backup and workout data");assert.equal(store.get("kryvos-stats-off"),"1");
});

test("blocked language storage leaves device detection and existing reload behavior working", () => {
  let reloads=0;
  const app=load(["detectLanguage","saveLanguage","setLang"],{LANG_KEY:"kryvos-lang",navigator:{language:"th-TH"},localStorage:{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}},location:{reload:()=>reloads++}});
  assert.equal(app.detectLanguage(),"th");assert.doesNotThrow(()=>app.setLang("en"));assert.equal(reloads,1);
});
