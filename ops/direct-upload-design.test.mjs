// OFFLINE DESIGN MODEL ONLY. No HTTP adapter, credentials, environment access,
// subprocess, exported client or workflow integration. This tests the proposed
// state/attempt contract, NOT native HTTP behavior or Cloudflare compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const SHA = 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a';
const TREE = '123889f9fd27b3f0b2138ea057efa2e762a231b1';
const DB = '10c800b1-ddf7-427b-8354-9cf8529782b6';
const BUCKET = 'classyline-storefront-production-images';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireCheck = (ok, message) => { if (!ok) throw new Error(message); };
function plan() {
  const artifacts = ['static bytes', 'compiled Functions multipart bytes', '{"include":["/api/*"]}']
    .map(bytes => ({bytes, sha256: digest(bytes)}));
  return {sha: SHA, tree: TREE, freeze: true, clean: true, exactFileSet: true,
    functionsVerified: true, artifacts, knownIDs: ['baseline']};
}
function deployed() {
  return {id: 'candidate-deployment', sha: SHA, status: 'success', stage: 'deploy',
    environment: 'production', branch: 'main', uses_functions: true,
    d1_databases: {DB: {id: DB}}, r2_buckets: {PRODUCT_IMAGES: {name: BUCKET}}};
}
function verify(d) {
  requireCheck(d?.sha === SHA && d.stage === 'deploy' && d.status === 'success' &&
    d.environment === 'production' && d.branch === 'main' && d.uses_functions === true,
    'identity/status');
  requireCheck(d.d1_databases && Object.keys(d.d1_databases).join() === 'DB' &&
    d.d1_databases.DB?.id === DB, 'D1');
  requireCheck(d.r2_buckets && Object.keys(d.r2_buckets).join() === 'PRODUCT_IMAGES' &&
    d.r2_buckets.PRODUCT_IMAGES?.name === BUCKET, 'R2');
}
class OfflineContract {
  constructor(fakeIO) {
    this.io = fakeIO;
    this.spent = new Set();
    this.started = false;
    this.evidence = {accepted: false, uncertain: false, operations: []};
  }
  async once(label, method) {
    requireCheck(!this.spent.has(label), 'attempt already consumed');
    // Consumed BEFORE dispatch; never restored after error/timeout/reset/redirect.
    this.spent.add(label);
    this.evidence.operations.push({label, method});
    const r = await this.io(label, method);
    requireCheck(r?.status === 200, 'non-success/redirect');
    requireCheck(r.payload !== undefined, 'invalid response');
    return r.payload;
  }
  async run(p) {
    requireCheck(!this.started, 'release already consumed');
    this.started = true;
    try {
      requireCheck(p.sha === SHA && p.tree === TREE && p.clean && p.freeze && p.exactFileSet &&
        p.functionsVerified, 'source/build/freeze');
      requireCheck(p.artifacts.length === 3 && p.artifacts.every(a => digest(a.bytes) === a.sha256),
        'artifact bytes');
      await this.once('upload-token', 'GET');
      await this.once('check-missing', 'POST');
      await this.once('asset-batch-1', 'POST');
      await this.once('upsert-hashes', 'POST');
      await this.once('final-preflight', 'GET');
      let returnedID;
      try {
        const created = await this.once('create', 'POST');
        requireCheck(typeof created.id === 'string' && created.id.length > 0, 'ambiguous creation');
        returnedID = created.id;
      } catch {
        this.evidence.uncertain = true;
      }
      // After creation is spent, only read-only reconciliation is permitted.
      const h = await this.once('history', 'GET');
      const fresh = h.filter(d => !p.knownIDs.includes(d.id));
      requireCheck(fresh.length === 1, 'competing/missing deployment');
      const d = await this.once('deployment', 'GET');
      requireCheck(d.id === fresh[0].id, 'deployment ID');
      requireCheck(this.evidence.uncertain || returnedID === d.id, 'creation response ID');
      verify(d);
      const finalHistory = await this.once('final-history', 'GET');
      const finalFresh = finalHistory.filter(x => !p.knownIDs.includes(x.id));
      requireCheck(finalFresh.length === 1 && finalFresh[0].id === d.id, 'final deployment set');
      verify(finalFresh[0]);
      const canonical = await this.once('canonical', 'GET');
      requireCheck(canonical.id === d.id, 'canonical ID');
      verify(canonical);
      await this.once('rollback-and-freeze', 'GET');
      // A matching observed deployment does not erase an ambiguous POST outcome.
      requireCheck(!this.evidence.uncertain, 'manual reconciliation required');
      this.evidence.accepted = true;
    } catch {
      // Deliberately exclude exceptions, response bodies, headers and credentials.
      this.evidence.accepted = false;
    }
    return structuredClone(this.evidence);
  }
}
function harness(scenario) {
  const calls = [], d = deployed(), baseline = {id: 'baseline'};
  let observed = false;
  const fakeIO = async (label, method) => {
    calls.push({label, method});
    requireCheck(calls.filter(c => c.label === label).length === 1, 'duplicate fake request');
    if (label === 'asset-batch-1' && scenario === 'upload-timeout') throw new Error('timeout');
    if (label === 'create') {
      observed = scenario !== 'timeout-no-visible-deployment';
      if (scenario.startsWith('timeout')) throw new Error('timeout');
      if (scenario === 'connection-reset') throw new Error('ECONNRESET');
      if (scenario === 'truncated-response') throw new SyntaxError('incomplete JSON');
      if (scenario === 'redirect') return {status: 307, payload: {location: 'untrusted'}};
      if (scenario === 'http-429' || scenario === 'http-503') return {status: Number(scenario.slice(5))};
      if (scenario === 'ambiguous-response') return {status: 200, payload: {}};
      if (scenario === 'wrong-returned-id') return {status: 200, payload: {id: 'unexpected'}};
    }
    if (scenario === 'binding-mismatch') d.d1_databases.DB.id = 'staging';
    if (scenario === 'extra-binding') d.r2_buckets.EXTRA = {name: 'unexpected'};
    if (scenario === 'missing-functions') d.uses_functions = false;
    if (scenario === 'wrong-source') d.sha = 'other';
    if (scenario === 'unknown-status') d.status = 'active';
    if (label.includes('history')) {
      const list = observed ? [baseline, d] : [baseline];
      if (scenario === 'competing-deployment' ||
        (label === 'final-history' && scenario === 'late-competing-success'))
        list.push({...d, id: 'other'});
      return {status: 200, payload: list};
    }
    if (label === 'canonical' && scenario === 'canonical-drift')
      return {status: 200, payload: {...d, id: 'other'}};
    if (label === 'deployment' || label === 'canonical') return {status: 200, payload: d};
    return {status: 200, payload: {id: d.id}};
  };
  return {model: new OfflineContract(fakeIO), calls};
}
const scenarios = ['success', 'upload-timeout', 'timeout-with-visible-deployment',
  'timeout-no-visible-deployment', 'connection-reset', 'truncated-response',
  'redirect', 'http-429', 'http-503', 'ambiguous-response', 'competing-deployment',
  'late-competing-success', 'binding-mismatch', 'extra-binding', 'missing-functions',
  'wrong-source', 'unknown-status', 'canonical-drift', 'wrong-returned-id'];
