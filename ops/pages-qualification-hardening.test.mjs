// Offline native HTTP and transactional-store MODEL only. No hosted proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {QualificationHarness, runHostedQualification, OWNER_AUTHORIZATION} from './pages-r2-qualification.mjs';
import {QUALIFICATION, signQualificationRequest, requestQualificationOnce} from './pages-r2-fixed-transport.mjs';
import {createConfigurationCollector, createOfflineConfigurationCollector} from './pages-qualification-collector.mjs';
import {claimQualificationBudget, claimHostedQualificationBudget, AUTHORIZATION_KEY,
  AUTHORITY_TRANSPORT_VERIFIED, BUDGET} from './pages-qualification-budget.mjs';

const credentials = Object.freeze({accessKeyId: '0123456789abcdef0123456789abcdef', secretAccessKey: 'a'.repeat(64)});
const apiToken = 'offline_' + 'b'.repeat(40), groupId = 'c'.repeat(32);
const now = new Date('2026-10-21T12:00:00Z');
const resource = `com.cloudflare.edge.r2.bucket.${QUALIFICATION.account}_default_${QUALIFICATION.bucket}`;
const prefix = `/client/v4/accounts/${QUALIFICATION.account}`;
const bucket = `${prefix}/r2/buckets/${QUALIFICATION.bucket}`;
const etag = bytes => '"' + createHash('md5').update(bytes).digest('hex') + '"';
function responseFor(path) {
  let result;
  if (path === bucket) result = {name: QUALIFICATION.bucket, jurisdiction: 'default'};
  else if (path === bucket + '/lock') result = {rules: [{id: 'test-lock', enabled: true,
    prefix: QUALIFICATION.key, condition: {type: 'Indefinite'}}]};
  else if (path === bucket + '/lifecycle') result = {rules: []};
  else if (path === prefix + '/tokens/permission_groups') result = [{id: groupId, name: 'Workers R2 Storage Bucket Item Write'}];
  else if (path === prefix + '/tokens/' + credentials.accessKeyId) result = {id: credentials.accessKeyId,
    status: 'active', expires_on: '2026-10-22T12:00:00Z', policies: [{effect: 'allow',
      permission_groups: [{id: groupId}], resources: {[resource]: '*'}}]};
  else throw new Error('Unexpected offline metadata path');
  return {success: true, errors: [], messages: [], result};
}
async function fixture(mode = 'success') {
  const calls = [], errors = [], sockets = new Set(); let object, commits = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks); calls.push({method: req.method, path: req.url});
      assert(!req.url.includes('/pages/'), 'Pages API is forbidden');
      if (req.url.startsWith('/client/v4/')) {
        assert.equal(req.method, 'GET'); assert.equal(bytes.length, 0);
        assert.equal(req.headers.host, 'api.cloudflare.com'); assert.equal(req.headers.authorization, 'Bearer ' + apiToken);
        if (mode === 'timeout') return;
        if (mode === 'reset') {req.socket.destroy(); return;}
        const status = {redirect: 307, permission: 403, server: 503}[mode] ?? 200;
        res.writeHead(status, {'content-type': mode === 'wrong-type' ? 'text/plain' : 'application/json', location: '/elsewhere'});
        const value = responseFor(req.url);
        if (mode === 'schema') value.errors = [apiToken];
        if (mode === 'unknown') value.unexpected = true;
        if (mode === 'shape') value.result = 'unverifiable';
        if (mode === 'retention' && req.url.endsWith('/lock')) value.result.rules[0].enabled = false;
        res.end(mode === 'malformed' ? '{' : mode === 'oversized' ? 'x'.repeat(65537) :
          status !== 200 ? apiToken : JSON.stringify(value)); return;
      }
      assert.equal(req.url, QUALIFICATION.path); assert.equal(req.headers.host, QUALIFICATION.hostname);
      if (req.method === 'PUT') {
        assert.equal(req.headers['if-none-match'], '*');
        if (mode === 'r2-reset-unreceived') {req.socket.destroy(); return;}
        if (object) {res.writeHead(412); res.end(); return;}
        object = Buffer.from(bytes); commits++;
        res.writeHead(200, {etag: etag(object)}); res.end();
      } else {
        assert.equal(req.method, 'GET'); assert(object);
        res.writeHead(200, {etag: etag(object)}); res.end(object);
      }
    } catch (error) {errors.push(error); res.writeHead(500); res.end();}
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return {port: server.address().port, calls, errors, commits: () => commits,
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}
// Serial transaction + copy-on-commit models an authoritative external store.
// The Map is NOT offered as a live/cross-runner persistence mechanism.
function store(mode = 'success') {
  const records = new Map(); let tail = Promise.resolve();
  return {records, transaction(callback) {
    const operation = tail.then(async () => {
      if (mode === 'denied' || mode === 'unreceived') throw new Error(apiToken);
      const pending = new Map(records);
      const result = await callback({get: async key => pending.get(key),
        put: async (key, value) => {assert.equal(key, AUTHORIZATION_KEY); pending.set(key, structuredClone(value));}});
      for (const [key, value] of pending) records.set(key, value);
      if (mode === 'lost-ack') throw new Error(apiToken);
      return mode === 'wrong-ack' ? 'wrong' : result;
    });
    tail = operation.catch(() => {}); return operation;
  }};
}
function reader(server) {return createOfflineConfigurationCollector({apiToken, accessKeyId: credentials.accessKeyId, timeoutMs: 100}, server.port);}
function harness(server, collector, budget) {
  return new QualificationHarness({credentials, port: server.port, readConfiguration: collector.collect,
    budget, now: () => now, timeoutMs: 100});
}
function privateEvidence(value, error) {
  const output = JSON.stringify(value) + String(error);
  for (const secret of [credentials.accessKeyId, credentials.secretAccessKey, apiToken, 'AWS4-HMAC-SHA256']) assert(!output.includes(secret));
}

