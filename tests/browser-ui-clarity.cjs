/* Focused UI acceptance and review screenshots. Uses an isolated synthetic profile.
 * Set PLAYWRIGHT_MODULE/BROWSER_PATH as in browser-simple-flow.cjs.
 * --before captures main (ab1ca8d) before this UI change. Default validates current UI.
 */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'), before=process.argv.includes('--before');
const screenshotsOnly=before || process.argv.includes('--screenshots-only');
const output=path.join(root,'docs/screenshots/ui-clarity');
fs.mkdirSync(output,{recursive:true});
const oldFiles=new Map();
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/train-today/')){res.writeHead(404).end();return;}
    const relative=decodeURIComponent(url.pathname.slice('/train-today/'.length)) || 'index.html';
    if(!path.resolve(root,relative).startsWith(root+path.sep)){res.writeHead(403).end();return;}
    let bytes;
    if(before){if(!oldFiles.has(relative))oldFiles.set(relative,execFileSync('git',['show','ab1ca8d:'+relative],{cwd:root,stdio:['ignore','pipe','ignore']}));bytes=oldFiles.get(relative);}
    else bytes=fs.readFileSync(path.join(root,relative));
    res.writeHead(200,{'Content-Type':mime[path.extname(relative)] || 'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  }catch(error){res.writeHead(404).end();}
});
async function capture(page,language,theme){
  for(const tab of ['today','gym']){
    await page.locator(`[data-tab="${tab}"]`).click();
    if(tab==='gym'){
      for(const photo of await page.locator('#machine-grid .machine-example').all())await photo.evaluate(image=>image.decode());
      await page.evaluate(()=>scrollTo(0,0));
    }
    await page.screenshot({path:path.join(output,`${before?'before':'after'}-${tab}-${language}-${theme}.png`)});
  }
}
async function targets(page){
  const small=await page.locator('button:visible,a:visible').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().height<43.9).map(el=>({tag:el.tagName,id:el.id,text:el.textContent.trim().slice(0,60),height:el.getBoundingClientRect().height})));
  assert.deepEqual(small,[],'visible button/link targets must be at least 44px high');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no sideways scrolling');
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/train-today/`;
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || undefined,headless:true});
  try{
    let count=0;
    for(const width of (screenshotsOnly?[375]:[320,360,375,430]))for(const theme of ['light','dark'])for(const language of ['th','en']){
      if(screenshotsOnly && !((theme==='light'&&language==='th')||(theme==='dark'&&language==='en')))continue;
      const context=await browser.newContext({viewport:{width,height:860},colorScheme:theme,reducedMotion:'reduce'});
      await context.addInitScript(language=>{
        localStorage.setItem('kryvos-lang',language);localStorage.setItem('kryvos-stats-off','1');
        localStorage.setItem('train-today-v1',JSON.stringify({log:[],onboarded:true,slot:'any',energy:'ok',prefs:{rest:90,place:'gym'}}));
      },language);
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);
      await page.locator('#start-workout').waitFor({state:'visible'});
      if(width===375&&((theme==='light'&&language==='th')||(theme==='dark'&&language==='en')))await capture(page,language,theme);
      if(!screenshotsOnly){
        await page.locator('[data-tab="gym"]').click();
        assert.equal(await page.locator('#machine-settings').evaluate(el=>el.open),false);
        assert.equal(await page.locator('#machine-privacy').isVisible(),false);
        assert.equal(await page.locator('#machine-prepare').isVisible(),false);
        assert.equal(await page.locator('section[aria-labelledby="machine-h"] > button.btn:not(.line)').count(),1);
        assert.ok(await page.locator('#machine-gallery').evaluate(el=>el.matches('.btn.line')));
        assert.equal(await page.locator('#machine-grid button').count(),15);
        assert.doesNotMatch(await page.locator('#machine-status').innerText(),/model|on-device|โมเดล|โหมดในเครื่อง/i);
        await targets(page);
        await page.locator('#machine-settings > summary').click();
        assert.equal(await page.locator('#machine-privacy').isVisible(),true);
        assert.equal(await page.locator('#machine-prepare').isVisible(),true);
        await targets(page);
        const colors=await page.locator('#machine-photo-credits').evaluate(el=>{
          const probe=document.createElement('span');probe.style.color='var(--blue)';document.body.appendChild(probe);
          const result=[getComputedStyle(el).color,getComputedStyle(probe).color];probe.remove();return result;
        });assert.equal(colors[0],colors[1],'ordinary links are blue');
        await page.locator('[data-tab="today"]').click();
        assert.equal(await page.locator('#start-workout').evaluate(el=>el.nextElementSibling.id),'symptom-summary');
        assert.match(await page.locator('#symptom-summary-text').innerText(),language==='th'?/ไม่มีอาการเมื่อย\/เจ็บ/:/No soreness or pain/);
        assert.equal(await page.locator('#symptom-summary').evaluate(el=>el.classList.contains('pain')),false);
        await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.lastEditScroll=options.behavior;return original.call(this,options);};});
        await page.locator('#symptom-edit').focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('#muscles button').first().evaluate(el=>el===document.activeElement),true);
        assert.notEqual(await page.locator('#muscles button').first().evaluate(el=>getComputedStyle(el).outlineStyle),'none');
        assert.equal(await page.evaluate(()=>window.lastEditScroll),'auto','reduced motion avoids animated scrolling');
        await page.locator('#muscles [data-key="shoulders"]').click();
        assert.match(await page.locator('#symptom-summary-text').innerText(),language==='th'?/เมื่อย: ไหล่/:/Sore: shoulders/i);
        await page.locator('#cap-j').click();await page.locator('#joints [data-key="knee"]').click();
        assert.match(await page.locator('#symptom-summary-text').innerText(),language==='th'?/^เจ็บ: เข่า/:/^Pain: knee/i);
        assert.equal(await page.locator('#symptom-summary').evaluate(el=>el.classList.contains('pain')),true);
        assert.equal(await page.locator('#start-safety').isVisible(),true);
        const painColors=await page.locator('#symptom-summary').evaluate(el=>{
          const probe=document.createElement('span');probe.style.backgroundColor='var(--red-bg)';probe.style.color='var(--red-ink)';document.body.appendChild(probe);
          const result=[getComputedStyle(el).backgroundColor,getComputedStyle(probe).backgroundColor,getComputedStyle(el).color,getComputedStyle(probe).color];probe.remove();return result;
        });assert.equal(painColors[0],painColors[1]);assert.equal(painColors[2],painColors[3]);
        await targets(page);
        const plus=page.locator('#quick-plus');assert.equal(await plus.getAttribute('aria-label'),language==='th'?'เพิ่มด่วน':'Quick add');
        assert.equal(await page.locator('#quick-plus-label').isVisible(),true);
        await plus.focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('.sheet .quick-actions button').count(),4);
        await page.keyboard.press('Escape');assert.equal(await plus.evaluate(el=>el===document.activeElement),true);
        assert.deepEqual(errors,[]);
      }
      count++;console.log(`PASS ${screenshotsOnly?'screenshots':'UI acceptance'} ${width}px ${theme} ${language}`);
      await context.close();
    }
    console.log(`Complete: ${count} combinations; screenshots: ${output}`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
