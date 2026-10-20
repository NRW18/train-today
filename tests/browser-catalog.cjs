/* Isolated catalog acceptance: no Gemini calls, real layout and original SVGs. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const catalog=require('./catalog-data.cjs'),root=path.resolve(__dirname,'..');
const out=path.join(root,'docs/screenshots/catalog');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/train-today/'))throw Error();
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice('/train-today/'.length))||'index.html');
  if(!file.startsWith(root+path.sep))throw Error();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));
}catch{res.writeHead(404).end();}});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
  try{
    let checkedAll=false;
    for(const width of [320,360,375,430])for(const theme of ['light','dark'])for(const language of ['th','en']){
      const context=await browser.newContext({viewport:{width,height:860},colorScheme:theme,reducedMotion:'reduce'});
      await context.addInitScript(language=>{if(!localStorage.getItem('train-today-v1')){
        localStorage.setItem('kryvos-lang',language);localStorage.setItem('kryvos-stats-off','1');
        localStorage.setItem('train-today-v1',JSON.stringify({onboarded:true,off:['plank'],log:[],custom:[],prefs:{place:'gym',rest:90}}));
      }},language);
      const page=await context.newPage(),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
      await page.goto('http://127.0.0.1:'+server.address().port+'/train-today/');
      await page.locator('#start-workout').waitFor();await page.locator('[data-tab="gym"]').click();
      assert.equal(await page.locator('#machine-grid [data-machine-pick]').count(),catalog.length);
      assert.ok(await page.locator('#machine-search').evaluate(el=>el.getBoundingClientRect().height>=44));
      const search=page.locator('#machine-search');await search.focus();
      assert.equal(await search.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'||getComputedStyle(el.closest('label')).boxShadow!=='none'),true,'search has a visible focus indicator');
      const capture=[320,375].includes(width)&&((theme==='light'&&language==='th')||(theme==='dark'&&language==='en'));
      if(capture){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`gym-${width}-${language}-${theme}.png`)});}
      for(const query of ['สมิธ','SMITH']){await search.fill(query);assert.equal(await page.locator('#machine-grid [data-machine-pick]').count(),2);assert.equal(await page.locator('#machine-grid [data-machine-pick]:visible').count(),2);}
      if(capture){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`search-${width}-${language}-${theme}.png`)});}
      await search.fill('this machine does not exist');assert.equal(await page.locator('#machine-grid [role="status"]').count(),1);
      assert.equal(await page.locator('#machine-camera').isDisabled(),false);
      await search.fill('');
      await page.locator('[data-machine-filter="cardio"]').click();
      assert.equal(await page.locator('#machine-grid [data-machine-pick]').count(),5);
      await page.locator('[data-machine-pick="treadmill"]').click();
      await page.locator('[data-machine-save="treadmill"]').click();await page.keyboard.press('Escape');
      assert.equal(await page.locator('#equip [data-ex="treadmill"]').count(),0);
      await page.locator('[data-machine-filter="free"]').click();
      assert.ok(await page.locator('#machine-grid [data-machine-pick="db_curl"]').count());
      await page.locator('[data-machine-filter="all"]').click();
      await search.fill('');const back=page.locator('[data-machine-group="back"]');
      await back.locator('summary').click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kryvos-machine-library-groups')||'{}').back===true);
      if(!checkedAll){
        for(const ex of catalog.filter(ex=>ex.optional)){
          await search.fill(ex.name);const card=page.locator(`[data-machine-pick="${ex.id}"]`);
          await card.click();assert.equal(await page.locator('.sheet .guide ol li').count(),3);assert.equal(await page.locator('.sheet .guide ul li').count(),2);
          assert.equal(await page.locator('.sheet .machine-art use').first().getAttribute('href'),'assets/machines.svg#'+ex.id);
          const photo=page.locator('.sheet > .machine-example');
          if(await photo.count()) {
            await photo.evaluate(el=>el.decode());
            assert.equal(await photo.isVisible(),true,ex.id+' photograph is visible');
            assert.equal(await photo.evaluate(el=>el.naturalWidth>0),true,ex.id+' photograph loads');
          } else {
            await page.waitForFunction(()=>document.querySelector('.sheet .machine-art use').getBBox().width>0);
            assert.equal(await page.locator('.sheet .machine-art use').first().evaluate(el=>{const box=el.getBBox();return box.width>0&&box.height>0&&box.x>=0&&box.y>=0&&box.x+box.width<=120&&box.y+box.height<=90;}),true,ex.id+' fallback renders inside its viewBox');
          }
          await page.keyboard.press('Escape');
        }checkedAll=true;
      }
      await search.fill('Smith machine squat');await page.locator('[data-machine-pick="smith_squat"]').click();
      await page.locator('[data-machine-save="smith_squat"]').click();await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-machine-pick="smith_squat"]').evaluate(el=>el===document.activeElement),true);
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('train-today-v1')));
      assert.equal(stored.off.includes('smith_squat'),false);assert.ok(stored.off.includes('plank'));
      assert.equal(stored.off.filter(id=>id!=='plank').length,catalog.filter(ex=>ex.optional).length-1);
      assert.equal(stored.catalogVersion,2);assert.equal(stored.custom.length,0);assert.equal(stored.log.length,0);
      await page.reload();await page.locator('#start-workout').waitFor();await page.locator('[data-tab="gym"]').click();
      assert.equal(await page.locator('[data-machine-group="back"]').evaluate(el=>el.open),true,'category choice persists, search did not overwrite it');
      await search.fill('smith');await page.locator('[data-machine-pick="smith_squat"]').click();assert.equal(await page.locator('[data-machine-save="smith_squat"]').count(),0);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(posts,[],'manual library needs no AI upload');assert.deepEqual(errors,[]);await context.close();
      console.log(`PASS ${width}px ${theme} ${language}: bilingual search, guides, saved groups/opt-in, no uploads or overflow`);
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
