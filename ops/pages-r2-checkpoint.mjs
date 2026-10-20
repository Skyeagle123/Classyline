// Fixed-release, create-only R2 checkpoint. No SDK, retries, redirects or resume.
// Importing this module performs no I/O. The Production workflow stays blocked.
// A separately verified indefinite bucket lock is mandatory before hosted use.
// R2 cannot record a request it never received: a lost local journal in that case
// still requires the workflow's external dispatch/uncertainty fence. This module
// does not turn an absent object into permission to retry a prior unknown claim.
import https from 'node:https';
import http from 'node:http';
import {createHash, createHmac} from 'node:crypto';
import {RELEASE} from './pages-direct-upload.mjs';

const bucket = 'classyline-release-checkpoints'; // Proposed dedicated bucket; not provisioned here.
const key = `pages/${RELEASE.project}/production/${RELEASE.sha}/attempt.json`;
const hostname = `${RELEASE.account}.r2.cloudflarestorage.com`;
export const CHECKPOINT = Object.freeze({
  account: RELEASE.account, project: RELEASE.project, environment: 'production',
  sha: RELEASE.sha, tree: RELEASE.tree, bucket, key, hostname,
  path: `/${bucket}/${key}`, region: 'auto'
});
const MAX_BYTES = 8192, MAX_TIMEOUT = 20000;
const hex = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
function check(ok, message) { if (!ok) throw new Error(message); }
function fixedTarget(target) {
  check(target && !Array.isArray(target) && Object.keys(target).length === Object.keys(CHECKPOINT).length &&
    Object.entries(CHECKPOINT).every(([name, value]) => target[name] === value), 'Unapproved checkpoint target');
}
function copyCredentials(credentials) {
  const value = {accessKeyId: credentials?.accessKeyId, secretAccessKey: credentials?.secretAccessKey};
  check(typeof value.accessKeyId === 'string' && /^[A-Za-z0-9]{16,128}$/.test(value.accessKeyId) &&
    typeof value.secretAccessKey === 'string' && /^[A-Za-z0-9/+_=.-]{32,128}$/.test(value.secretAccessKey),
    'Invalid checkpoint credentials');
  return Object.freeze(value);
}
function recordFor(intent) {
  const i = {...intent};
  const fields = ['schema', 'release', 'control_sha', 'plan_sha256', 'body_sha256', 'consumed', 'retry_permitted'];
  check(Object.keys(i).length === fields.length && fields.every(name => Object.hasOwn(i, name)) &&
    i.schema === 1 && i.release === RELEASE.sha && i.consumed === true && i.retry_permitted === false &&
    typeof i.control_sha === 'string' && /^[a-f0-9]{40}$/.test(i.control_sha) &&
    typeof i.plan_sha256 === 'string' && /^[a-f0-9]{64}$/.test(i.plan_sha256) &&
    typeof i.body_sha256 === 'string' && /^[a-f0-9]{64}$/.test(i.body_sha256), 'Invalid checkpoint intent');
  // Canonical allowlist: no arbitrary intent properties, credentials or timestamps.
  return Buffer.from(JSON.stringify({schema: 1, account: CHECKPOINT.account,
    project: CHECKPOINT.project, environment: CHECKPOINT.environment, branch: RELEASE.branch,
    application_sha: RELEASE.sha, application_tree: RELEASE.tree, bucket: CHECKPOINT.bucket,
    key: CHECKPOINT.key, control_sha: i.control_sha, plan_sha256: i.plan_sha256,
    body_sha256: i.body_sha256, consumed: true, retry_permitted: false}));
}

