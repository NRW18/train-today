/* PWA upgrade and live release verification. Uses synthetic browser profiles only.
 * Run with the same PLAYWRIGHT_MODULE/BROWSER_PATH as browser-simple-flow.cjs.
 * --live also checks the deployed site against this checkout without altering it.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
// GitHub Pages serves Git's LF text; Windows checkouts can use CRLF.
const hash = (file, bytes) => createHash('sha256').update(/\.(html|css|js|svg)$/.test(file) ? Buffer.from(bytes).toString('utf8').replace(/\r\n/g,'\n') : bytes).digest('hex');
const scope = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'machine-photos.js'), 'utf8'), scope);
const photoFiles = [...new Set(Object.values(scope.MACHINE_PHOTOS).map(photo => photo.src))];
const appFiles = ['assets/machines.svg','index.html','en.js','theme.css','simple-flow.css','machine-photos.js','machine-recognition.js','machines-config.js','sw.js',...photoFiles];
const version = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/var VERSION = "([^"]+)"/)[1];
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
let revision = null;
const oldFiles = new Map();
function bytesFor(relative) {
  if (!revision) return fs.readFileSync(path.join(root, relative));
  const key = revision + ':' + relative;
  if (!oldFiles.has(key)) oldFiles.set(key, execFileSync('git', ['show', key], {cwd:root,stdio:['ignore','pipe','ignore']}));
  return oldFiles.get(key);
}
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/train-today/')) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/train-today/'.length)) || 'index.html';
    if (!path.resolve(root, relative).startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const bytes = bytesFor(relative);
    res.writeHead(200, {'Content-Type':mime[path.extname(relative)] || 'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  } catch (error) { res.writeHead(404).end(); }
});
async function seed(context) {
  await context.addInitScript(() => {
    if (localStorage.getItem('train-today-v1')) return;
    const now = Date.now();
    localStorage.setItem('kryvos-lang', 'en');
    localStorage.setItem('kryvos-stats-off', '1');
    localStorage.setItem('train-today-v1', JSON.stringify({onboarded:true,
      log:[{ts:now-3*864e5,day:'push',entries:[{ex:'chest_press',sets:[{kg:20,reps:10}]}]}],
      custom:[{id:'c_upgrade',name:'Upgrade fixture',day:'pull',m:['back'],j:['elbow'],t:'kg',ai:true}],
      seen:['chest_press','c_upgrade'],off:['leg_curl'],food:[{ts:now,kcal:350,p:20,name:'Fixture meal'}],
      weights:[{ts:now,kg:70}],runs:[{ts:now-864e5,km:3,min:20,t:'easy'}],
      prefs:{rest:120,kcal:2500,protein:120,goal:'keep',place:'gym'},
      draft:{lat_pulldown:[{kg:25,reps:10,done:true,ed:true}]},draftTs:now,
      shoe:{name:'Fixture shoe',ts:now-864e5,base:50}}));
  });
}
async function waitVersion(page, expected) {
  await page.waitForFunction(async ({expected,release}) => {
    const keys = await caches.keys();
    const reg = await navigator.serviceWorker.getRegistration();
    if (!(keys.includes(expected) && reg && reg.active && reg.active.state === 'activated' && !reg.installing && !reg.waiting && navigator.serviceWorker.controller === reg.active)) return false;
    if (expected !== release) return true;
    return await new Promise(resolve => {
      const channel=new MessageChannel(), timer=setTimeout(()=>{channel.port1.close();resolve(false);},300);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data===expected);};
      navigator.serviceWorker.controller.postMessage({type:'KRYVOS_VERSION'},[channel.port2]);
    });
  }, {expected,release:version}, {timeout:30000});
}
async function exactAssets(page, base) {
  const expected = appFiles.map(file => [file, hash(file,fs.readFileSync(path.join(root,file)))]);
  const actual = await page.evaluate(async ({base,files}) => {
    const result = [];
    for (const file of files) {
      const response = await fetch(new URL(file,base));
      if (!response.ok) throw Error(file + ': HTTP ' + response.status);
      const bytes = /\.(html|css|js|svg)$/.test(file) ? new TextEncoder().encode((await response.text()).replace(/\r\n/g,'\n')) : await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      result.push([file, [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('')]);
    }
    return result;
  }, {base,files:appFiles});
  if (JSON.stringify(actual) !== JSON.stringify(expected)) console.log('Cache diagnostics:', await page.evaluate(async () => {
    const entries=[];
    for (const key of await caches.keys()) { const cache=await caches.open(key), en=await cache.match('en.js'); entries.push({key,enBytes:en?(await en.text()).length:0}); }
    return entries;
  }));
  assert.deepEqual(actual, expected, 'HTML/CSS/scripts/every cutout must match the released checkout byte-for-byte');
}
async function checkCards(page) {
  await page.locator('[data-tab="gym"]').click();
  for(const group of await page.locator('#machine-grid details').all())if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
  const photos = page.locator('#machine-grid .machine-example');
  assert.equal(await photos.count(), Object.keys(scope.MACHINE_PHOTOS).length);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded(); await photo.evaluate(image => image.decode());
    const info = await photo.evaluate(image => ({width:image.naturalWidth,height:image.naturalHeight,fit:getComputedStyle(image).objectFit,box:image.getBoundingClientRect().toJSON(),src:image.getAttribute('src')}));
    assert.ok(info.width > 0 && info.width <= 640 && info.height > 0 && info.height <= 640);
    assert.equal(info.fit, 'contain'); assert.equal(info.box.height, 144);
    assert.ok(info.box.width > 0 && info.box.width < 220);
    assert.ok(info.src.startsWith('assets/machines/cutouts/'), 'rendered image must belong to latest cutout set: ' + info.src);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#machine-photo-credits').click();
  assert.equal(await page.locator('.photo-credits li').count(), Object.keys(scope.MACHINE_PHOTOS).length);
  await page.keyboard.press('Escape');
  await page.locator('#machine-search').fill('Smith machine squat');
  await page.locator('[data-machine-pick="smith_squat"]').click();
  await page.locator('.sheet img.machine-example').evaluate(image=>image.decode());
  assert.equal(await page.locator('.sheet img.machine-example').isVisible(),true);
  assert.equal(await page.locator('.sheet .machine-art').isVisible(),false);
  await page.keyboard.press('Escape');
  await page.locator('#machine-search').fill('');
}
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/train-today/`;
  const browser = await chromium.launch({executablePath:process.env.BROWSER_PATH || undefined,headless:true});
  try {
    for (const old of (process.env.KRYVOS_UPGRADE_FROM ? [process.env.KRYVOS_UPGRADE_FROM] : ['8afaafd','8ca3290','1161af5','ab1ca8d'])) {
      revision = old;
      const context = await browser.newContext({viewport:{width:375,height:780},reducedMotion:'reduce'});
      await seed(context);
      let page = await context.newPage();
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      await page.goto(base);
      await page.evaluate(async () => {await navigator.serviceWorker.ready;});
      await page.reload();
      const oldVersion = execFileSync('git',['show',old+':sw.js'],{cwd:root,encoding:'utf8'}).match(/var VERSION = "([^"]+)"/)[1];
      await waitVersion(page,oldVersion);
      await page.evaluate(async () => {for (const file of ['en.js','theme.css']) await fetch(file);});
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('train-today-v1')));
      const priorScope={t:value=>value}, priorHtml=bytesFor('index.html').toString('utf8');
      vm.runInNewContext(priorHtml.slice(priorHtml.indexOf('var BASE_EX = ['),priorHtml.indexOf('var EN_NAME = {')),priorScope);
      const priorIds=Array.from(priorScope.BASE_EX,ex=>ex.id);
      revision = null;
      await page.evaluate(async () => {const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
      await waitVersion(page,version);
      // Reopening is the normal PWA update boundary; keep all localStorage intact.
      await page.close();
      page = await context.newPage();
      page.on('pageerror', error => failures.push(error.message));
      if (process.env.KRYVOS_UPGRADE_DEBUG) page.on('response', async response => {
        if (response.url().endsWith('/machine-photos.js')) console.log('Photo script response:', response.request().resourceType(), response.fromServiceWorker(), hash('machine-photos.js',await response.body()));
      });
      await page.goto(base);
      await exactAssets(page,base);
      await checkCards(page);
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('train-today-v1')));
      for (const field of ['log','custom','seen','food','weights','runs','prefs','shoe','draftTs']) assert.deepEqual(after[field],before[field],oldVersion+' preserves '+field);
      assert.deepEqual(after.off.filter(id=>priorIds.includes(id)),before.off.filter(id=>priorIds.includes(id)),oldVersion+' preserves enabled/disabled choices for the existing catalog');
      const latestScope={t:value=>value}, latestHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
      vm.runInNewContext(latestHtml.slice(latestHtml.indexOf('var BASE_EX = ['),latestHtml.indexOf('var EN_NAME = {')),latestScope);
      const added=Array.from(latestScope.BASE_EX).filter(ex=>ex.optional&&!priorIds.includes(ex.id));
      // Loading migrates in-memory defaults; localStorage is written on the next user save.
      for(const ex of added){
        const toggle=page.locator('#equip input[data-ex="'+ex.id+'"]');
        if(ex.catalogOnly)assert.equal(await toggle.count(),0,ex.id+' stays outside strength planning');
        else assert.equal(await toggle.isChecked(),false,ex.id+' stays disabled by default after upgrade');
      }
      // cleanDraft has always made absent flags explicit on reload. Compare their
      // boolean meaning while checking every exercise/set/load/repetition exactly.
      const normalizedDraft = draft => Object.fromEntries(Object.entries(draft).map(([id,sets]) => [id,sets.map(set=>({...set,done:!!set.done,ed:!!set.ed}))]));
      assert.deepEqual(normalizedDraft(after.draft),normalizedDraft(before.draft),oldVersion+' preserves every draft set');
      await context.setOffline(true);
      await page.reload();
      await checkCards(page);
      // sw.js itself is not an offline shell asset; verify all app assets offline.
      const cached = await page.evaluate(async files => Promise.all(files.filter(file=>file!=='sw.js').map(async file => [file,(await fetch(file)).ok])),appFiles);
      assert.ok(cached.every(entry=>entry[1]));
      assert.deepEqual(failures,[]);
      console.log(`PASS ${oldVersion} -> ${version}: exact latest HTML/CSS/scripts/all photo cutouts; ${Object.keys(scope.MACHINE_PHOTOS).length} photo cards; offline reopen; preserved training/food/body/run/shoe/draft data`);
      await context.close();
    }
    if (process.argv.includes('--live')) {
      revision = null;
      const liveBase = 'https://nrw18.github.io/train-today/';
      for (const colorScheme of ['light','dark']) {
        const context = await browser.newContext({viewport:{width:375,height:780},colorScheme,reducedMotion:'reduce'});
        await seed(context);
        const page = await context.newPage(), broken = [], errors = [];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('response',response=>{if(response.url().includes('/assets/machines/')&&!response.ok())broken.push(response.url()+':'+response.status());});
        await page.goto(liveBase);
        await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
        await page.reload();
        await waitVersion(page,version);
        await exactAssets(page,liveBase);
        await checkCards(page);
        await context.setOffline(true); await page.reload(); await checkCards(page);
        assert.deepEqual(broken,[]); assert.deepEqual(errors,[]);
        console.log(`PASS LIVE ${colorScheme}: latest release SHA-256 for HTML/CSS/scripts/all images, correct image sizes, no broken image responses, PWA offline`);
        await context.close();
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
