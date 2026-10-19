/* App-only equipment artwork, with synthetic saved scan photos; no real user data. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),before=process.argv.includes('--before');
const out=path.join(root,'docs/screenshots/app-only-machine-art');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/train-today\//,'')||'index.html';if(!path.resolve(root,rel).startsWith(root+path.sep))throw Error();const data=before&&rel==='index.html'?execFileSync('git',['show','4ab366a:index.html'],{cwd:root}):fs.readFileSync(path.join(root,rel));res.writeHead(200,{'Content-Type':mime[path.extname(rel)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});try{
const generator=await browser.newPage();const photo=await generator.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#888';ctx.fillRect(0,0,64,64);return c.toDataURL('image/jpeg');});await generator.close();
let count=0;for(const width of [320,360,375,430])for(const theme of ['light','dark'])for(const language of ['th','en']){
const context=await browser.newContext({viewport:{width,height:860},colorScheme:theme,reducedMotion:'reduce'});
await context.addInitScript(({language,photo})=>{if(!localStorage.getItem('train-today-v1')){localStorage.setItem('kryvos-lang',language);localStorage.setItem('kryvos-stats-off','1');localStorage.setItem('train-today-v1',JSON.stringify({log:[],onboarded:true,seen:['leg_press','chest_press'],scanThumbs:{leg_press:photo,chest_press:photo},prefs:{rest:90,place:'gym'}}));}},{language,photo});
// Simulate one missing app photo to prove SVG fallback instead of a stored scan.
await context.route('**/machine-photos.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+';delete MACHINE_PHOTOS.leg_press;'});});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/train-today/');await page.locator('#start-workout').waitFor();await page.locator('[data-tab="gym"]').click();
await page.locator('#machine-grid button').first().waitFor();
if(!before){assert.equal(await page.locator('#machine-grid [data-thumb-id],#equip [data-thumb-id]').count(),0);assert.equal(await page.locator('#machine-grid [data-machine-pick="leg_press"] use').getAttribute('href'),'assets/machines.svg#leg_press');assert.match(await page.locator('#machine-grid [data-machine-pick="chest_press"] img').getAttribute('src'),/^assets\/machines\/cutouts\//);
await page.locator('[data-machine-pick="leg_press"]').click();assert.equal(await page.locator('.sheet [data-thumb-id]').count(),0);assert.equal(await page.locator('.sheet use').last().getAttribute('href'),'assets/machines.svg#leg_press');await page.keyboard.press('Escape');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
if(width===320&&theme==='light'&&language==='en'){
await page.evaluate(()=>{window.KryvosMachines.create=()=>({recognizeMachine:async()=>[{id:'chest_press',label:'Chest press',confidence:0.99}]});});
await page.locator('#machine-input').setInputFiles({name:'scan.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo.split(',')[1],'base64')});
await page.locator('[data-machine-confirm="chest_press"]').waitFor();assert.match(await page.locator('#machine-results .machine-photo img').getAttribute('src'),/^blob:/);assert.match(await page.locator('#machine-results > .machine-example').getAttribute('src'),/^assets\/machines\/cutouts\//);assert.equal(await page.locator('#machine-results [data-thumb-id]').count(),0);
await page.locator('[data-machine-confirm="chest_press"]').click();assert.match(await page.locator('.sheet .machine-example').getAttribute('src'),/^assets\/machines\/cutouts\//);await page.keyboard.press('Escape');
}
await page.reload();await page.locator('#start-workout').waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('train-today-v1')).scanThumbs),{leg_press:photo,chest_press:photo});await page.locator('[data-tab="gym"]').click();}
if(language==='th'&&[320,375].includes(width)){for(const img of await page.locator('#machine-grid img').all())await img.evaluate(el=>el.decode());await page.screenshot({path:path.join(out,(before?'before':'after')+'-gym-'+width+'-'+theme+'.png'),fullPage:true});
for(const group of await page.locator('#equip [data-gym-group]').all()){if(await group.getAttribute('aria-expanded')==='false')await group.click();}
if(!before){for(const art of await page.locator('#equip .machine-example:visible,#equip .machine-art:visible').all()){const box=await art.boundingBox();assert.equal(box.width,48);assert.equal(box.height,48);}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await page.locator('#equip').screenshot({path:path.join(out,(before?'before':'after')+'-toggles-'+width+'-'+theme+'.png')});}
assert.deepEqual(errors,[]);await context.close();count++;console.log('PASS '+(before?'before capture ':'app-only art ')+width+' '+theme+' '+language);}
console.log('Complete: '+count+' combinations; synthetic thumbnails preserved across reload.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