test('fixed hosted entry validates authorization and stays blocked without a qualified external authority', async () => {
  assert.equal(AUTHORITY_TRANSPORT_VERIFIED, false);
  await assert.rejects(claimHostedQualificationBudget(), /uncertain/);
  for (const options of [undefined, {}, {ownerAuthorization: OWNER_AUTHORIZATION, credentials, apiToken},
    {ownerAuthorization: OWNER_AUTHORIZATION, credentials, apiToken, endpoint: 'http://elsewhere'}]) {
    await assert.rejects(runHostedQualification(options), error => {privateEvidence({}, error); return /BLOCKED/.test(String(error));});
  }
});
test('real collector + durable-grant model + native R2 harness fit the complete single-run budget', async t => {
  const server = await fixture(); t.after(server.close); const authority = store();
  const grant = await claimQualificationBudget(authority), collector = reader(server);
  const result = await harness(server, collector, grant).run();
  assert.equal(result.state, 'offline-passed'); assert.equal(server.commits(), 1);
  assert.deepEqual(grant.evidence().counts, BUDGET); assert.equal(server.calls.length, 14);
  assert.equal(server.errors.length, 0); assert.equal(authority.records.size, 1);
  privateEvidence(result); privateEvidence(collector.evidence()); privateEvidence(grant.evidence());
  await assert.rejects(claimQualificationBudget(authority), /consumed/);
  assert.equal(server.calls.length, 14, 'Replacement denied before any metadata or R2 request');
});
test('concurrent execution claims admit one budget; losing runner makes no qualification requests', async t => {
  const server = await fixture(); t.after(server.close); const authority = store();
  const claims = await Promise.allSettled([claimQualificationBudget(authority), claimQualificationBudget(authority)]);
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1);
  const grant = claims.find(c => c.status === 'fulfilled').value;
  await harness(server, reader(server), grant).run(); assert.equal(server.calls.length, 14);
  assert.deepEqual(grant.evidence().counts, BUDGET);
});
for (const mode of ['lost-ack', 'wrong-ack', 'denied', 'unreceived']) test(`authority ${mode} grants no execution`, async t => {
  const server = await fixture(); t.after(server.close); const authority = store(mode);
  await assert.rejects(claimQualificationBudget(authority), error => {privateEvidence({}, error); return /uncertain/.test(String(error));});
  assert.equal(server.calls.length, 0);
  if (['lost-ack', 'wrong-ack'].includes(mode)) {
    assert.equal(authority.records.size, 1);
    await assert.rejects(claimQualificationBudget(authority), /consumed/);
  }
});
test('unreceived R2 claims consume the prior durable grant; replacement cannot restart the budget', async t => {
  const server = await fixture('r2-reset-unreceived'); t.after(server.close); const authority = store();
  const grant = await claimQualificationBudget(authority);
  await assert.rejects(harness(server, reader(server), grant).run(), /blocked/);
  assert.deepEqual(grant.evidence().counts, {put: 2, get: 0, metadata: 5});
  assert.equal(server.commits(), 0); const count = server.calls.length;
  await assert.rejects(claimQualificationBudget(authority), /consumed/);
  assert.equal(server.calls.length, count); assert.equal(count, 7);
});
test('runner loss after durable grant burns all remaining allowance without resume', async () => {
  const authority = store(); await claimQualificationBudget(authority);
  const retained = JSON.stringify([...authority.records]);
  await assert.rejects(claimQualificationBudget(authority), /consumed/);
  assert.equal(JSON.stringify([...authority.records]), retained);
});
test('authority timeout after commit yields no grant even when acknowledgement arrives later', async () => {
  const authority = store(); let acknowledge;
  const delayed = {transaction: async callback => {
    const result = await authority.transaction(callback);
    await new Promise(resolve => {acknowledge = resolve;}); return result;
  }};
  await assert.rejects(claimQualificationBudget(delayed, {timeoutMs: 10}), /uncertain/);
  assert.equal(authority.records.size, 1); acknowledge();
  await assert.rejects(claimQualificationBudget(authority), /consumed/);
});
test('caller-provided grant cannot bypass authoritative consumption', () => {
  assert.throws(() => new QualificationHarness({credentials, port: 12345,
    readConfiguration: async () => {}, budget: {take() {}, stop() {}}}), /consumed/);
});
for (const kind of Object.keys(BUDGET)) test(`budget ${kind} exhaustion fails closed without refund`, async () => {
  const grant = await claimQualificationBudget(store());
  for (let i = 0; i < BUDGET[kind]; i++) grant.take(kind);
  assert.throws(() => grant.take(kind), /consumed/);
  assert.throws(() => grant.take('get'), /consumed/);
  assert.equal(grant.evidence().counts[kind], BUDGET[kind]);
});
for (const mode of ['timeout', 'reset', 'redirect', 'permission', 'server', 'wrong-type', 'malformed',
  'oversized', 'schema', 'unknown', 'shape']) test(`collector ${mode}: one GET, no retry or R2 requests`, async t => {
  const server = await fixture(mode); t.after(server.close); const collector = reader(server);
  const request = {method: 'GET', path: bucket.replace('/client/v4', ''), jurisdiction: 'default'};
  await assert.rejects(collector.collect(request), error => {privateEvidence(collector.evidence(), error); return /unavailable/.test(String(error));});
  await assert.rejects(collector.collect(request), /unavailable/);
  assert.equal(server.calls.length, 1); assert.equal(server.calls[0].method, 'GET');
});
test('collector cancellation terminates pending request and permanently blocks the instance', async t => {
  const server = await fixture('timeout'); t.after(server.close); const collector = reader(server), abort = new AbortController();
  const operation = collector.collect({method: 'GET', path: bucket.replace('/client/v4', ''), jurisdiction: 'default', signal: abort.signal});
  setTimeout(() => abort.abort(), 10);
  await assert.rejects(operation, /unavailable/); assert.equal(server.calls.length, 1);
});
test('collector enforces ten actual GETs and rejects arbitrary endpoints before network I/O', async t => {
  const server = await fixture(); t.after(server.close); const collector = reader(server);
  const request = {method: 'GET', path: bucket.replace('/client/v4', ''), jurisdiction: 'default'};
  for (let i = 0; i < 10; i++) await collector.collect(request);
  await assert.rejects(collector.collect(request), /unavailable/); assert.equal(server.calls.length, 10);
  assert.equal(collector.evidence().requests, 10);
  for (const invalid of [{...request, method: 'POST'}, {...request, path: '/accounts/other/r2/buckets/other'},
    {...request, path: request.path + '?override=true'}]) await assert.rejects(reader(server).collect(invalid), /unavailable/);
  assert.equal(server.calls.length, 10);
  assert.throws(() => createConfigurationCollector({apiToken, accessKeyId: credentials.accessKeyId, hostname: 'elsewhere'}), /unavailable/);
});
test('real retention rejection burns the durable grant before any R2 write', async t => {
  const server = await fixture('retention'); t.after(server.close); const authority = store();
  const grant = await claimQualificationBudget(authority);
  await assert.rejects(harness(server, reader(server), grant).run(), /blocked/);
  assert.equal(server.calls.length, 5); assert(server.calls.every(c => c.method === 'GET'));
  await assert.rejects(claimQualificationBudget(authority), /consumed/);
});
for (const [name, change] of [
  ['case-variant Host', h => {h.Host = 'evil.example';}],
  ['case-variant condition', h => {h['If-None-Match'] = 'not-star';}],
  ['unknown header', h => {h['x-unapproved'] = 'value';}],
  ['CRLF injection', h => {h.authorization += '\r\nx-injected: yes';}],
  ['array header', h => {h.host = [h.host, h.host];}],
  ['noncanonical header', h => {h['content-type'] = 'text/plain';}],
  ['unsigned conditional header', h => {h.authorization = h.authorization.replace(/SignedHeaders=[^,]+/, 'SignedHeaders=host');}]
]) test(`fixed R2 transport rejects ${name} before creating a request`, () => {
  const request = signQualificationRequest({method: 'PUT', body: Buffer.from('{}'), credentials, now});
  const headers = {...request.headers}; change(headers);
  assert.throws(() => requestQualificationOnce({...request, headers}), /headers|signed request/);
});
