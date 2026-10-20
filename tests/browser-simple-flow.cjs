/* Optional browser acceptance suite. Requires Playwright and an installed browser.
 * PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/path/to/chrome node tests/browser-simple-flow.cjs
 * No dependency/build step is added to the PWA. Screenshots go to the OS temp directory.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const catalogCount = require('./catalog-data.cjs').length;
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/train-today/')) { res.writeHead(404).end(); return; }
  const relative = decodeURIComponent(url.pathname.slice('/train-today/'.length)) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' }); res.end(content);
  });
});
const image = { name: 'test.png', mimeType:'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNCkAAAAASUVORK5CYII=', 'base64') };
const screenshots = path.join(os.tmpdir(), 'kryvos-simple-flow');
fs.mkdirSync(screenshots, { recursive:true });
async function seed(context, language) {
  await context.addInitScript(lang => {
    if (!localStorage.getItem('train-today-v1')) {
      localStorage.setItem('kryvos-lang', lang);
      localStorage.setItem('train-today-v1', JSON.stringify({ log:[], onboarded:true, slot:'any', energy:'ok', prefs:{rest:90,place:'gym'} }));
      localStorage.setItem('kryvos-stats-off', '1');
    }
  }, language);
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width, label + ': ' + JSON.stringify(dimensions));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/train-today/`;
  const browser = await chromium.launch({ executablePath:process.env.BROWSER_PATH || undefined, headless:true });
  try {
    let combinations = 0;
    for (const width of (process.argv.includes('--flows-only') ? [] : [320,360,375,430])) for (const colorScheme of ['light','dark']) for (const language of ['th','en']) {
      const context = await browser.newContext({ viewport:{width,height:780}, colorScheme, reducedMotion:'reduce' });
      await seed(context, language);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      const start = page.locator('#start-workout');
      await start.waitFor({ state:'visible' });
      await start.scrollIntoViewIfNeeded();
      const startBox = await start.boundingBox();
      assert.ok(startBox.y >= 0 && startBox.y + startBox.height < 780, 'start remains reachable in the current brand layout');
      assert.equal(await page.locator('.simple-options').getAttribute('open'), null);
      await start.click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'plan');
      await page.locator('.simple-options summary').click();
      await page.locator('#energy [data-v="tired"]').click();
      await page.locator('#energy [data-v="ok"]').click();
      await page.locator('#cap-j').click();
      await page.locator('#joints [data-key="knee"]').click();
      assert.equal(await page.locator('#start-safety').isVisible(), true);
      await page.locator('#joints [data-key="knee"]').click();
      for (const tab of ['today','gym','run','food','history','settings']) {
        await page.locator(`[data-tab="${tab}"]`).click();
        await noOverflow(page, `${width}/${colorScheme}/${language}/${tab}`);
        if (tab === 'gym') {
          assert.equal(await page.locator('#machine-grid button').count(), catalogCount);
          assert.equal(await page.locator('#machine-camera').isVisible(), true);
          await page.locator('#machine-grid details > summary').first().click();
          const first = page.locator('#machine-grid button').first();
          await page.keyboard.press('Tab');
          await first.focus();
          const outline = await first.evaluate(el => getComputedStyle(el).outlineStyle);
          assert.notEqual(outline, 'none', 'keyboard focus visible');
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.sheet .guide[open]').count(), 1);
          await noOverflow(page, 'machine guide');
          await page.keyboard.press('Escape');
          assert.equal(await first.evaluate(el => el === document.activeElement), true);
          await page.locator('#gemini-option > summary').click();
          assert.equal(await page.locator('#scan-label').isVisible(), true);
          await page.locator('#gemini-option > summary').click();
        }
        if (tab === 'run' || tab === 'food') {
          await page.locator(`#v-${tab} > .secondary-options > summary`).click();
          await noOverflow(page, 'expanded secondary options');
        }
        const lastControl = page.locator(`#v-${tab} button:visible`).last();
        if (await lastControl.count()) {
          await lastControl.evaluate(el => el.scrollIntoView({block:'center'}));
          const controlBox = await lastControl.boundingBox(), navBox = await page.locator('nav.tabs').boundingBox();
          assert.ok(controlBox.y + controlBox.height <= navBox.y + 1, `${tab}: final control can scroll above bottom navigation`);
        }
      }
      await page.locator('[data-tab="today"]').click();
      const animation = await page.locator('#v-today').evaluate(el => getComputedStyle(el).animationName);
      assert.equal(animation, 'none', 'reduced motion');
      await page.screenshot({ path:path.join(screenshots, `today-${width}-${colorScheme}-${language}.png`), fullPage:false });
      await page.locator('[data-tab="gym"]').click();
      await page.screenshot({ path:path.join(screenshots, `gym-${width}-${colorScheme}-${language}.png`), fullPage:true });
      assert.deepEqual(errors, []);
      combinations++;
      console.log(`PASS ${width}px ${colorScheme} ${language}: six tabs, disclosures, safety, guide, keyboard, reduced motion, overflow`);
      await context.close();
    }
    const context = await browser.newContext({ viewport:{width:375,height:780}, reducedMotion:'reduce' });
    await seed(context, 'en');
    const page = await context.newPage(), uploads = [];
    page.on('request', req => { if (req.method() === 'POST') uploads.push(req.url()); });
    await page.goto(base);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.locator('[data-tab="gym"]').click();
    assert.equal(await page.locator('#machine-grid .machine-example').count(), 15);
    for (const group of await page.locator('#machine-grid details').all()) if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
    for (const photo of await page.locator('#machine-grid .machine-example').all()) {
      await photo.scrollIntoViewIfNeeded();
      await photo.evaluate(image => image.decode());
      assert.ok(await photo.evaluate(image => image.naturalWidth > 0));
    }
    await page.locator('#machine-photo-credits').click();
    assert.equal(await page.locator('.sheet .photo-credits li').count(), 15);
    await page.keyboard.press('Escape');
    console.log('PASS all 15 equipment cutout cards decoded and source/license credits remain accessible');
    await page.locator('#machine-input').setInputFiles(image);
    await page.locator('#machine-status').filter({ hasText:"Auto-recognition isn't ready yet" }).waitFor();
    assert.equal(await page.locator('#machine-grid button').count(), catalogCount);
    assert.equal(uploads.length, 0, 'local missing model must never upload');
    await page.locator('#machine-settings > summary').click();
    await page.locator('#machine-prepare').click();
    await page.locator('#machine-status').filter({ hasText:"Auto-recognition isn't ready yet" }).waitFor();
    await page.locator('#machine-input').setInputFiles({ name:'bad.png', mimeType:'image/png', buffer:Buffer.from('unreadable') });
    await page.locator('#machine-status').filter({ hasText:'Unable to read' }).waitFor();
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-tab="gym"]').click();
    assert.equal(await page.locator('#machine-grid button').count(), catalogCount);
    const offlinePhoto = page.locator('#machine-grid .machine-example').first();
    await offlinePhoto.scrollIntoViewIfNeeded();
    await offlinePhoto.evaluate(image => image.decode());
    await page.locator('#machine-input').setInputFiles(image);
    await page.locator('#machine-status').filter({ hasText:"Auto-recognition isn't ready yet" }).waitFor();
    await page.locator('[data-machine-pick="leg_press"]').click();
    await page.locator('[data-machine-save="leg_press"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#machine-grid [data-machine-pick="leg_press"]').evaluate(el => el === document.activeElement), true, 'saving redraws the grid; closing must focus its replacement card');
    await page.keyboard.press('Enter');
    await page.locator('[data-machine-rest="leg_press"]').click();
    if (await page.locator('[data-permission-continue]').count()) await page.locator('[data-permission-continue]').click();
    assert.match(await page.locator('#rest-lb').innerText(), /Leg press/i);
    await page.locator('#rest-plus').click(); await page.locator('#rest-minus').click(); await page.locator('#rest-skip').click();
    await page.reload();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('train-today-v1')));
    assert.deepEqual(stored.seen, ['leg_press']); assert.equal(stored.custom.length, 0); assert.equal(stored.log.length, 0);
    await page.locator('[data-tab="gym"]').click();
    await page.locator('#machine-grid [data-machine-pick="pec_deck"]').click();
    await page.locator('.sheet [data-machine-pick="rear_delt"]').click();
    await page.locator('.sheet [data-machine-save="rear_delt"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#machine-grid [data-machine-pick="pec_deck"]').evaluate(el => el === document.activeElement), true, 'nested guide and save return to original outside trigger');
    await context.setOffline(false);
    console.log('PASS missing model, prepare failure, unreadable photo, Pages prefix, PWA offline, manual memory/reload and correct rest timer; zero uploads');
    // Controlled recognition responses verify UX, not model accuracy.
    await page.reload();
    await page.locator('[data-tab="gym"]').click();
    await page.evaluate(() => { KryvosMachines.create = () => ({ recognizeMachine:async () => [
      {id:'chest_press',label:'Chest',confidence:.95}, {id:'leg_press',label:'Leg',confidence:.8}, {id:'lat_pulldown',label:'Lat',confidence:.7}, {id:'seated_row',label:'Row',confidence:.6}
    ] }); });
    await page.locator('#machine-input').setInputFiles(image);
    await page.locator('[data-machine-reject="chest_press"]').click();
    assert.equal(await page.locator('#machine-results [data-machine-confirm]').count(), 3);
    assert.equal(await page.locator('#machine-results [data-machine-confirm="chest_press"]').count(), 0);
    await page.locator('#machine-results [data-machine-confirm="lat_pulldown"]').click();
    assert.equal(await page.locator('[data-machine-rest="lat_pulldown"]').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('#machine-input').setInputFiles(image);
    await page.locator('#machine-results [data-machine-confirm="chest_press"]').click();
    assert.equal(await page.locator('[data-machine-rest="chest_press"]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#machine-results [data-machine-confirm="chest_press"]').evaluate(el => el === document.activeElement), true, 'recognition guide returns focus to its confirm button');
    console.log('PASS controlled high-confidence confirmation, rejection excludes answer, top-three selection and canonical guide/timer');
    await context.close();
    // Real remote adapter with controlled HTTP response and explicit native consent.
    const remoteContext = await browser.newContext({ viewport:{width:360,height:780}, reducedMotion:'reduce' });
    await seed(remoteContext, 'en');
    const remote = await remoteContext.newPage();
    await remote.goto(base);
    await remote.evaluate(() => { window.MACHINE_CONFIG = {...MACHINE_CONFIG, mode:'remote', endpoint:'https://recognize.example.test/machines'}; });
    await remote.locator('[data-tab="gym"]').click();
    let remoteCount = 0;
    await remote.route('https://recognize.example.test/machines', async route => {
      remoteCount++;
      assert.equal(route.request().headers()['content-type'], 'image/jpeg');
      assert.ok(route.request().postDataBuffer().length < 100000);
      await route.fulfill({ contentType:'application/json', body:JSON.stringify([{id:'leg_press', label:'Ignored', confidence:.9}]) });
    });
    remote.once('dialog', dialog => dialog.dismiss());
    await remote.locator('#machine-input').setInputFiles(image);
    assert.equal(remoteCount, 0);
    remote.once('dialog', dialog => dialog.accept());
    await remote.locator('#machine-input').setInputFiles(image);
    await remote.locator('[data-machine-confirm="leg_press"]').waitFor();
    assert.equal(remoteCount, 1);
    await remote.unroute('https://recognize.example.test/machines');
    await remote.route('https://recognize.example.test/machines', route => route.abort());
    remote.once('dialog', dialog => dialog.accept());
    await remote.locator('#machine-input').setInputFiles(image);
    await remote.locator('#machine-status').filter({hasText:"We can't check your photo right now"}).waitFor();
    assert.equal(await remote.locator('#machine-grid button').count(), catalogCount);
    // Load actual vendored libraries and verify their public API without a fake model.
    await remote.addScriptTag({url:base + 'vendor/tf-4.22.0.min.js'});
    await remote.addScriptTag({url:base + 'vendor/tm-image-0.8.5.min.js'});
    assert.deepEqual(await remote.evaluate(() => [tf.version.tfjs, typeof tmImage.CustomMobileNet]), ['4.22.0','function']);
    console.log('PASS remote consent/no consent, resized upload, network fallback, actual vendored runtime API load');
    await remoteContext.close();
    console.log(`Browser acceptance complete: ${combinations} layout combinations; screenshots: ${screenshots}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
