// Real R2 checkpoint + committed workflow preflight + real Pages transport.
// Atomic storage is a loopback model, not evidence of hosted R2 behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RELEASE, ROOT, prepare, multipart, verifyPlan, DirectUpload, AttemptJournal,
  requestOnce, deploymentIdentity} from './pages-direct-upload.mjs';
import {CHECKPOINT, R2Checkpoint, requestR2Once} from './pages-r2-checkpoint.mjs';
import {pinnedHash} from './pages-release-artifacts.mjs';
import {preflightFactory} from './fixtures/pages-workflow-preflight.mjs';

const blake3 = pinnedHash(resolve(process.env.CLASSYLINE_TEST_APPLICATION ?? process.cwd()));
const CONTROL = 'cc3f1207b2ac5a2739f7b6a96af18600e2d1e988';
const BASELINE = '5824179f-af77-4a18-9a23-ab22019e8ccc';
const BASELINE_SHA = '393ff88e76dcca226de7f83e148554699e85ca01';
const CREATED = '12345678-0000-4000-8000-000000000001';
const credentials = {accessKeyId: 'a'.repeat(32), secretAccessKey: 'b'.repeat(64)};
const etag = bytes => '"' + createHash('md5').update(bytes).digest('hex') + '"';
function deployment(id, sha) {
  return {id, project_id: RELEASE.projectID, project_name: RELEASE.project, environment: 'production',
    deployment_trigger: {metadata: {branch: 'main', commit_hash: sha, commit_dirty: false}},
    latest_stage: {name: 'deploy', status: 'success'}, is_skipped: false, uses_functions: id === CREATED,
    compatibility_date: RELEASE.date, compatibility_flags: [], url: `https://${id.slice(0,8)}.classyline2.pages.dev`,
    d1_databases: {DB: {id: RELEASE.database}}, r2_buckets: {PRODUCT_IMAGES: {name: RELEASE.bucket}}};
}
function config(db, bucket) {
  return {compatibility_date: RELEASE.date, compatibility_flags: [], usage_model: 'standard',
    d1_databases: {DB: {id: db}}, r2_buckets: {PRODUCT_IMAGES: {name: bucket}},
    env_vars: {ADMIN_PASSWORD_HASH: {type: 'secret_text'}, ADMIN_PASSWORD_SALT: {type: 'secret_text'}}};
}
function project(observed = false) {
  return {id: RELEASE.projectID, name: RELEASE.project, production_branch: 'main',
    source: {type: 'github', config: {owner: 'Skyeagle123', repo_name: 'Classyline', production_deployments_enabled: false}},
    canonical_deployment: deployment(observed ? CREATED : BASELINE, observed ? RELEASE.sha : BASELINE_SHA),
    deployment_configs: {production: config(RELEASE.database, RELEASE.bucket),
      preview: config('ce1d28f3-f20b-485d-9799-619a7fc52ade', 'classyline-storefront-preview-images')}};
}
async function plan() {
  return prepare({identity: {...RELEASE}, blake3, bundle: multipart([
    {name: 'metadata', type: 'application/json', bytes: Buffer.from('{"main_module":"entry.js"}')},
    {name: 'entry.js', type: 'application/javascript+module', file: true, bytes: Buffer.from('export default {fetch(){return new Response("offline")}}')}
  ]).body, routing: Buffer.from(JSON.stringify({baseURL: '/', routes: [
    {routePath: '/api/:path*', mountPath: '/api', method: '', module: ['api/[[path]].js:onRequest']}]})),
  files: [{path: 'index.html', bytes: Buffer.from('offline')},
    {path: '_routes.json', bytes: Buffer.from('{"version":1,"include":["/api/*"],"exclude":[]}')}]});
}
async function serverFor(scenario, p) {
  const calls = [], sockets = new Set(); let object = scenario === 'existing' ? Buffer.from('consumed') : null, observed = false;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks), path = req.url.replace(/^\/client\/v4/, '');
    calls.push({method: req.method, path});
    if (path === CHECKPOINT.path) {
      if (req.method === 'PUT') {
        assert.equal(req.headers['if-none-match'], '*');
        assert.equal(req.headers.host, CHECKPOINT.hostname);
        if (scenario === 'denied') {res.writeHead(403); res.end(); return;}
        if (object) {res.writeHead(412); res.end(); return;}
        // Model the documented atomic conditional commit, with no await between
        // existence check and assignment. Real R2 must be qualified separately.
        object = Buffer.from(body);
        if (scenario === 'lost-ack-reset') {req.socket.destroy(); return;}
        if (scenario === 'lost-ack-timeout') return;
        res.writeHead(200, {etag: etag(object)}); res.end(); return;
      }
      assert.equal(req.method, 'GET');
      res.writeHead(200, {etag: etag(object)});
      res.end(scenario === 'bad-readback' ? Buffer.from('different') : object); return;
    }
    const reply = value => {res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({success: true, result: value}));};
    if (path === '/repos/Skyeagle123/Classyline/git/ref/heads/main') {
      res.writeHead(200); res.end(JSON.stringify({object: {sha: CONTROL}}));
    } else if (req.method === 'GET' && path === ROOT) {
      const value = project(observed);
      if (scenario === 'preflight-drift') value.deployment_configs.production.d1_databases.DB.id = 'wrong';
      reply(value);
    } else if (path === ROOT + '/deployments/' + BASELINE) reply(deployment(BASELINE, BASELINE_SHA));
    else if (path === ROOT + '/deployments/' + CREATED) reply(deployment(CREATED, RELEASE.sha));
    else if (req.method === 'GET' && path.startsWith(ROOT + '/deployments')) {
      res.writeHead(200); res.end(JSON.stringify({success: true, result: [deployment(BASELINE, BASELINE_SHA),
        ...(observed ? [deployment(CREATED, RELEASE.sha)] : [])], result_info: {total_pages: 1}}));
    } else if (path === ROOT + '/upload-token') {
      const claims = Buffer.from(JSON.stringify({exp: Math.floor(Date.now()/1000)+300})).toString('base64url');
      reply({jwt: `offline.${claims}.signature`});
    } else if (path === '/pages/assets/check-missing') reply(JSON.parse(body).hashes);
    else if (path === '/pages/assets/upload' || path === '/pages/assets/upsert-hashes') reply(null);
    else if (path === ROOT + '/deployments' && req.method === 'POST') {
      assert(object, 'No Pages creation without a committed checkpoint');
      assert.deepEqual(body, p.payload.body); observed = true;
      if (scenario === 'pages-reset') {req.socket.destroy(); return;}
      reply({id: CREATED});
    } else {res.writeHead(404); res.end();}
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port;
  return {calls, checkpointRequest: options => requestR2Once({...options, hostname: '127.0.0.1', secure: false, port, timeoutMs: 200}),
    pagesRequest: options => requestOnce({...options, hostname: '127.0.0.1', secure: false, port, timeoutMs: 200}),
    fetch: (url, options) => {const u = new URL(url); assert(['api.cloudflare.com', 'api.github.com'].includes(u.hostname));
      assert(!options?.method || options.method === 'GET');
      return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, {...options, redirect: 'error'});},
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}
for (const scenario of ['success', 'concurrent', 'existing', 'denied', 'lost-ack-reset', 'lost-ack-timeout',
  'bad-readback', 'preflight-drift', 'cancel-after-claim', 'pages-reset'])
  test(`durable checkpoint + workflow + Pages transport: ${scenario}`, {timeout: 15000}, async () => {
    const p = await plan(), h = await serverFor(scenario, p), directories = [];
    const checkpoints = [];
    async function attempt() {
      const directory = mkdtempSync(join(tmpdir(), 'classyline-fresh-runner-')); directories.push(directory);
      const checkpoint = new R2Checkpoint({credentials, request: h.checkpointRequest}); checkpoints.push(checkpoint);
      const preflight = preflightFactory(h.fetch, {GITHUB_SHA: CONTROL, GH_TOKEN: 'offline', CLOUDFLARE_API_TOKEN: 'offline'},
        RELEASE.projectID, ROOT, BASELINE, BASELINE_SHA, new Set([BASELINE]), (ok, message) => {if (!ok) throw Error(message);},
        () => {verifyPlan(p, blake3); return p;}, {cwd: () => 'offline'}, 'offline', project());
      return new DirectUpload({request: h.pagesRequest, token: 'offline'}).execute({plan: p, blake3,
        journal: new AttemptJournal(directory), controlSHA: CONTROL, checkpoint: intent => checkpoint.claim(intent),
        preflight: scenario === 'cancel-after-claim' ? async () => {throw Error('Offline cancellation');} : preflight,
        reconcile: async ({read}) => {const d = (await read(ROOT + '/deployments/' + CREATED)).result;
          deploymentIdentity(d); const canonical = (await read(ROOT)).result.canonical_deployment;
          deploymentIdentity(canonical); assert.equal(canonical.id, d.id); return d;}});
    }
    try {
      const results = await Promise.allSettled(scenario === 'concurrent' ? [attempt(), attempt()] : [attempt()]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, ['success', 'concurrent'].includes(scenario) ? 1 : 0);
      const creations = () => h.calls.filter(c => c.method === 'POST' && c.path === ROOT + '/deployments').length;
      const expected = ['success', 'concurrent', 'pages-reset'].includes(scenario) ? 1 : 0;
      assert.equal(creations(), expected);
      if (expected) {
        const put = h.calls.findIndex(c => c.method === 'PUT');
        const verified = h.calls.findIndex(c => c.method === 'GET' && c.path === CHECKPOINT.path);
        const creation = h.calls.findIndex(c => c.method === 'POST' && c.path === ROOT + '/deployments');
        assert(put >= 0 && verified > put && creation > verified);
        assert(h.calls.slice(creation + 1).every(c => c.method === 'GET'));
      }
      if (scenario.startsWith('lost-ack'))
        assert(!h.calls.some(c => c.method === 'GET' && c.path === CHECKPOINT.path), 'Unknown PUT cannot read its way to permission');
      const before = h.calls.length;
      // Independent adapter and empty local journal cannot resume a stored claim,
      // even after a failed preflight or an uncertain Pages creation response.
      await assert.rejects(attempt(), /Checkpoint unavailable/);
      assert.equal(creations(), expected);
      assert.deepEqual(h.calls.slice(before).map(c => c.method), ['PUT']);
      for (const cp of checkpoints) {
        const text = JSON.stringify(cp.evidence());
        assert(!text.includes(credentials.accessKeyId)); assert(!text.includes(credentials.secretAccessKey));
        assert(!/authorization|signature|secret/i.test(text));
      }
    } finally {await h.close(); for (const dir of directories) rmSync(dir, {recursive: true, force: true});}
  });