for (const scenario of scenarios) test(`Direct Upload design contract: ${scenario}`, async () => {
  const {model, calls} = harness(scenario);
  const evidence = await model.run(plan());
  assert.equal(evidence.accepted, scenario === 'success');
  const create = calls.findIndex(c => c.label === 'create');
  assert.equal(calls.filter(c => c.label === 'create').length, scenario === 'upload-timeout' ? 0 : 1);
  if (create >= 0) assert(calls.slice(create + 1).every(c => c.method === 'GET'));
  const count = calls.length;
  await assert.rejects(model.run(plan()), /release already consumed/);
  assert.equal(calls.length, count); // no retry, including after successful reconciliation
  assert(!JSON.stringify(evidence).includes('Authorization'));
});
for (const field of ['sha', 'tree', 'clean', 'freeze', 'exactFileSet', 'functionsVerified'])
  test(`Direct Upload design rejects invalid ${field} before any request`, async () => {
    const {model, calls} = harness('success'), p = plan();
    p[field] = typeof p[field] === 'string' ? 'wrong' : false;
    assert.equal((await model.run(p)).accepted, false);
    assert.equal(calls.length, 0);
  });
test('Direct Upload design rejects changed upload bytes', async () => {
  const {model, calls} = harness('success'), p = plan();
  p.artifacts[1].bytes = 'changed Functions';
  assert.equal((await model.run(p)).accepted, false);
  assert.equal(calls.length, 0);
});
