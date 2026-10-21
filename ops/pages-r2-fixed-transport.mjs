// Shared native SigV4 transport for two compile-time fixed R2 targets only.
// No exported generic-target factory, SDK, retries, redirects or import-time I/O.
// Qualification cannot select the permanent Production release checkpoint.
import https from 'node:https';
import http from 'node:http';
import {createHash, createHmac} from 'node:crypto';

const account = '4bfa1a9c849c3da50520f7a4bcccccab';
const sha = 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a';
const tree = '123889f9fd27b3f0b2138ea057efa2e762a231b1';
const hostname = `${account}.r2.cloudflarestorage.com`;
const bucket = 'classyline-release-checkpoints';
const key = `pages/classyline2/production/${sha}/attempt.json`;
export const CHECKPOINT = Object.freeze({account, project: 'classyline2',
  environment: 'production', sha, tree, bucket, key, hostname,
  path: `/${bucket}/${key}`, region: 'auto'});
const testBucket = 'classyline-checkpoint-qualification';
const testKey = 'qualification/pr4/af06e616de69ce9c2a0d086ba0f9da43db4ff12e/claim.json';
export const QUALIFICATION = Object.freeze({account, project: 'classyline2',
  environment: 'qualification', sha, tree, bucket: testBucket, key: testKey,
  hostname, path: `/${testBucket}/${testKey}`, region: 'auto'});
const MAX_BYTES = 8192, MAX_TIMEOUT = 20000;
const hex = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
function check(ok, message) { if (!ok) throw new Error(message); }
function copyCredentials(credentials) {
  const value = {accessKeyId: credentials?.accessKeyId, secretAccessKey: credentials?.secretAccessKey};
  check(typeof value.accessKeyId === 'string' && /^[A-Za-z0-9]{16,128}$/.test(value.accessKeyId) &&
    typeof value.secretAccessKey === 'string' && /^[A-Za-z0-9/+_=.-]{32,128}$/.test(value.secretAccessKey),
    'Invalid checkpoint credentials');
  return Object.freeze(value);
}

// AWS Signature V4, fixed S3 region/service/URI. If-None-Match and exact body are
// signed; an intermediary cannot strip the precondition without invalidating it.
// This pure helper returns sensitive Authorization headers. Never log its result.
function signFor(target, {method, body, credentials, now}) {
  check(process.versions.node === '24.19.0', 'Unreviewed checkpoint runtime');
  check(['GET', 'PUT'].includes(method) && Buffer.isBuffer(body) && body.length <= MAX_BYTES &&
    (method === 'PUT' ? body.length > 0 : body.length === 0), 'Invalid checkpoint request');
  check(now instanceof Date && Number.isFinite(now.getTime()), 'Invalid checkpoint signing time');
  const credential = copyCredentials(credentials), bytes = Buffer.from(body);
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  check(/^\d{8}T\d{6}Z$/.test(stamp), 'Invalid checkpoint signing date');
  const day = stamp.slice(0, 8), payloadHash = hex('sha256', bytes);
  const headers = {host: target.hostname, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp};
  if (method === 'PUT') Object.assign(headers, {'content-type': 'application/json',
    'content-md5': createHash('md5').update(bytes).digest('base64'), 'if-none-match': '*'});
  const names = Object.keys(headers).sort(), signedHeaders = names.join(';');
  const canonical = [method, target.path, '', names.map(name => `${name}:${headers[name]}\n`).join(''),
    signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${target.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, hex('sha256', canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + credential.secretAccessKey, day), target.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers['content-length'] = String(bytes.length);
  return {hostname: target.hostname, path: target.path, method,
    headers: Object.freeze(headers), body: bytes};
}

// One native ClientRequest only. The loopback exception exists for offline fault
// tests; the adapter's signer always fixes the real R2 target and signed Host.
function requestFor(target, {hostname = target.hostname, port, secure = true, path,
  method, headers, body, timeoutMs = MAX_TIMEOUT, maxResponse = MAX_BYTES, signal}) {
  check((secure && hostname === target.hostname && port === undefined) ||
    (!secure && hostname === '127.0.0.1' && Number.isInteger(port) && port > 0 && port <= 65535),
    'Unsupported checkpoint endpoint');
  check(path === target.path && ['GET', 'PUT'].includes(method) && Buffer.isBuffer(body) &&
    body.length <= MAX_BYTES && (method === 'PUT' ? body.length > 0 : body.length === 0) &&
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT &&
    Number.isInteger(maxResponse) && maxResponse > 0 && maxResponse <= MAX_BYTES,
    'Invalid checkpoint HTTP request');
  const bytes = Buffer.from(body), frozenHeaders = Object.freeze({...headers});
  const expected = ['authorization', 'content-length', 'host', 'x-amz-content-sha256', 'x-amz-date',
    ...(method === 'PUT' ? ['content-md5', 'content-type', 'if-none-match'] : [])].sort();
  check(Object.getPrototypeOf(headers) === Object.prototype &&
    JSON.stringify(Object.keys(frozenHeaders).sort()) === JSON.stringify(expected) &&
    Object.entries(frozenHeaders).every(([name, value]) => name === name.toLowerCase() &&
      typeof value === 'string' && /^[\x20-\x7e]+$/.test(value)) &&
    /^\d{8}T\d{6}Z$/.test(frozenHeaders['x-amz-date']) &&
    /^AWS4-HMAC-SHA256 Credential=[A-Za-z0-9]{16,128}\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[a-f0-9]{64}$/.test(frozenHeaders.authorization) &&
    frozenHeaders.authorization.includes(`/${frozenHeaders['x-amz-date'].slice(0, 8)}/auto/s3/aws4_request, SignedHeaders=${expected.filter(name => !['authorization', 'content-length'].includes(name)).join(';')}, Signature=`) &&
    (method !== 'PUT' || frozenHeaders['content-type'] === 'application/json'),
    'Unapproved checkpoint headers');
  check(frozenHeaders.host === target.hostname &&
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
        agent: false, rejectUnauthorized: true, maxHeaderSize: MAX_BYTES, headers: frozenHeaders}, response => {
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

export function signCheckpointRequest(options) { return signFor(CHECKPOINT, options); }
export function requestR2Once(options) { return requestFor(CHECKPOINT, options); }
export function signQualificationRequest(options) { return signFor(QUALIFICATION, options); }
export function requestQualificationOnce(options) { return requestFor(QUALIFICATION, options); }
