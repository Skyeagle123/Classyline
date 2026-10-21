// Offline only. The fixture models atomic R2 conditional creation; passing does
// not establish hosted R2 compatibility, real credentials, locks or permissions.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash, createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {QualificationHarness, QUALIFICATION, HOSTED_QUALIFICATION_ENABLED, runHostedQualification} from './pages-r2-qualification.mjs';
import {CHECKPOINT, signQualificationRequest, requestQualificationOnce} from './pages-r2-fixed-transport.mjs';

const credentials = Object.freeze({accessKeyId: '0123456789abcdef0123456789abcdef', secretAccessKey: 'c'.repeat(64)});
const now = new Date('2026-10-21T12:00:00.000Z');
const groupId = 'd'.repeat(32), groupName = 'Workers R2 Storage Bucket Item Write';
const resource = `com.cloudflare.edge.r2.bucket.${QUALIFICATION.account}_default_${QUALIFICATION.bucket}`;
const digest = (kind, bytes, encoding = 'hex') => createHash(kind).update(bytes).digest(encoding);
const etag = bytes => `"${digest('md5', bytes)}"`;
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const api = result => ({status: 200, body: {success: true, errors: [], result}});

function metadata(change = () => {}) {
  const responses = {
    bucket: api({name: QUALIFICATION.bucket, jurisdiction: 'default'}),
    lock: api({rules: [{id: 'permanent-test-key', enabled: true, condition: {type: 'Indefinite'},
      prefix: QUALIFICATION.key}]}),
    lifecycle: api({rules: []}),
    token: api({id: credentials.accessKeyId, status: 'active', expires_on: '2026-10-22T12:00:00.000Z',
      not_before: '2026-10-21T00:00:00.000Z', policies: [{effect: 'allow',
        permission_groups: [{id: groupId, name: groupName}], resources: {[resource]: '*'}}]}),
    groups: api([{id: groupId, name: groupName}])
  };
  change(responses);
  const base = `/accounts/${QUALIFICATION.account}`;
  const bucket = `${base}/r2/buckets/${QUALIFICATION.bucket}`;
  const mapping = {[bucket]: 'bucket', [`${bucket}/lock`]: 'lock', [`${bucket}/lifecycle`]: 'lifecycle',
    [`${base}/tokens/${credentials.accessKeyId}`]: 'token', [`${base}/tokens/permission_groups`]: 'groups'};
  const requests = [];
  return {requests, responses, read: async request => {
    assert.equal(request.method, 'GET'); assert.equal(request.jurisdiction, 'default');
    assert(mapping[request.path]); requests.push(mapping[request.path]);
    return structuredClone(responses[mapping[request.path]]);
  }};
}

