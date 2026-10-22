// Real Chrome rendering in isolated profiles. No production writes or user storage.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./catalog-data.cjs'),english={};
vm.runInNewContext(fs.readFileSync(path.join(root,'en.js'),'utf8'),english);
const targets=['smith_squat','cable_row','hip_thrust_machine','assisted_pullup'].map(id=>catalog.find(ex=>ex.id===id));
const older=[...targets,catalog.find(ex=>ex.id==='seated_row')];
const history=older.map((ex,index)=>({ts:Date.now()-10*864e5+index*1000,day:ex.day,entries:[{ex:ex.id,sets:[{kg:20+index,reps:8},{kg:20+index,reps:9}]}]}));
history.push({ts:Date.now()-9*864e5,day:'pull',entries:[{ex:'c_old_row',sets:[{kg:17.5,reps:10}]}]});
const seed={onboarded:true,log:history,off:['plank'],seen:older.map(ex=>ex.id),prefs:{place:'gym',rest:90},custom:[{id:'c_old_row',name:'Legacy custom row',en:'Seated cable row',day:'pull',m:['back'],j:['shoulder'],t:'kg',ai:true,hidden:true}]};
const out=path.join(root,'docs/screenshots/task3-exercises');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/train-today/'))throw Error('path');
 const file=path.resolve(root,decodeURIComponent(url.pathname.slice('/train-today/'.length))||'index.html');
 if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));
}catch{res.writeHead(404).end();}});
function noOverflow(page,label){return page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth).then(fits=>assert.equal(fits,true,label));}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
 try{for(const width of [320,360,375,430])for(const theme of ['light','dark'])for(const language of ['th','en']){
  const context=await browser.newContext({viewport:{width,height:860},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*workers.dev/**',route=>route.abort());
  await context.addInitScript(({language,seed})=>{if(!localStorage.getItem('train-today-v1')){
   localStorage.setItem('kryvos-lang',language);localStorage.setItem('kryvos-stats-off','1');localStorage.setItem('train-today-v1',JSON.stringify(seed));
  }},{language,seed});
  const page=await context.newPage(),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.method()==='POST')posts.push(req.url());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/train-today/');await page.locator('#start-workout').waitFor();
  await page.locator('[data-tab="gym"]').click();
  for(const ex of targets){
   await page.locator('#machine-search').fill(ex.name);
   const card=page.locator(`[data-machine-pick="${ex.id}"]`);assert.equal(await card.count(),1,ex.id+' has no duplicate card');await card.click();
   assert.equal(await page.locator('.sheet #sh-h').innerText(),language==='th'?ex.name:english.EN[ex.name]);
   assert.equal(await page.locator('.sheet .guide ol li').count(),3);assert.equal(await page.locator('.sheet .guide ul li').count(),2);
   const sheetFits=await page.locator('.sheet').evaluate(el=>{
    const box=el.getBoundingClientRect();if(el.scrollWidth>el.clientWidth+1)return false;
    return [...el.querySelectorAll('.guide li')].every(item=>{const range=document.createRange();range.selectNodeContents(item);return [...range.getClientRects()].every(rect=>rect.left>=box.left-1&&rect.right<=box.right+1);});
   });assert.equal(sheetFits,true,ex.id+' text stays inside guide');await noOverflow(page,ex.id+' '+width);
   if(ex.id==='assisted_pullup'){
    const mistakes=await page.locator('.sheet .guide ul').innerText();assert.doesNotMatch(mistakes,/ดึงด้ามลงด้านหลังคอ|Pulling behind the neck/);
    assert.match(mistakes,language==='th'?/ปล่อยตัวลงเร็วแทนการคุมจังหวะลง/:/controlling the lowering phase/);
    if(width===320&&theme==='light'&&language==='th'||width===430&&theme==='dark'&&language==='en'){
     fs.mkdirSync(out,{recursive:true});await page.locator('.sheet .guide').screenshot({path:path.join(out,`assisted-pullup-${width}-${language}-${theme}.png`)});
    }
   }
   await page.keyboard.press('Escape');
  }
  await page.locator('[data-tab="history"]').click();
  let sessions=await page.locator('#sessions').innerText();
  for(const ex of older)assert.ok(sessions.includes(language==='th'?ex.name:english.EN[ex.name]),ex.id+' history name resolves');
  assert.ok(sessions.includes('Legacy custom row'),'hidden custom history remains visible');
  await page.reload();await page.locator('[data-tab="history"]').click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('train-today-v1')).log),history,'legacy sets, weights and IDs survive reload');
  sessions=await page.locator('#sessions').innerText();for(const ex of targets)assert.ok(sessions.includes(language==='th'?ex.name:english.EN[ex.name]));
  await noOverflow(page,'history '+width);assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log(`PASS ${width}px ${theme} ${language}: all 4 guides, text bounds, no overflow, legacy history/reload, no POST`);await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
