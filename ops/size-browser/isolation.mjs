import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, readdir, realpath, stat} from 'node:fs/promises';
import {resolve, join, extname, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {catalog, IMAGE} from './fixtures.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const images = new Set(['/__qualification__/shirt.svg', '/__qualification__/hat.svg']);
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2'};

export function decision(rawUrl, method, origin) {
  const u = new URL(rawUrl);
  if (u.origin !== origin || u.username || u.password) return 'block-external';
  if (method !== 'GET' && method !== 'HEAD') return 'block-mutation';
  if (u.pathname === '/api/catalog' && method === 'GET' && !u.search) return 'fixture-catalog';
  if (u.pathname === '/api' || u.pathname.startsWith('/api/')) return 'block-api';
  if (images.has(u.pathname) && !u.search) return 'fixture-image';
  if (u.search) return 'block-unknown';
  return 'static';
}

export async function inventory(directory) {
  const root = await realpath(directory), entries = [];
  async function walk(dir) {
    for (const item of await readdir(dir, {withFileTypes: true})) {
      const p = join(dir, item.name);
      assert(!item.isSymbolicLink(), 'Symlink in build inventory');
      if (item.isDirectory()) await walk(p);
      else {
        assert(item.isFile(), 'Non-file in build inventory');
        const bytes = await readFile(p);
        entries.push({path:p.slice(root.length + 1).split(sep).join('/'), bytes:bytes.length, sha256:digest(bytes)});
      }
    }
  }
  await walk(root);
  return entries.sort((a,b) => a.path.localeCompare(b.path));
}

// Static files only. No application server, Functions, DB binding or HTTP proxy.
export async function staticServer(directory, evidence) {
  const root = await realpath(directory), files = await inventory(root);
  const approved = new Map(files.map(f => [f.path, f]));
  assert(approved.has('index.html'), 'Missing built application');
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      evidence.push({method:req.method, path:u.pathname});
      if (!['GET','HEAD'].includes(req.method) || u.pathname === '/api' || u.pathname.startsWith('/api/')) {
        res.writeHead(403); res.end(); return;
      }
      const requested = decodeURIComponent(u.pathname).slice(1);
      // Existing files only; extensionless SPA paths use the exact built index.
      const name = approved.has(requested) ? requested : !extname(requested) ? 'index.html' : null;
      if (!name) { res.writeHead(404); res.end(); return; }
      const target = await realpath(resolve(root, name));
      assert(target.startsWith(root + sep), 'Static path escaped build');
      assert((await stat(target)).isFile());
      const bytes = await readFile(target);
      assert.equal(digest(bytes), approved.get(name).sha256, 'Build changed while serving');
      res.writeHead(200, {'Content-Type': types[extname(name)] || 'application/octet-stream', 'Cache-Control':'no-store'});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise((yes,no) => { server.once('error',no); server.listen(0,'127.0.0.1',yes); });
  return {origin:`http://127.0.0.1:${server.address().port}`, files,
    close: () => new Promise((yes,no) => { server.close(err => err ? no(err) : yes()); server.closeAllConnections(); })};
}

export async function sandbox(browser, origin, width, evidence, options = {}) {
  const context = await browser.newContext({
    viewport:{width,height:900}, storageState:{cookies:[],origins:[]},
    serviceWorkers:'block', acceptDownloads:false,
    isMobile:width === 360, hasTouch:width === 360,
  });
  const model = {whatsapp:options.whatsapp ?? true};
  let sequence = 0;
  const record = row => evidence.push({sequence:++sequence, ...row});
  const expectedBlocks = new Set();
  const unexpected = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = request.url(), method = request.method();
    const action = decision(url, method, origin);
    record({event:'request',url,method,action,expectedBlock:expectedBlocks.has(url)});
    if (action === 'fixture-catalog') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog(model.whatsapp))});
    if (action === 'fixture-image') return route.fulfill({status:200,contentType:'image/svg+xml',body:IMAGE});
    if (action === 'static') return route.continue(); // Loopback static-only server.
    if (!expectedBlocks.has(url)) unexpected.push({url,method,action});
    return route.abort('blockedbyclient');
  });
  // Close sockets before a connection can be opened, even after a UI regression.
  await context.routeWebSocket('**/*', socket => {
    record({event:'blocked-websocket',url:socket.url()});
    unexpected.push({url:socket.url(),action:'websocket'}); socket.close();
  });
  record({event:'interception-installed'});
  const responses = [];
  context.on('response', response => responses.push(response.url()));
  const page = await context.newPage();
  record({event:'page-created'});
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return {context,page,model,responses,errors,unexpected,expectedBlocks,
    assertSafe() {
      assert.deepEqual(unexpected, [], 'Unexpected application request blocked');
      assert.deepEqual(errors, [], 'Browser application error');
      assert(responses.every(url => new URL(url).origin === origin), 'External HTTP response');
      assert.equal(evidence[0].event, 'interception-installed');
      const firstRequest = evidence.findIndex(row => row.event === 'request');
      assert(firstRequest < 0 || firstRequest > evidence.findIndex(row => row.event === 'page-created'));
    },
  };
}