function verifySignedRequest(req, body) {
  assert.equal(req.url, QUALIFICATION.path);
  assert.equal(req.headers.host, QUALIFICATION.hostname);
  assert.equal(req.headers['x-amz-content-sha256'], digest('sha256', body));
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(req.headers.authorization);
  assert(match); assert.equal(match[1], credentials.accessKeyId);
  const scope = match[2].split('/');
  assert.deepEqual(scope.slice(1), ['auto', 's3', 'aws4_request']);
  assert.equal(scope[0], req.headers['x-amz-date'].slice(0, 8));
  const names = match[3].split(';');
  assert.deepEqual([...names].sort(), names); assert.equal(new Set(names).size, names.length);
  for (const required of ['host', 'x-amz-content-sha256', 'x-amz-date']) assert(names.includes(required));
  if (req.method === 'PUT') {
    assert.equal(req.headers['if-none-match'], '*'); assert(names.includes('if-none-match'));
    assert.equal(req.headers['content-md5'], digest('md5', body, 'base64')); assert(names.includes('content-md5'));
    const record = JSON.parse(body);
    assert.equal(record.bucket, QUALIFICATION.bucket); assert.equal(record.key, QUALIFICATION.key);
    assert.equal(record.pages_deployment_permitted, false);
  }
  const headers = names.map(name => `${name}:${String(req.headers[name]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonical = [req.method, req.url, '', headers, match[3], digest('sha256', body)].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', req.headers['x-amz-date'], match[2], digest('sha256', canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + credentials.secretAccessKey, scope[0]), 'auto'), 's3'), 'aws4_request');
  assert.equal(match[4], hmac(key, toSign).toString('hex'));
}

async function serverFor(mode = 'success') {
  const calls = [], errors = [], sockets = new Set();
  let value, commits = 0;
  if (mode === 'existing') value = Buffer.from('previous qualification, retained');
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks); calls.push(req.method);
      verifySignedRequest(req, body);
      if (req.method === 'PUT') {
        if (mode === 'permission') {res.writeHead(403); res.end(credentials.secretAccessKey); return;}
        if (mode === 'redirect') {res.writeHead(307, {location: '/unapproved'}); res.end(); return;}
        if (mode === '503') {res.writeHead(503); res.end(); return;}
        if (value && mode !== 'broken-atomicity') {
          res.writeHead(mode === 'existing-denial-fails' && calls.filter(method => method === 'PUT').length === 3 ? 200 : 412);
          res.end(); return;
        }
        value = Buffer.from(body); commits++; server.emit('committed');
        if (mode === 'timeout' || mode === 'cancel') return;
        if (mode === 'reset') {req.socket.destroy(); return;}
        if (mode === 'partial') {res.writeHead(200, {etag: etag(value), 'content-length': 20}); res.write('partial'); req.socket.destroy(); return;}
        if (mode === 'bad-etag') {res.writeHead(200, {etag: '"wrong"'}); res.end(); return;}
        res.writeHead(200, {etag: etag(value)}); res.end(mode === 'nonempty' ? credentials.secretAccessKey : undefined);
      } else if (req.method === 'GET') {
        assert(value);
        const result = mode === 'bad-readback' ? Buffer.from('different') : value;
        res.writeHead(200, {etag: etag(result)}); res.end(result);
      } else {throw new Error('Unexpected method');}
    } catch (error) {errors.push(error); res.writeHead(500); res.end();}
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return {server, calls, errors, port: server.address().port, commits: () => commits, value: () => value,
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}
function harness(server, read, extra = {}) {
  return new QualificationHarness({credentials, port: server.port, readConfiguration: read,
    now: () => now, timeoutMs: 100, ...extra});
}
function privateEvidence(instance, error) {
  const text = JSON.stringify(instance.evidence()) + String(error);
  assert(!text.includes(credentials.accessKeyId)); assert(!text.includes(credentials.secretAccessKey));
  assert(!text.includes('AWS4-HMAC-SHA256')); assert(!text.includes('authorization'));
  assert.equal(instance.evidence().pages_requests, 0);
  assert.equal(instance.evidence().hosted_qualified, false);
}

test('qualification is isolated, import-safe, hosted-blocked and has no Pages client dependency', async () => {
  assert.equal(HOSTED_QUALIFICATION_ENABLED, false);
  await assert.rejects(runHostedQualification(), /BLOCKED/);
  assert.notEqual(QUALIFICATION.bucket, CHECKPOINT.bucket); assert.notEqual(QUALIFICATION.key, CHECKPOINT.key);
  assert.equal(QUALIFICATION.bucket, 'classyline-checkpoint-qualification');
  const source = readFileSync(new URL('./pages-r2-qualification.mjs', import.meta.url), 'utf8');
  assert(!source.includes("from './pages-direct-upload.mjs'"));
  assert(!source.includes('process.env')); assert(!source.includes('DELETE'));
  assert.throws(() => new QualificationHarness({credentials}), /prerequisite/);
});

test('qualification: signed simultaneous claims yield one object; exact readback and existing denial; no Pages calls', async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata();
  const instance = harness(server, config.read); const evidence = await instance.run();
  assert.deepEqual(server.calls, ['PUT', 'PUT', 'GET', 'PUT']); assert.equal(server.commits(), 1);
  assert.equal(server.errors.length, 0); assert.equal(evidence.state, 'offline-passed');
  assert.equal(evidence.conditional_puts, 3); assert.equal(evidence.object_reads, 1);
  assert.equal(evidence.metadata_reads, 10); assert.equal(config.requests.length, 10);
  assert.equal(evidence.checkpoint_sha256, digest('sha256', server.value()));
  assert.equal(evidence.retention_verified_in_fixture, true); assert.equal(evidence.permission_scope_verified_in_fixture, true);
  assert.equal(evidence.cleanup_permitted, false); privateEvidence(instance);
  await assert.rejects(instance.run(), /prerequisite/); assert.equal(server.calls.length, 4);
});

test('qualification retained object prevents a fresh harness from claiming successfully', async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata();
  await harness(server, config.read).run(); const original = Buffer.from(server.value());
  const replacement = harness(server, config.read);
  await assert.rejects(replacement.run(), /blocked/);
  assert.equal(server.commits(), 1); assert(server.value().equals(original));
  assert.deepEqual(server.calls.slice(4), ['PUT', 'PUT']); privateEvidence(replacement);
});

const invalidConfigurations = [
  ['wrong bucket', data => {data.bucket.body.result.name = 'classyline-storefront-production-images';}],
  ['nondefault jurisdiction', data => {data.bucket.body.result.jurisdiction = 'eu';}],
  ['no indefinite lock', data => {data.lock.body.result.rules = [];}],
  ['disabled lock', data => {data.lock.body.result.rules[0].enabled = false;}],
  ['age lock', data => {data.lock.body.result.rules[0].condition = {type: 'Age', maxAgeSeconds: 86400};}],
  ['wrong key prefix', data => {data.lock.body.result.rules[0].prefix = 'another-key/';}],
  ['lifecycle expiry', data => {data.lifecycle.body.result.rules = [{enabled: true, deleteObjectsTransition: {condition: {type: 'Age', maxAge: 1}}}];}],
  ['token identity mismatch', data => {data.token.body.result.id = 'a'.repeat(32);}],
  ['token disabled', data => {data.token.body.result.status = 'disabled';}],
  ['missing expiration', data => {delete data.token.body.result.expires_on;}],
  ['expired token', data => {data.token.body.result.expires_on = '2026-10-21T00:00:00.000Z';}],
  ['future token', data => {data.token.body.result.not_before = '2026-10-22T00:00:00.000Z';}],
  ['invalid not-before', data => {data.token.body.result.not_before = 'invalid';}],
  ['additional policy', data => {data.token.body.result.policies.push(data.token.body.result.policies[0]);}],
  ['deny effect', data => {data.token.body.result.policies[0].effect = 'deny';}],
  ['all-bucket scope', data => {data.token.body.result.policies[0].resources = {[`com.cloudflare.api.account.${QUALIFICATION.account}`]: {'com.cloudflare.edge.r2.bucket.*': '*'}};}],
  ['extra resource', data => {data.token.body.result.policies[0].resources.other = '*';}],
  ['permission mismatch', data => {data.token.body.result.policies[0].permission_groups[0].id = 'e'.repeat(32);}],
  ['additional permission', data => {data.token.body.result.policies[0].permission_groups.push({id: 'e'.repeat(32)});}],
  ['admin permission', data => {data.groups.body.result[0].name = 'Workers R2 Storage Write';}],
  ['duplicate permission ID', data => {data.groups.body.result.push({...data.groups.body.result[0], name: 'other'});}],
  ['incomplete permission list', data => {data.groups.body.result_info = {total_pages: 2};}],
  ['unavailable API evidence', data => {data.lock.status = 403;}],
  ['owner boolean is not evidence', data => {data.lock = {status: 200, body: {owner_verified: true}};}]
];
for (const [name, change] of invalidConfigurations) test(`qualification preflight rejects ${name} before conditional claims`, async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata(change);
  const instance = harness(server, config.read);
  await assert.rejects(instance.run(), /blocked/); assert.equal(server.calls.length, 0);
  assert.equal(instance.evidence().conditional_puts, 0); privateEvidence(instance);
});

for (const mode of ['existing', 'permission', 'redirect', '503', 'timeout', 'reset', 'partial', 'bad-etag', 'nonempty', 'broken-atomicity']) {
  test(`qualification ${mode}: no readback, existing probe or retry after ambiguous/failed concurrency result`, async t => {
    const server = await serverFor(mode); t.after(server.close); const config = metadata();
    const instance = harness(server, config.read); let error;
    await assert.rejects(instance.run(), value => {error = value; return /blocked/.test(String(value));});
    assert.deepEqual(server.calls, ['PUT', 'PUT']); assert.equal(instance.evidence().object_reads, 0);
    assert.equal(instance.evidence().metadata_reads, 5); privateEvidence(instance, error);
    await assert.rejects(instance.run(), /prerequisite/); assert.equal(server.calls.length, 2);
    assert.equal(server.errors.length, 0);
  });
}

test('qualification cancellation after committed claim fails closed and cannot resume', async t => {
  const server = await serverFor('cancel'); t.after(server.close); const config = metadata();
  const controller = new AbortController(); server.server.once('committed', () => controller.abort());
  const instance = harness(server, config.read, {signal: controller.signal});
  await assert.rejects(instance.run(), /blocked/); assert(server.commits() <= 1);
  assert.equal(instance.evidence().object_reads, 0); assert.equal(instance.evidence().conditional_puts, 2);
  await assert.rejects(instance.run(), /prerequisite/); privateEvidence(instance);
});

test('qualification mismatched readback prevents existing-object probe', async t => {
  const server = await serverFor('bad-readback'); t.after(server.close); const config = metadata();
  const instance = harness(server, config.read);
  await assert.rejects(instance.run(), /blocked/); assert.deepEqual(server.calls, ['PUT', 'PUT', 'GET']);
  privateEvidence(instance);
});

test('qualification existing-object denial must be 412, never accepted from status 200', async t => {
  const server = await serverFor('existing-denial-fails'); t.after(server.close); const config = metadata();
  const instance = harness(server, config.read);
  await assert.rejects(instance.run(), /blocked/); assert.equal(instance.evidence().metadata_reads, 5);
  assert.equal(server.calls.length, 4); privateEvidence(instance);
});

test('qualification detects permission or retention drift after the bounded object checks', async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata(); let reads = 0;
  const instance = harness(server, async request => {
    if (++reads === 6) config.responses.lock.body.result.rules[0].enabled = false;
    return config.read(request);
  });
  await assert.rejects(instance.run(), /blocked/); assert.equal(server.commits(), 1);
  assert.equal(instance.evidence().conditional_puts, 3); privateEvidence(instance);
});

test('qualification rejects stale configuration before any conditional PUT', async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata(); let nowReads = 0;
  const instance = harness(server, config.read, {now: () => new Date(now.getTime() + (++nowReads > 2 ? 61_000 : 0))});
  await assert.rejects(instance.run(), /blocked/); assert.equal(server.calls.length, 0);
});

test('qualification fixed transport rejects production key and external endpoint overrides before network I/O', () => {
  const request = signQualificationRequest({method: 'PUT', body: Buffer.from('{}'), credentials, now});
  assert.equal(request.path, QUALIFICATION.path);
  assert.throws(() => requestQualificationOnce({...request, path: CHECKPOINT.path}), /Invalid/);
  assert.throws(() => requestQualificationOnce({...request, hostname: 'example.org'}), /Unsupported/);
  assert.throws(() => requestQualificationOnce({...request, method: 'DELETE'}), /Invalid/);
});

test('qualification metadata errors cannot leak credentials or authorize a claim', async t => {
  const server = await serverFor(); t.after(server.close);
  const instance = harness(server, async () => {throw new Error(credentials.accessKeyId + credentials.secretAccessKey);});
  let error;
  await assert.rejects(instance.run(), value => {error = value; return /blocked/.test(String(value));});
  assert.equal(server.calls.length, 0); privateEvidence(instance, error);
});

test('qualification cancelled before configuration performs no requests', async t => {
  const server = await serverFor(); t.after(server.close); const config = metadata();
  const controller = new AbortController(); controller.abort();
  const instance = harness(server, config.read, {signal: controller.signal});
  await assert.rejects(instance.run(), /blocked/);
  assert.equal(config.requests.length, 0); assert.equal(server.calls.length, 0);
  privateEvidence(instance);
});
