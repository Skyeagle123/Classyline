// Exercise the COMMITTED workflow preflight with the real DirectUpload transport.
// Only external reads, checkout/artifact location and the unavailable checkpoint
// backend are fixtures. The Production YAML and its three hard stops are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {RELEASE, ROOT, prepare, multipart, verifyPlan, AttemptJournal,
  DirectUpload, requestOnce, deploymentIdentity} from './pages-direct-upload.mjs';
import {pinnedHash} from './pages-release-artifacts.mjs';

const blake3 = pinnedHash(resolve(process.env.CLASSYLINE_TEST_APPLICATION ?? process.cwd()));
const CONTROL = 'd8ed31eef6fb0d5a4fca0e304fceece9d49640ae';
const BASELINE = '5824179f-af77-4a18-9a23-ab22019e8ccc';
const BASELINE_SHA = '393ff88e76dcca226de7f83e148554699e85ca01';
const CREATED = '12345678-0000-4000-8000-000000000001';
const FAKE_TOKEN = 'OFFLINE_TEST_TOKEN_NOT_A_CREDENTIAL';
const yaml = readFileSync(new URL('../.github/workflows/classyline-production-manual.yml', import.meta.url), 'utf8');
const scripts = [...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)]
  .map(m => m[1].replace(/^          /gm, ''));
assert.equal(scripts.length, 4);
const release = scripts.at(-1);
const helpers = release.slice(release.indexOf('async function cf(path) {'), release.indexOf('await mainUnchanged();'));
assert(helpers.includes('function project(p)') && helpers.includes('function noActive(list)'));
const callbacks = [...release.matchAll(/preflight:async \(\) => \{\n([\s\S]*?)\n\s*\}\}\);/g)];
assert.equal(callbacks.length, 1, 'Must exercise the actual committed transport preflight');
const preflightFactory = new Function('fetch', 'e', 'projectID', 'root', 'baseline', 'baselineSHA',
  'knownIDs', 'check', 'loadPlan', 'process', 'output', 'initialProject',
  helpers + '\nconst bindings=project(initialProject); return async()=>{\n' + callbacks[0][1] + '\n};');

function deployment(id, sha) {
  return {id, project_id: RELEASE.projectID, project_name: RELEASE.project,
    environment: 'production', deployment_trigger: {metadata: {branch: 'main', commit_hash: sha, commit_dirty: false}},
    latest_stage: {name: 'deploy', status: 'success'}, is_skipped: false,
    uses_functions: id === CREATED, compatibility_date: RELEASE.date, compatibility_flags: [],
    url: `https://${id.slice(0, 8)}.classyline2.pages.dev`,
    d1_databases: {DB: {id: RELEASE.database}}, r2_buckets: {PRODUCT_IMAGES: {name: RELEASE.bucket}}};
}
function configuration(database, bucket) {
  return {compatibility_date: RELEASE.date, compatibility_flags: [], usage_model: 'standard',
    d1_databases: {DB: {id: database}}, r2_buckets: {PRODUCT_IMAGES: {name: bucket}},
    env_vars: {ADMIN_PASSWORD_HASH: {type: 'secret_text'}, ADMIN_PASSWORD_SALT: {type: 'secret_text'}}};
}
function project() {
  return {id: RELEASE.projectID, name: RELEASE.project, production_branch: 'main',
    source: {type: 'github', config: {owner: 'Skyeagle123', repo_name: 'Classyline', production_deployments_enabled: false}},
    canonical_deployment: deployment(BASELINE, BASELINE_SHA), deployment_configs: {
      production: configuration(RELEASE.database, RELEASE.bucket),
      preview: configuration('ce1d28f3-f20b-485d-9799-619a7fc52ade', 'classyline-storefront-preview-images')}};
}
async function plan() {
  const bundle = multipart([
    {name: 'metadata', type: 'application/json', bytes: Buffer.from('{"main_module":"entry.js"}')},
    {name: 'entry.js', type: 'application/javascript+module', file: true, bytes: Buffer.from('export default {fetch(){return new Response("offline")}}')}
  ]).body;
  return prepare({identity: {...RELEASE}, blake3, bundle,
    routing: Buffer.from(JSON.stringify({baseURL: '/', routes: [{routePath: '/api/:path*', mountPath: '/api', method: '', module: ['api/[[path]].js:onRequest']}]})),
    files: [{path: 'index.html', bytes: Buffer.from('offline')}, {path: 'app.js', bytes: Buffer.from('void 0;')},
      {path: '_routes.json', bytes: Buffer.from('{"version":1,"include":["/api/*"],"exclude":[]}')}]});
}

