// Synthetic contexts and intercepted worker calls only. Never contacts production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/screenshots/machine-requests');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});try{
 for(const width of [320,360,375,430])for(const theme of ['light','dark'])for(const lang of ['th','en']){
  const context=await browser.newContext({viewport:{width,height:860},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
  const posts=[],errors=[];let fail=false;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='train-today-ai.nnrwachr.workers.dev'){
    if(url.pathname==='/'&&req.method()==='POST'){
     const scan={equipment:[{label_th:'Treadmill',label_en:'treadmill',known:['treadmill'],confidence:.9}],new_exercises:[{name_th:'Test pendulum machine',name_en:'Pendulum squat machine',day:'legs',muscles:['quads'],joints:['knee']}]};
     return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'https://nrw18.github.io'},json:{candidates:[{content:{parts:[{text:JSON.stringify(scan)}]}}]}});
    }
    if(req.method()==='POST')posts.push({path:url.pathname,body:req.postData(),headers:req.headers()});
    return route.fulfill({status:fail&&url.pathname==='/machine-request'?503:204,headers:{'Access-Control-Allow-Origin':'https://nrw18.github.io','Access-Control-Allow-Headers':'Content-Type, X-Stats-Id'}});
   }
   if(url.hostname!=='nrw18.github.io')return route.abort();
   const rel=decodeURIComponent(url.pathname.replace(/^\/train-today\//,''))||'index.html',file=path.resolve(root,rel);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404});
   let body=fs.readFileSync(file);
   if(rel==='stats.html')body=Buffer.from(body.toString().replace('name:"treadmill",count:12','name:"'+ 'a'.repeat(60)+'",count:12'));
   return route.fulfill({status:200,body,contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  await context.addInitScript(lang=>{if(!localStorage.getItem('train-today-v1')){
   localStorage.setItem('kryvos-lang',lang);localStorage.setItem('kryvos-stats-off','1');
   localStorage.setItem('train-today-v1',JSON.stringify({onboarded:true,log:[],custom:[],prefs:{place:'gym',rest:90}}));
  }},lang);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://nrw18.github.io/train-today/');await page.locator('#start-workout').waitFor();
  await page.locator('[data-tab="gym"]').click();await page.locator('#machine-search').fill('treadmill');
  const requestButton=page.locator('#machine-grid [data-photo-request]');assert.equal(await requestButton.count(),1);
  assert.ok(await requestButton.evaluate(el=>el.getBoundingClientRect().height>=44));
  assert.equal(posts.filter(p=>p.path==='/machine-request').length,0);
  await requestButton.click();assert.equal(posts.filter(p=>p.path==='/machine-request').length,0,'consent off: no request');
  assert.match(await page.locator('#toast').innerText(),lang==='en'?/anonymous stats/:/สถิติ/);
  await page.locator('[data-tab="settings"]').click();await page.locator('#stats-on').check();
  await page.locator('[data-tab="gym"]').click();
  await page.keyboard.press('Tab');await requestButton.focus();assert.notEqual(await requestButton.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await Promise.all([page.waitForResponse(res=>res.url().endsWith('/machine-request')&&res.request().method()==='POST'),page.keyboard.press('Enter')]);
  await page.waitForFunction(()=>/Photo requested|ส่งคำขอรูปแล้ว/.test(document.querySelector('#machine-grid [data-photo-request]').textContent));
  const requests=posts.filter(p=>p.path==='/machine-request');assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].body),{name:'treadmill'});
  assert.match(requests[0].headers['x-stats-id'],/^[A-Za-z0-9-]{8,40}$/);
  await page.reload();await page.locator('[data-tab="gym"]').click();await page.locator('#machine-search').fill('treadmill');
  assert.equal(await page.locator('#machine-grid [data-photo-request]').isDisabled(),true,'dedupe survives reload');
  await page.locator('#machine-search').fill('leg press machine');assert.equal(await page.locator('#machine-grid [data-photo-request]').count(),0,'existing photo has no request');
  await page.locator('#machine-search').fill('hack squat machine');fail=true;await page.locator('#machine-grid [data-photo-request]').click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('failed')||document.querySelector('#toast').textContent.includes('ไม่สำเร็จ'));
  assert.equal(await page.locator('#machine-grid [data-photo-request]').isDisabled(),false);fail=false;
  if([320,375].includes(width)&&((lang==='th'&&theme==='light')||(lang==='en'&&theme==='dark'))){
   await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));
   await page.locator('#machine-search').fill('smith');await page.screenshot({path:path.join(out,`cards-${width}-${lang}-${theme}.png`)});
   await page.locator('[data-machine-pick="smith_squat"]').click();await page.screenshot({path:path.join(out,`guide-${width}-${lang}-${theme}.png`)});await page.keyboard.press('Escape');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===430&&theme==='dark'&&lang==='en'){
   await page.locator('#scan-input').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNCkAAAAASUVORK5CYII=','base64')});
   const fresh=page.locator('.sheet [data-photo-request="pendulum squat machine"]');await fresh.waitFor();
   await Promise.all([page.waitForResponse(res=>res.url().endsWith('/machine-request')&&res.request().method()==='POST'),fresh.click()]);
   await page.waitForFunction(()=>document.querySelector('[data-photo-request="pendulum squat machine"]').disabled);
   assert.deepEqual(JSON.parse(posts.filter(p=>p.path==='/machine-request').at(-1).body),{name:'pendulum squat machine'});
   await page.keyboard.press('Escape');
  }
  const stats=await context.newPage();stats.on('pageerror',e=>errors.push(e.message));await stats.goto('https://nrw18.github.io/train-today/stats.html?demo');
  await stats.locator('#machine-requests td').first().waitFor();assert.equal(await stats.locator('#machine-requests tbody tr').count(),2);
  assert.equal(await stats.locator('#machine-requests-title').innerText(),lang==='en'?'Requested machine photos':'เครื่องที่ถูกขอรูป');
  await stats.locator('#machine-requests-title').scrollIntoViewIfNeeded();assert.equal(await stats.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'60-character name wraps');
  if(width===375&&((lang==='th'&&theme==='light')||(lang==='en'&&theme==='dark')))await stats.screenshot({path:path.join(out,`stats-${lang}-${theme}.png`)});
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS requests ${width}px ${theme} ${lang}: consent, exact payload, dedupe/reload, retry, focus, stats and overflow`);
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
