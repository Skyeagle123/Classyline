// Execute only in credential-free CI. The application is never served remotely.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {SOURCE_SHA, SOURCE_TREE, COLORS, NUMBER} from './fixtures.mjs';
import {digest, staticServer, sandbox} from './isolation.mjs';

export async function qualify(application, output) {
  for (const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CLOUDFLARE_ACCOUNT_ID','D1_DATABASE_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])
    assert(!process.env[key], `Forbidden deployment credential/binding name: ${key}`);
  const git = (...args) => execFileSync('git',args,{cwd:application,encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),SOURCE_SHA);
  assert.equal(git('rev-parse','HEAD^{tree}'),SOURCE_TREE);
  assert.equal(git('status','--porcelain'),'', 'Application checkout must be clean');
  await mkdir(output,{recursive:true});
  const summary = {source_sha:SOURCE_SHA,source_tree:SOURCE_TREE,
    mode:'isolated synthetic browser qualification; not live checkout',
    planned_cases:21,tests:[],viewports:[],completed:false};
  const traffic = [], serverTraffic = [];
  const server = await staticServer(join(application,'dist'),serverTraffic);
  await writeFile(join(output,'artifact-inventory.json'),JSON.stringify(server.files,null,2));
  summary.artifact_inventory_sha256 = digest(JSON.stringify(server.files,null,2));
  summary.application_lock_sha256 = digest(await readFile(join(application,'package-lock.json')));
  let browser;
  async function check(name, action) {
    try { await action(); summary.tests.push({name,status:'PASS'}); }
    catch (error) { summary.tests.push({name,status:'FAIL',error:String(error.message)}); throw error; }
  }
  try {
    browser = await chromium.launch({headless:true,args:[
      '--disable-background-networking','--disable-component-update','--disable-domain-reliability',
    ]});
    summary.browser = {engine:'Chromium',version:browser.version()};
    for (const width of [360,768,1363]) {
      const network = [], s = await sandbox(browser,server.origin,width,network);
      const {page} = s;
      traffic.push({width,events:network});
      summary.viewports.push({width,height:900,isMobile:width===360,hasTouch:width===360});
      const screenshot = async name => {
        await page.screenshot({path:join(output,`${width}-${name}.png`),fullPage:true});
      };
      const overflow = async () => assert(await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
      const loaded = async () => {
        await page.getByRole('heading',{name:'Synthetic qualification shirt',exact:true}).waitFor({state:'visible'});
      };
      try {
        await check(`${width}: clean storage and interception before navigation`,async()=>{
          assert.deepEqual(await s.context.storageState(),{cookies:[],origins:[]});
          assert.equal(network[0].event,'interception-installed');
          await page.goto(server.origin,{waitUntil:'networkidle'});
          assert.equal(await page.evaluate(()=>innerWidth),width);
          await loaded(); await overflow(); await screenshot('home');
        });
        await check(`${width}: keyboard menu, categories, Escape and focus`,async()=>{
          const nav=page.getByRole('navigation',{name:'Collections',exact:true});
          const shop=nav.getByRole('button',{name:/^Shop/});
          await shop.focus(); await page.keyboard.press('Enter');
          assert.equal(await shop.getAttribute('aria-expanded'),'true');
          for (const name of ['Clothing','Accessories','Hats','Hair Accessories'])
            assert(await nav.getByRole('link',{name,exact:true}).isVisible());
          await overflow(); await screenshot('navigation');
          const panel=nav.locator('.shop-panel');
          await nav.getByRole('link',{name:'Hair Accessories',exact:true}).scrollIntoViewIfNeeded();
          assert(await panel.evaluate(el=>el.scrollHeight<=el.clientHeight || el.scrollTop>0),'Menu cannot scroll to nested accessories');
          // Bring the trigger back into view before the keyboard sequence.
          await shop.scrollIntoViewIfNeeded();await shop.focus();
          await page.keyboard.press('Tab');
          const focused=await page.evaluate(()=>({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));
          assert.equal(focused.tag,'A'); assert.notEqual(focused.outline,'none');
          await page.keyboard.press('Escape');
          assert.equal(await shop.getAttribute('aria-expanded'),'false');
          assert(await shop.evaluate(el=>el===document.activeElement));
          if(width===360) { await shop.tap(); assert.equal(await shop.getAttribute('aria-expanded'),'true'); await shop.tap(); }
          await shop.click();await nav.getByRole('link',{name:'Shop All →',exact:true}).click();
          await page.getByRole('heading',{name:'Shop All',exact:true}).waitFor();
          assert.equal(await shop.getAttribute('aria-expanded'),'false');
        });
        await check(`${width}: Shop tiles, New In, Sale, Accessories and refresh`,async()=>{
          await page.goto(server.origin+'/shop',{waitUntil:'networkidle'});
          for (const name of ['Clothing','Accessories'])
            assert(await page.getByRole('heading',{name,exact:true}).isVisible());
          assert.equal(await page.locator('.category-tile').count(),21);
          const tile=page.locator('.category-tile').filter({has:page.locator('img')}).first();
          await tile.scrollIntoViewIfNeeded();
          await page.waitForFunction(()=>Array.from(document.querySelectorAll('.category-tile img')).some(i=>i.complete&&i.naturalWidth>0));
          await overflow(); await screenshot('shop');
          for(const [slug,title] of [['new-in','Synthetic qualification shirt'],['sale','Synthetic qualification hat'],['accessories','Synthetic qualification hat'],['shop-all','Synthetic qualification shirt']]) {
            await page.goto(server.origin+'/category/'+slug,{waitUntil:'networkidle'});
            await page.getByRole('heading',{name:title,exact:true}).waitFor(); await overflow();
          }
          assert.equal(await page.locator('.product-card').count(),2);
          const image=page.getByAltText('Synthetic qualification shirt',{exact:true});
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction(()=>Array.from(document.images).some(i=>i.alt==='Synthetic qualification shirt'&&i.complete&&i.naturalWidth>0));
          await page.reload({waitUntil:'networkidle'}); await loaded();
        });
        await check(`${width}: 21 rendered swatches, neutral fallback and borders`,async()=>{
          await page.goto(server.origin+'/product/ISOLATED-SHIRT',{waitUntil:'networkidle'}); await loaded();
          const rgb=hex=>{const h=hex.slice(1);const full=h.length===3?[...h].map(c=>c+c).join(''):h;return `rgb(${[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)).join(', ')})`;};
          for(const [label,hex] of [...Object.entries(COLORS),['Eashed Blue','#b8a79a']]) {
            const b=page.getByRole('button',{name:'Color: '+label,exact:true});
            const style=await b.locator('.color-swatch').evaluate(el=>({color:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth}));
            assert.equal(style.color,rgb(hex),label);assert.notEqual(style.border,'0px',label);
          }
          await overflow(); await screenshot('product');
        });
        await check(`${width}: independent dimensions, unavailable variants and exact bag ID`,async()=>{
          const add=page.getByRole('button',{name:'Add to bag',exact:true});
          assert(!await add.isEnabled()); assert(!await page.getByRole('button',{name:'Size: M',exact:true}).isEnabled());
          assert(!await page.getByRole('button',{name:'Color: Unavailable Blue',exact:true}).isEnabled());
          const red=page.getByRole('button',{name:'Color: Red',exact:true});
          await red.click(); assert.equal(await red.getAttribute('aria-pressed'),'true');
          assert(!await page.getByRole('button',{name:'Size: L',exact:true}).isEnabled());
          assert(!await add.isEnabled());
          await page.getByRole('button',{name:'Size: M',exact:true}).click(); assert(await add.isEnabled());
          await page.getByRole('button',{name:'Color: Eashed Blue',exact:true}).click(); assert(!await add.isEnabled());
          await page.getByRole('button',{name:'Size: No Size',exact:true}).click(); assert(await add.isEnabled());
          await red.click(); assert(!await add.isEnabled());
          await page.getByRole('button',{name:'Size: Free Size',exact:true}).click(); assert(await add.isEnabled());
          await add.click(); await page.getByText('Added to your bag',{exact:true}).waitFor();
          const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('CL_CART_V4')));
          assert.equal(stored.lines.length,1);assert.equal(stored.lines[0].variant_id,'RED-FREE');
          assert.equal(stored.lines[0].qty,1);assert.equal(stored.attempt,null);
          await page.getByRole('button',{name:'Bag (1)',exact:true}).click();
          const dialog=page.getByRole('dialog');await dialog.waitFor({state:'visible'});
          await dialog
            .getByText('Free Size / Red · Qty 1', { exact: true })
            .waitFor({ state: 'visible', timeout: 10000 });
          await overflow(); await screenshot('cart');
        });
        await check(`${width}: WhatsApp/COD methods and public destination without submission`,async()=>{
          const dialog=page.getByRole('dialog'),method=dialog.getByLabel('Order method',{exact:true});
          assert.deepEqual(await method.locator('option').evaluateAll(els=>els.map(e=>e.value)),['cod','whatsapp']);
          await method.selectOption('whatsapp');assert.equal(await method.inputValue(),'whatsapp');
          await method.selectOption('cod');assert.equal(await method.inputValue(),'cod');
          await page.keyboard.press('Escape');assert(!await dialog.isVisible());
          const links=await page.locator('a[href^="https://wa.me/"]').evaluateAll(els=>els.map(e=>({href:e.href,rel:e.rel,target:e.target})));
          assert(links.length>=2);for(const l of links){assert.equal(l.href,'https://wa.me/'+NUMBER);assert.equal(l.target,'_blank');assert(l.rel.includes('noopener')&&l.rel.includes('noreferrer'));}
          s.model.whatsapp=false;
          await page.getByRole('button',{name:'Bag (1)',exact:true}).click();
          await page.waitForFunction(()=>document.querySelector('select option[value="whatsapp"]')===null);
          assert.deepEqual(await method.locator('option').evaluateAll(els=>els.map(e=>e.value)),['cod']);
          await page.keyboard.press('Escape');
          assert(!network.some(e=>e.event==='request'&&e.method!=='GET'),'UI emitted a mutating request');
        });
        await check(`${width}: blocked checkout/recovery/Admin/import/unknown/external probes`,async()=>{
          const probes=[
            ['/api/orders','POST'],['/api/orders/recover','POST'],['/api/admin/catalog/import','POST'],
            ['/api/admin/product-images','POST'],['/api/unknown','GET'],
            ['https://classyline2.pages.dev/api/catalog','GET'],
            ['https://0195c05f.classyline2.pages.dev/api/catalog','GET'],
          ];
          for(const [path,method] of probes){
            const url=new URL(path,server.origin).href;s.expectedBlocks.add(url);
            const rejected=await page.evaluate(async({url,method})=>{try{await fetch(url,{method,redirect:'error'});return false;}catch{return true;}},{url,method});
            assert(rejected);assert(network.some(e=>e.url===url&&e.action.startsWith('block-')));
          }
          assert(!serverTraffic.some(r=>r.path==='/api'||r.path.startsWith('/api/')),'API reached server');
          s.assertSafe();
        });
      } catch(error) {
        await screenshot('failure').catch(()=>{});
        throw error;
      } finally { await s.context.close(); }
    }
    summary.completed=true;
  } catch(error) {
    summary.error=String(error.message);
    throw error;
  } finally {
    await browser?.close(); await server.close();
    assert.equal(git('status','--porcelain'),'','Application source changed');
    summary.passed=summary.tests.filter(t=>t.status==='PASS').length;
    summary.failed=summary.tests.filter(t=>t.status==='FAIL').length;
    summary.total=summary.tests.length;
    summary.external_application_requests_forwarded=traffic.flatMap(t=>t.events).filter(e=>e.event==='request'&&e.action==='static'&&new URL(e.url).origin!==server.origin).length;
    summary.api_requests_reaching_static_server=serverTraffic.filter(r=>r.path==='/api'||r.path.startsWith('/api/')).length;
    await writeFile(join(output,'network.json'),JSON.stringify({traffic,serverTraffic},null,2));
    await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary,null,2));
  }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length,4,'Usage: qualify.mjs APPLICATION_DIRECTORY OUTPUT_DIRECTORY');
  qualify(resolve(process.argv[2]),resolve(process.argv[3])).catch(()=>{process.exitCode=1;});
}