async function harness(scenario, phase, p) {
  const calls = [], sockets = new Set(); let staged = false, observed = false;
  const inject = () => phase === 'first' || staged;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks), path = req.url.replace(/^\/client\/v4/, '');
    calls.push({method: req.method, path});
    const reply = result => {res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({success: true, result}));};
    if (path === '/repos/Skyeagle123/Classyline/git/ref/heads/main') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({object: {sha: inject() && scenario === 'main-drift' ? 'other' : CONTROL}}));
    } else if (req.method === 'GET' && path === ROOT) {
      const value = project();
      if (observed) value.canonical_deployment = deployment(CREATED, RELEASE.sha);
      if (inject() && scenario === 'baseline-drift') value.canonical_deployment.id = 'different-baseline';
      if (inject() && scenario === 'd1-drift') value.deployment_configs.production.d1_databases.DB.id = 'staging';
      if (inject() && scenario === 'r2-drift') value.deployment_configs.production.r2_buckets.PRODUCT_IMAGES.name = 'preview';
      reply(value);
    } else if (path === ROOT + '/deployments/' + BASELINE) {
      const value = deployment(BASELINE, BASELINE_SHA);
      if (inject() && scenario === 'rollback-source') value.deployment_trigger.metadata.commit_hash = 'other';
      if (inject() && scenario === 'rollback-status') value.latest_stage.status = 'active';
      reply(value);
    } else if (req.method === 'GET' && path.startsWith(ROOT + '/deployments')) {
      if (path === ROOT + '/deployments/' + CREATED) {reply(deployment(CREATED, RELEASE.sha)); return;}
      const values = [deployment(BASELINE, BASELINE_SHA)];
      if (observed) values.push(deployment(CREATED, RELEASE.sha));
      if (inject() && scenario.startsWith('competing-')) {
        const other = deployment('87654321-0000-4000-8000-000000000002', 'other-source');
        if (scenario === 'competing-active') other.latest_stage = {name: 'build', status: 'active'};
        values.push(other);
      }
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({success: true, result: values, result_info: {total_pages: 1}}));
    } else if (path === ROOT + '/upload-token') {
      const claims = Buffer.from(JSON.stringify({exp: Math.floor(Date.now()/1000)+300, max_file_count_allowed: 20000})).toString('base64url');
      reply({jwt: 'offline.'+claims+'.signature'});
    } else if (path === '/pages/assets/check-missing') reply(JSON.parse(body).hashes);
    else if (path === '/pages/assets/upload') reply(null);
    else if (path === '/pages/assets/upsert-hashes') {staged = true; reply(null);}
    else if (path === ROOT + '/deployments' && req.method === 'POST') {
      assert.deepEqual(body, p.payload.body); observed = true;
      if (scenario === 'timeout') return;
      if (scenario === 'reset') {req.socket.destroy(); return;}
      if (scenario === 'ambiguous') {reply({}); return;}
      reply({id: CREATED});
    } else {res.writeHead(404); res.end();}
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  // The real workflow fetch helpers are redirected ONLY to this loopback fixture.
  const fixtureFetch = (url, options = {}) => {
    const u = new URL(url);
    assert(['api.cloudflare.com', 'api.github.com'].includes(u.hostname));
    assert(!options.method || options.method === 'GET');
    return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, {...options, redirect: 'error'});
  };
  const request = options => requestOnce({...options, hostname: '127.0.0.1', port, secure: false, timeoutMs: 200});
  return {calls, request, fixtureFetch, close: async () => {
    for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  }};
}

