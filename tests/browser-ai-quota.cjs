/* Browser acceptance with isolated profiles and intercepted Gemini proxy responses.
 * Set PLAYWRIGHT_MODULE and BROWSER_PATH as in browser-simple-flow.cjs.
 * Proves cache/UI behavior, not Gemini accuracy or live latency. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/train-today/'))throw Error('path');
    const file=path.resolve(root,decodeURIComponent(url.pathname.slice('/train-today/'.length))||'index.html');
    if(!file.startsWith(root+path.sep))throw Error('path');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));
  } catch {res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
  try {
    for(const width of [320,360,375,430])for(const colorScheme of ['light','dark'])for(const language of ['th','en']){
      const context=await browser.newContext({viewport:{width,height:860},colorScheme,reducedMotion:'reduce'});
      await context.addInitScript(language=>{
        if(localStorage.getItem('train-today-v1'))return;
        localStorage.setItem('kryvos-lang',language);localStorage.setItem('kryvos-stats-off','1');
        localStorage.setItem('train-today-v1',JSON.stringify({onboarded:true,prefs:{goal:'keep',rest:90,place:'gym'},
          log:[{ts:Date.now()-864e5,day:'push',entries:[{ex:'chest_press',sets:[{kg:20,reps:10}]}]}]}));
      },language);
      const calls=[];
      await context.route('https://train-today-ai.nnrwachr.workers.dev/**',async route=>{
        const request=route.request();
        if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'}});return;}
        const body=request.postDataJSON();calls.push(body);
        assert.deepEqual(Object.keys(body).sort(),['parts','task']);
        const result=body.task==='week'?{summary_th:'Steady progress',tips_th:['Keep resting']}:
          {equipment:[{label_th:'Chest press',label_en:'Chest press',known:['chest_press'],confidence:.99}],new_exercises:[]};
        await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
          body:JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]})});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port+'/train-today/');
      await page.locator('#start-workout').waitFor();await page.locator('[data-tab="history"]').click();
      await page.locator('#week-ai').click();await page.locator('#week-out').filter({hasText:'Steady progress'}).waitFor();
      assert.equal(calls.length,1);assert.equal(calls[0].task,'week');
      const refresh=page.locator('#week-ai-refresh');assert.equal(await refresh.isVisible(),true);
      assert.ok((await refresh.boundingBox()).height>=44);
      await page.locator('#week-ai').click();assert.equal(calls.length,1,'same stats reuse summary');
      await refresh.click();await page.waitForFunction(()=>!document.querySelector('#week-ai').disabled);
      assert.equal(calls.length,2,'explicit refresh requests once');
      await page.reload();await page.locator('#start-workout').waitFor();await page.locator('[data-tab="history"]').click();
      await page.locator('#week-ai').click();assert.equal(calls.length,2,'cache survives reload');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('[data-tab="gym"]').click();
      const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;return canvas.toDataURL('image/jpeg');});
      const file={name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg.split(',')[1],'base64')};
      await page.locator('#scan-input').setInputFiles(file);
      await page.locator('.sheet .sh-name').filter({hasText:'Chest press'}).waitFor();
      const afterFirst=calls.length;assert.equal(calls[afterFirst-1].task,'scan');
      await page.keyboard.press('Escape');await page.locator('#scan-input').setInputFiles(file);
      await page.locator('.sheet .sh-name').filter({hasText:'Chest press'}).waitFor();
      assert.equal(calls.length,afterFirst,'same resized scan avoids another request');
      assert.deepEqual(errors,[]);await context.close();
      console.log(`PASS ${width}px ${colorScheme} ${language}: weekly cache/refresh/reload, scan reuse, overflow`);
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
