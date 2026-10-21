// Fixed-release, create-only R2 checkpoint. No SDK, retries, redirects or resume.
// Importing this module performs no I/O. The Production workflow stays blocked.
// A separately verified indefinite bucket lock is mandatory before hosted use.
// R2 cannot record a request it never received: a lost local journal in that case
// still requires the workflow's external dispatch/uncertainty fence. This module
// does not turn an absent object into permission to retry a prior unknown claim.
import {createHash} from 'node:crypto';
import {RELEASE} from './pages-direct-upload.mjs';

import {CHECKPOINT, signCheckpointRequest, requestR2Once} from './pages-r2-fixed-transport.mjs';
export {CHECKPOINT, signCheckpointRequest, requestR2Once};
const hex = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
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
