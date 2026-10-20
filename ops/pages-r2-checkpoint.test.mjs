// Real loopback HTTP only. The in-memory store models R2's documented atomic
// If-None-Match contract; it is not evidence of hosted R2 compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash, createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {RELEASE} from './pages-direct-upload.mjs';
import {CHECKPOINT, R2Checkpoint, signCheckpointRequest, requestR2Once} from './pages-r2-checkpoint.mjs';

const CREDENTIALS = Object.freeze({accessKeyId: '0123456789abcdef0123456789abcdef',
  secretAccessKey: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'});
const DATE = new Date('2026-10-20T12:00:00.000Z');
const intent = () => ({schema: 1, release: RELEASE.sha,
  control_sha: 'cc3f1207b2ac5a2739f7b6a96af18600e2d1e988',
  plan_sha256: '1'.repeat(64), body_sha256: '2'.repeat(64), consumed: true, retry_permitted: false});
const digest = (algorithm, value, encoding = 'hex') => createHash(algorithm).update(value).digest(encoding);
const etag = body => '"' + digest('md5', body) + '"';
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

// Independent server-side SigV4 verification reconstructs the canonical request
// from bytes and headers actually received over HTTP, not signer output fields.
function verifySignature(req, body) {
  assert.equal(req.url, CHECKPOINT.path);
  assert.equal(req.headers.host, CHECKPOINT.hostname);
  assert.equal(req.headers['x-amz-content-sha256'], digest('sha256', body));
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(req.headers.authorization);
  assert(match, 'Signature format');
  assert.equal(match[1], CREDENTIALS.accessKeyId);
  const scope = match[2].split('/');
  assert.deepEqual(scope.slice(1), ['auto', 's3', 'aws4_request']);
  assert.equal(scope[0], req.headers['x-amz-date'].slice(0, 8));
  const names = match[3].split(';');
  assert.deepEqual([...names].sort(), names);
  assert.equal(new Set(names).size, names.length);
  for (const name of ['host', 'x-amz-content-sha256', 'x-amz-date']) assert(names.includes(name));
  if (req.method === 'PUT') {
    assert.equal(req.headers['if-none-match'], '*');
    assert(names.includes('if-none-match'));
    assert.equal(req.headers['content-md5'], digest('md5', body, 'base64'));
    assert(names.includes('content-md5'));
  }
  const headers = names.map(name => `${name}:${String(req.headers[name]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonical = [req.method, req.url, '', headers, match[3], digest('sha256', body)].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', req.headers['x-amz-date'], match[2], digest('sha256', canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + CREDENTIALS.secretAccessKey, scope[0]), 'auto'), 's3'), 'aws4_request');
  assert.equal(match[4], hmac(key, stringToSign).toString('hex'));
}

async function serverFor(mode = 'success') {
  const calls = [], store = new Map(), sockets = new Set(), validationErrors = [];
  let commits = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      calls.push({method: req.method, path: req.url, bytes: body.length});
      verifySignature(req, body);
      if (req.method === 'PUT') {
        if (['403', '409', '503'].includes(mode)) {res.writeHead(Number(mode)); res.end(CREDENTIALS.secretAccessKey); return;}
        if (mode === 'redirect') {res.writeHead(307, {location: `http://127.0.0.1:${server.address().port}/redirect`}); res.end(); return;}
        // Synchronous commit in this fixture is the modeled atomic store boundary.
        if (store.has(req.url)) {res.writeHead(412); res.end(); return;}
        store.set(req.url, Buffer.from(body)); commits++; server.emit('committed');
        if (mode === 'reset') {req.socket.destroy(); return;}
        if (mode === 'timeout' || mode === 'cancel' || mode === 'crash') return;
        if (mode === 'partial') {res.writeHead(200, {etag: etag(body), 'content-length': '100'}); res.write('partial'); req.socket.destroy(); return;}
        if (mode === 'oversized') {res.writeHead(200, {etag: etag(body)}); res.end('x'.repeat(9000)); return;}
        if (mode === 'nonempty') {res.writeHead(200, {etag: etag(body)}); res.end(CREDENTIALS.secretAccessKey); return;}
        res.writeHead(200, {etag: mode === 'bad-etag' ? '"incorrect"' : etag(body)}); res.end();
      } else if (req.method === 'GET') {
        if (mode === 'readback-403' || mode === 'readback-404') {res.writeHead(Number(mode.slice(-3))); res.end(); return;}
        const stored = store.get(req.url);
        assert(stored);
        const value = mode === 'readback-mismatch' ? Buffer.from('different bytes') : stored;
        res.writeHead(200, {etag: etag(value), 'content-type': 'application/json'}); res.end(value);
      } else {res.writeHead(405); res.end();}
    } catch (error) {
      validationErrors.push(error); res.writeHead(500); res.end('offline fixture rejected request');
    }
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  return {calls, store, events: server, port, validationErrors, commits: () => commits,
    request: options => requestR2Once({...options, hostname: '127.0.0.1', port, secure: false, timeoutMs: 300}),
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}
function adapter(server, extra = {}) {
  return new R2Checkpoint({credentials: CREDENTIALS, request: server.request, now: () => DATE, ...extra});
}
function privateEvidence(checkpoint, error) {
  const text = JSON.stringify(checkpoint.evidence()) + String(error);
  assert(!text.includes(CREDENTIALS.accessKeyId)); assert(!text.includes(CREDENTIALS.secretAccessKey));
  assert(!text.includes('AWS4-HMAC-SHA256'));
}

test('checkpoint signature binds exact account, key, payload and conditional header', () => {
  const body = Buffer.from('{"offline":"fixture"}');
  const signed = signCheckpointRequest({method: 'PUT', body, credentials: CREDENTIALS, now: DATE});
  verifySignature({method: signed.method, url: signed.path, headers: signed.headers}, signed.body);
  assert.equal(signed.hostname, CHECKPOINT.hostname);
  assert.equal(signed.headers['x-amz-date'], '20261020T120000Z');
  body[0] ^= 1; assert.notDeepEqual(signed.body, body, 'Signer freezes independent payload bytes');
});

test('successful checkpoint uses one conditional PUT and one exact readback', {timeout: 10000}, async () => {
  const s = await serverFor(), cp = adapter(s);
  try {
    assert.equal(await cp.claim(intent()), true);
    assert.deepEqual(s.calls.map(c => c.method), ['PUT', 'GET']); assert.equal(s.commits(), 1);
    const body = JSON.parse(s.store.get(CHECKPOINT.path));
    assert(JSON.stringify(body).includes(RELEASE.sha)); assert(JSON.stringify(body).includes(RELEASE.tree));
    assert(!JSON.stringify(body).includes(CREDENTIALS.secretAccessKey));
    await assert.rejects(cp.claim(intent()));
    assert.equal(s.calls.length, 2); privateEvidence(cp); assert.deepEqual(s.validationErrors, []);
  } finally {await s.close();}
});

test('concurrent separate claimants receive exactly one acknowledged permission', {timeout: 10000}, async () => {
  const s = await serverFor();
  try {
    // Different controller/plan identities must still contend for ONE release key.
    const claims = await Promise.allSettled(Array.from({length: 6}, (_, i) => adapter(s).claim({
      ...intent(), control_sha: (i + 1).toString(16).padStart(40, '0'),
      plan_sha256: (i + 1).toString(16).padStart(64, '0')})));
    assert.equal(claims.filter(r => r.status === 'fulfilled' && r.value === true).length, 1);
    assert.equal(claims.filter(r => r.status === 'rejected').length, 5);
    assert.equal(s.commits(), 1); assert.equal(s.calls.filter(c => c.method === 'PUT').length, 6);
    assert.equal(s.calls.filter(c => c.method === 'GET').length, 1); assert.deepEqual(s.validationErrors, []);
  } finally {await s.close();}
});

test('credentials are copied privately and cannot leak through evidence or JSON serialization', {timeout: 10000}, async () => {
  const s = await serverFor(), credentials = {...CREDENTIALS};
  const cp = new R2Checkpoint({credentials, request: s.request, now: () => DATE});
  credentials.accessKeyId = 'mutated'; credentials.secretAccessKey = 'mutated';
  try {
    assert.equal(await cp.claim(intent()), true);
    assert.equal(JSON.stringify(cp), '{}'); privateEvidence(cp);
    assert.deepEqual(s.validationErrors, []);
  } finally {await s.close();}
});

for (const mode of ['403', '409', '503', 'redirect', 'reset', 'timeout', 'partial', 'oversized',
  'nonempty', 'bad-etag', 'readback-mismatch', 'readback-403', 'readback-404']) {
  test(`checkpoint native HTTP fails closed without retry: ${mode}`, {timeout: 10000}, async () => {
    const s = await serverFor(mode), cp = adapter(s);
    try {
      let error; try {await cp.claim(intent());} catch (e) {error = e;}
      assert(error); assert.equal(s.calls.filter(c => c.method === 'PUT').length, 1);
      assert.equal(s.calls.filter(c => c.method === 'GET').length, mode.startsWith('readback') ? 1 : 0);
      const calls = s.calls.length; await assert.rejects(cp.claim(intent())); assert.equal(s.calls.length, calls);
      assert(s.calls.every(c => c.path === CHECKPOINT.path)); privateEvidence(cp, error);
      assert.deepEqual(s.validationErrors, []);
      if (s.commits()) {
        const replacement = adapter(s); await assert.rejects(replacement.claim(intent()));
        assert.equal(s.commits(), 1); assert.equal(s.calls.filter(c => c.method === 'PUT').length, 2);
        privateEvidence(replacement);
      }
    } finally {await s.close();}
  });
}

test('existing checkpoint blocks even when its stored contents are unrecognized', {timeout: 10000}, async () => {
  const s = await serverFor(); s.store.set(CHECKPOINT.path, Buffer.from('unknown prior attempt'));
  try {
    await assert.rejects(adapter(s).claim(intent()));
    assert.deepEqual(s.calls.map(c => c.method), ['PUT']); assert.equal(s.commits(), 0);
    assert.equal(s.store.get(CHECKPOINT.path).toString(), 'unknown prior attempt');
  } finally {await s.close();}
});

for (const field of ['release', 'control_sha', 'plan_sha256', 'body_sha256', 'schema', 'consumed', 'retry_permitted', 'extra']) {
  test(`checkpoint rejects invalid intent ${field} before network`, async () => {
    let calls = 0; const cp = new R2Checkpoint({credentials: CREDENTIALS, request: () => {calls++;}});
    const value = intent(); value[field] = field === 'retry_permitted' ? true : 'unapproved';
    await assert.rejects(cp.claim(value)); assert.equal(calls, 0); privateEvidence(cp);
  });
}
for (const field of ['account', 'bucket', 'key', 'sha', 'tree', 'hostname', 'path', 'project', 'environment', 'region']) {
  test(`checkpoint rejects target override ${field}`, () => {
    let calls = 0;
    assert.throws(() => new R2Checkpoint({credentials: CREDENTIALS, target: {...CHECKPOINT, [field]: 'other'}, request: () => {calls++;}}));
    assert.equal(calls, 0);
  });
}

test('aborted checkpoint does not send a request or allow same-instance reuse', {timeout: 10000}, async () => {
  const s = await serverFor(), cancellation = new AbortController(); cancellation.abort();
  const cp = adapter(s, {signal: cancellation.signal});
  try {
    await assert.rejects(cp.claim(intent())); await assert.rejects(cp.claim(intent()));
    assert.equal(s.calls.length, 0); privateEvidence(cp);
  } finally {await s.close();}
});
test('cancellation after durable commit prevents fresh-runner claim and resumption', {timeout: 10000}, async () => {
  const s = await serverFor('cancel'), cancellation = new AbortController(), cp = adapter(s, {signal: cancellation.signal});
  try {
    const committed = once(s.events, 'committed');
    const outcome = cp.claim(intent()).then(() => null, e => e); await committed; cancellation.abort();
    assert(await outcome); await assert.rejects(adapter(s).claim(intent()));
    assert.equal(s.commits(), 1); assert.equal(s.calls.filter(c => c.method === 'GET').length, 0); privateEvidence(cp);
  } finally {await s.close();}
});

test('SIGKILL and filesystem loss: replacement process cannot reclaim committed attempt', {timeout: 15000}, async () => {
  const s = await serverFor('crash'), original = mkdtempSync(join(tmpdir(), 'r2-original-')),
    replacement = mkdtempSync(join(tmpdir(), 'r2-replacement-'));
  const moduleURL = pathToFileURL(resolve('ops/pages-r2-checkpoint.mjs')).href;
  const source = `import {R2Checkpoint,requestR2Once} from ${JSON.stringify(moduleURL)};
    const request = o => requestR2Once({...o,hostname:'127.0.0.1',port:${s.port},secure:false,timeoutMs:10000});
    try {await new R2Checkpoint({credentials:${JSON.stringify(CREDENTIALS)},request,now:()=>new Date(${JSON.stringify(DATE.toISOString())})}).claim(${JSON.stringify(intent())});process.exitCode=2;}
    catch {console.error('checkpoint blocked');process.exitCode=1;}`;
  const launch = cwd => spawn(process.execPath, ['--input-type=module', '-e', source], {cwd, env: {PATH: process.env.PATH}, stdio: ['ignore', 'pipe', 'pipe']});
  const committed = once(s.events, 'committed'), child = launch(original); let restarted;
  try {
    await committed; const ended = once(child, 'exit'); child.kill('SIGKILL'); await ended;
    rmSync(original, {recursive: true, force: true});
    restarted = launch(replacement); const [status] = await once(restarted, 'exit'); assert.equal(status, 1);
    assert.equal(s.commits(), 1); assert.deepEqual(s.calls.map(c => c.method), ['PUT', 'PUT']);
    assert.deepEqual(s.validationErrors, []);
  } finally {child.kill('SIGKILL'); restarted?.kill('SIGKILL'); await s.close(); rmSync(original, {recursive: true, force: true}); rmSync(replacement, {recursive: true, force: true});}
});

test('LIMITATION: an unreceived write leaves no R2 tombstone; fresh execution requires orchestration refusal', {timeout: 10000}, async () => {
  const unavailable = await serverFor(); const unusedPort = unavailable.port; await unavailable.close();
  const cp = new R2Checkpoint({credentials: CREDENTIALS, now: () => DATE,
    request: o => requestR2Once({...o, hostname: '127.0.0.1', port: unusedPort, secure: false, timeoutMs: 300})});
  await assert.rejects(cp.claim(intent())); await assert.rejects(cp.claim(intent())); privateEvidence(cp);
  // The new fixture is an empty external store after a pre-arrival failure, not
  // evidence that retrying is authorized. R2 cannot know an unreceived attempt.
  const freshStore = await serverFor();
  try {
    assert.equal(await adapter(freshStore).claim(intent()), true);
    assert.equal(freshStore.commits(), 1);
    const yaml = readFileSync(new URL('../.github/workflows/classyline-production-manual.yml', import.meta.url), 'utf8');
    assert.match(yaml, /^          exit 1$/m);
    assert.match(yaml, /const NO_RETRY_TRANSPORT_VERIFIED = false;/);
    assert.match(yaml, /checkpoint:async \(\) => false/);
  } finally {await freshStore.close();}
});