// AWS Signature V4, fixed S3 region/service/URI. If-None-Match and exact body are
// signed; an intermediary cannot strip the precondition without invalidating it.
// This pure helper returns sensitive Authorization headers. Never log its result.
export function signCheckpointRequest({method, body, credentials, now}) {
  check(process.versions.node === '24.19.0', 'Unreviewed checkpoint runtime');
  check(['GET', 'PUT'].includes(method) && Buffer.isBuffer(body) && body.length <= MAX_BYTES &&
    (method === 'PUT' ? body.length > 0 : body.length === 0), 'Invalid checkpoint request');
  check(now instanceof Date && Number.isFinite(now.getTime()), 'Invalid checkpoint signing time');
  const credential = copyCredentials(credentials), bytes = Buffer.from(body);
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  check(/^\d{8}T\d{6}Z$/.test(stamp), 'Invalid checkpoint signing date');
  const day = stamp.slice(0, 8), payloadHash = hex('sha256', bytes);
  const headers = {host: CHECKPOINT.hostname, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp};
  if (method === 'PUT') Object.assign(headers, {'content-type': 'application/json',
    'content-md5': createHash('md5').update(bytes).digest('base64'), 'if-none-match': '*'});
  const names = Object.keys(headers).sort(), signedHeaders = names.join(';');
  const canonical = [method, CHECKPOINT.path, '', names.map(name => `${name}:${headers[name]}\n`).join(''),
    signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${CHECKPOINT.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, hex('sha256', canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + credential.secretAccessKey, day), CHECKPOINT.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers['content-length'] = String(bytes.length);
  return {hostname: CHECKPOINT.hostname, path: CHECKPOINT.path, method,
    headers: Object.freeze(headers), body: bytes};
}

// One native ClientRequest only. The loopback exception exists for offline fault
// tests; the adapter's signer always fixes the real R2 target and signed Host.
export function requestR2Once({hostname = CHECKPOINT.hostname, port, secure = true, path,
  method, headers, body, timeoutMs = MAX_TIMEOUT, maxResponse = MAX_BYTES, signal}) {
  check((secure && hostname === CHECKPOINT.hostname && port === undefined) ||
    (!secure && hostname === '127.0.0.1' && Number.isInteger(port) && port > 0 && port <= 65535),
    'Unsupported checkpoint endpoint');
  check(path === CHECKPOINT.path && ['GET', 'PUT'].includes(method) && Buffer.isBuffer(body) &&
    body.length <= MAX_BYTES && (method === 'PUT' ? body.length > 0 : body.length === 0) &&
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT &&
    Number.isInteger(maxResponse) && maxResponse > 0 && maxResponse <= MAX_BYTES,
    'Invalid checkpoint HTTP request');
  const bytes = Buffer.from(body), frozenHeaders = Object.freeze({...headers});
  check(frozenHeaders.host === CHECKPOINT.hostname &&
    frozenHeaders['x-amz-content-sha256'] === hex('sha256', bytes) &&
    frozenHeaders['content-length'] === String(bytes.length) &&
    typeof frozenHeaders.authorization === 'string' &&
    (method !== 'PUT' || (frozenHeaders['if-none-match'] === '*' &&
      frozenHeaders['content-md5'] === createHash('md5').update(bytes).digest('base64'))),
    'Invalid checkpoint signed request');
  return new Promise((resolve, reject) => {
    let request, timer, settled = false;
    const cleanup = () => {clearTimeout(timer); signal?.removeEventListener('abort', fail);};
    const fail = () => {
      if (settled) return;
      settled = true; cleanup(); request?.destroy();
      reject(new Error('Checkpoint HTTP outcome uncertain; no retry'));
    };
    if (signal?.aborted) {fail(); return;}
    signal?.addEventListener('abort', fail, {once: true});
    try {
      request = (secure ? https : http).request({hostname, port, path, method,
        agent: false, maxHeaderSize: MAX_BYTES, headers: frozenHeaders}, response => {
        const chunks = []; let size = 0;
        response.on('aborted', fail); response.on('error', fail);
        response.on('data', chunk => {
          size += chunk.length;
          if (size > maxResponse) fail(); else chunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          if (!response.complete) {fail(); return;}
          settled = true; cleanup();
          const etags = response.rawHeaders.filter((_, index) => index % 2 === 0)
            .filter(name => name.toLowerCase() === 'etag').length;
          resolve({status: response.statusCode,
            headers: {etag: etags === 1 && typeof response.headers.etag === 'string' ? response.headers.etag : undefined},
            body: Buffer.concat(chunks)});
        });
      });
      request.on('error', fail); timer = setTimeout(fail, timeoutMs); request.end(bytes);
    } catch {fail();}
  });
}

export class R2Checkpoint {
  #credentials; #request; #now; #signal; #started = false;
  #evidence = {schema: 1, account: CHECKPOINT.account, project: CHECKPOINT.project,
    environment: CHECKPOINT.environment, application_sha: RELEASE.sha, application_tree: RELEASE.tree,
    bucket: CHECKPOINT.bucket, key: CHECKPOINT.key, state: 'unstarted', claim_requests: 0,
    verification_reads: 0, retry_permitted: false};
  constructor({credentials, request = requestR2Once, now = () => new Date(), target = CHECKPOINT, signal}) {
    fixedTarget(target);
    this.#credentials = copyCredentials(credentials);
    check(typeof request === 'function' && typeof now === 'function', 'Invalid checkpoint dependency');
    this.#request = request; this.#now = now; this.#signal = signal;
  }
  evidence() { return Object.freeze({...this.#evidence}); }
  async claim(intent) {
    check(!this.#started, 'Checkpoint instance consumed; no retry'); this.#started = true;
    this.#evidence.state = 'blocked';
    try {
      const bytes = recordFor(intent), expectedHash = hex('sha256', bytes), record = JSON.parse(bytes);
      const etag = `"${hex('md5', bytes)}"`;
      this.#evidence = {...this.#evidence, control_sha: record.control_sha,
        plan_sha256: record.plan_sha256, body_sha256: record.body_sha256,
        checkpoint_sha256: expectedHash, checkpoint_bytes: bytes.length};
      check(!this.#signal?.aborted, 'Checkpoint cancelled');
      const put = signCheckpointRequest({method: 'PUT', body: bytes, credentials: this.#credentials, now: this.#now()});
      this.#evidence.state = 'claiming'; this.#evidence.claim_requests = 1;
      const acknowledgement = await this.#request({...put, signal: this.#signal});
      check(!this.#signal?.aborted && acknowledgement?.status === 200 &&
        Buffer.isBuffer(acknowledgement.body) && acknowledgement.body.length === 0 &&
        acknowledgement.headers?.etag === etag, 'Checkpoint acknowledgement not conclusive');
      // Only this positively acknowledged current PUT permits a readback. A GET
      // after lost acknowledgement, timeout, conflict or restart is never a grant.
      const get = signCheckpointRequest({method: 'GET', body: Buffer.alloc(0), credentials: this.#credentials, now: this.#now()});
      this.#evidence.verification_reads = 1;
      const readback = await this.#request({...get, signal: this.#signal});
      check(!this.#signal?.aborted && readback?.status === 200 && Buffer.isBuffer(readback.body) &&
        readback.body.equals(bytes) && readback.headers?.etag === etag,
        'Checkpoint readback not conclusive');
      this.#evidence.state = 'acknowledged';
      return true;
    } catch {
      this.#evidence.state = 'blocked';
      // Never echo credentials, lower-level error strings, headers or response bytes.
      throw new Error('Checkpoint unavailable or outcome uncertain; no retry or resume');
    }
  }
}