const driftCases = ['baseline-drift', 'd1-drift', 'r2-drift', 'competing-active', 'competing-completed',
  'rollback-source', 'rollback-status', 'main-drift'];
const cases = [
  ['success', 'first'], ...driftCases.flatMap(s => [[s, 'first'], [s, 'after-assets']]),
  ['checkpoint-missing', 'first'], ['checkpoint-denied', 'first'], ['checkpoint-lost-ack', 'first'],
  ['timeout', 'first'], ['reset', 'first'], ['ambiguous', 'first']
];
for (const [scenario, phase] of cases) test(`workflow callback + native HTTP: ${scenario} / ${phase}`, {timeout: 15000}, async () => {
  const p = await plan(), dir = mkdtempSync(join(tmpdir(), 'classyline-integration-'));
  const h = await harness(scenario, phase, p); let validations = 0;
  const preflight = preflightFactory(h.fixtureFetch,
    {GITHUB_SHA: CONTROL, GH_TOKEN: FAKE_TOKEN, CLOUDFLARE_API_TOKEN: FAKE_TOKEN}, RELEASE.projectID,
    ROOT, BASELINE, BASELINE_SHA, new Set([BASELINE]), (ok, message) => {if (!ok) throw Error(message);},
    () => {validations++; verifyPlan(p, blake3); return p;}, {cwd: () => 'offline-fixture'}, 'offline-output', project());
  const options = {plan: p, blake3, journal: new AttemptJournal(dir), controlSHA: CONTROL, preflight,
    checkpoint: scenario === 'checkpoint-missing' ? undefined : async () => {
      if (scenario === 'checkpoint-lost-ack') throw Error('Offline checkpoint outcome unknown');
      return scenario !== 'checkpoint-denied';
    },
    reconcile: async ({read}) => {
      const history = (await read(ROOT + '/deployments')).result;
      const fresh = history.filter(d => d.id !== BASELINE); assert.equal(fresh.length, 1);
      const actual = (await read(ROOT + '/deployments/' + CREATED)).result;
      const canonical = (await read(ROOT)).result.canonical_deployment;
      deploymentIdentity(actual); deploymentIdentity(canonical); assert.equal(canonical.id, actual.id);
      return actual;
    }};
  const uploader = new DirectUpload({request: h.request, token: FAKE_TOKEN});
  try {
    let result, error;
    try {result = await uploader.execute(options);} catch (e) {error = e;}
    const shouldCreate = ['success', 'timeout', 'reset', 'ambiguous'].includes(scenario);
    assert.equal(h.calls.filter(c => c.path === ROOT + '/deployments' && c.method === 'POST').length, shouldCreate ? 1 : 0);
    assert.equal(Boolean(result?.accepted), scenario === 'success', error?.stack);
    if (scenario !== 'success') assert(error);
    if (scenario.startsWith('checkpoint-')) {assert.equal(h.calls.length, 0); assert.equal(validations, 0);}
    else assert.equal(validations, shouldCreate || phase === 'after-assets' ? 2 : 1);
    if (driftCases.includes(scenario) && phase === 'after-assets')
      assert(h.calls.some(c => c.path === '/pages/assets/upsert-hashes'));
    const createIndex = h.calls.findIndex(c => c.path === ROOT + '/deployments' && c.method === 'POST');
    if (createIndex >= 0) assert(h.calls.slice(createIndex + 1).every(c => c.method === 'GET'));
    const callCount = h.calls.length;
    await assert.rejects(uploader.execute(options), /already consumed/);
    await assert.rejects(new DirectUpload({request: h.request, token: FAKE_TOKEN}).execute(options), /consumed/);
    assert.equal(h.calls.length, callCount, 'No replay even with a replacement transport instance');
    assert(!JSON.stringify(result ?? {}).includes(FAKE_TOKEN)); assert(!String(error).includes(FAKE_TOKEN));
  } finally {await h.close(); rmSync(dir, {recursive: true, force: true});}
});
