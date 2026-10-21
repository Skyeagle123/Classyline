// Prepared checkpoint-only qualification. Importing performs no I/O.
// Hosted execution is deliberately blocked. Only real loopback HTTP is wired.
// A future authenticated read-only metadata collector needs independent review;
// raw API-shaped fixture evidence here does not prove hosted permissions/locks.
import {createHash} from 'node:crypto';
import {QUALIFICATION, signQualificationRequest, requestQualificationOnce} from './pages-r2-fixed-transport.mjs';

export {QUALIFICATION};
export const HOSTED_QUALIFICATION_ENABLED = false;
const MAX_CONFIGURATION_AGE_MS = 60_000;
const permissionName = 'Workers R2 Storage Bucket Item Write';
const hash = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const etagFor = bytes => `"${hash('md5', bytes)}"`;
function check(ok) { if (!ok) throw new Error('Qualification prerequisite unavailable or inconsistent'); }
function plain(value) { return value && Object.getPrototypeOf(value) === Object.prototype; }
function result(response) {
  check(response?.status === 200 && plain(response.body) && response.body.success === true &&
    (!response.body.errors || (Array.isArray(response.body.errors) && !response.body.errors.length)));
  return response.body.result;
}
function activeAt(value) {
  const time = Date.parse(value); return typeof value === 'string' && Number.isFinite(time) && time;
}

// No API credential is accepted here: a separately authenticated read-only
// collector must supply these exact raw GET responses. Never persist its raw
// responses: the token ID is the private S3 access-key ID, not audit evidence.
async function configuration(readConfiguration, accessKeyId, now, signal) {
  check(typeof readConfiguration === 'function' && now instanceof Date && Number.isFinite(now.getTime()) && !signal?.aborted);
  const base = `/accounts/${QUALIFICATION.account}`;
  const bucket = `${base}/r2/buckets/${QUALIFICATION.bucket}`;
  async function get(path) {
    check(!signal?.aborted);
    return readConfiguration(Object.freeze({method: 'GET', path, jurisdiction: 'default', signal}));
  }
  // Sequential, bounded GETs. No listing of other buckets, objects or accounts.
  const bucketState = result(await get(bucket));
  const locks = result(await get(`${bucket}/lock`));
  const lifecycle = result(await get(`${bucket}/lifecycle`));
  const token = result(await get(`${base}/tokens/${accessKeyId}`));
  const groupResponse = await get(`${base}/tokens/permission_groups`);
  const groups = result(groupResponse);
  check(!signal?.aborted && plain(bucketState) && bucketState.name === QUALIFICATION.bucket &&
    (bucketState.jurisdiction === undefined || bucketState.jurisdiction === 'default'));
  check(plain(locks) && Array.isArray(locks.rules) && locks.rules.length === 1);
  const lock = locks.rules[0];
  check(plain(lock) && lock.enabled === true && typeof lock.id === 'string' && lock.id.length > 0 &&
    plain(lock.condition) && Object.keys(lock.condition).length === 1 && lock.condition.type === 'Indefinite' &&
    (lock.prefix === undefined || typeof lock.prefix === 'string') && QUALIFICATION.key.startsWith(lock.prefix ?? ''));
  check(plain(lifecycle) && Array.isArray(lifecycle.rules) && lifecycle.rules.length === 0);
  check(plain(token) && token.id === accessKeyId && token.status === 'active' &&
    Array.isArray(token.policies) && token.policies.length === 1);
  const expires = activeAt(token.expires_on), notBefore = token.not_before === undefined ? -Infinity : activeAt(token.not_before);
  check(expires && expires > now.getTime() + MAX_CONFIGURATION_AGE_MS &&
    (Number.isFinite(notBefore) || notBefore === -Infinity));
  check(notBefore <= now.getTime());
  const policy = token.policies[0];
  const resource = `com.cloudflare.edge.r2.bucket.${QUALIFICATION.account}_default_${QUALIFICATION.bucket}`;
  check(plain(policy) && policy.effect === 'allow' && plain(policy.resources) &&
    Object.keys(policy.resources).length === 1 && policy.resources[resource] === '*' &&
    Array.isArray(policy.permission_groups) && policy.permission_groups.length === 1);
  check(Array.isArray(groups) && groups.length > 0 &&
    (groupResponse.body.result_info?.total_pages === undefined || groupResponse.body.result_info.total_pages === 1));
  const matching = groups.filter(group => group.name === permissionName);
  check(matching.length === 1 && typeof matching[0].id === 'string' && /^[a-f0-9]{32}$/.test(matching[0].id) &&
    groups.filter(group => group.id === matching[0].id).length === 1 &&
    policy.permission_groups[0].id === matching[0].id &&
    (policy.permission_groups[0].name === undefined || policy.permission_groups[0].name === permissionName));
  // Allowlisted nonsecret summary. No raw policy, token ID, credentials, headers
  // or API response/error bodies cross the evidence boundary.
  return Object.freeze({bucket: QUALIFICATION.bucket, jurisdiction: 'default',
    retention: 'Indefinite', lock_prefix: lock.prefix ?? '', lifecycle_rules: 0,
    permission: permissionName, scope: resource, expires_on: token.expires_on});
}

function record(contender) {
  return Buffer.from(JSON.stringify({schema: 1, purpose: 'checkpoint-only-qualification',
    account: QUALIFICATION.account, bucket: QUALIFICATION.bucket, key: QUALIFICATION.key,
    application_sha: QUALIFICATION.sha, application_tree: QUALIFICATION.tree,
    contender, retained: true, pages_deployment_permitted: false}));
}

export class QualificationHarness {
  #credentials; #port; #readConfiguration; #now; #signal; #timeout; #started = false;
  #evidence = {schema: 1, mode: 'offline-loopback', hosted_qualified: false,
    bucket: QUALIFICATION.bucket, key: QUALIFICATION.key, state: 'unstarted',
    conditional_puts: 0, object_reads: 0, metadata_reads: 0, max_created_objects: 1,
    pages_requests: 0, automatic_retries: 0, cleanup_permitted: false};
  constructor({credentials, port, readConfiguration, now = () => new Date(), signal, timeoutMs = 300}) {
    // There is intentionally no hostname, URL, bucket, key or arbitrary request
    // override. The only executable endpoint is 127.0.0.1 on an explicit port.
    check(Number.isInteger(port) && port > 0 && port <= 65535 && typeof now === 'function' &&
      Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000);
    this.#credentials = Object.freeze({accessKeyId: credentials?.accessKeyId, secretAccessKey: credentials?.secretAccessKey});
    check(typeof this.#credentials.accessKeyId === 'string' && /^[A-Za-z0-9]{16,128}$/.test(this.#credentials.accessKeyId));
    this.#port = port; this.#readConfiguration = readConfiguration; this.#now = now;
    this.#signal = signal; this.#timeout = timeoutMs;
  }
  evidence() { return Object.freeze({...this.#evidence}); }
  async #configuration() {
    return configuration(async request => {
      this.#evidence.metadata_reads++;
      return this.#readConfiguration(request);
    }, this.#credentials.accessKeyId, this.#now(), this.#signal);
  }
  async #request(method, body) {
    const signed = signQualificationRequest({method, body, credentials: this.#credentials, now: this.#now()});
    check(!this.#signal?.aborted);
    if (method === 'PUT') this.#evidence.conditional_puts++; else this.#evidence.object_reads++;
    return requestQualificationOnce({...signed, hostname: '127.0.0.1', port: this.#port,
      secure: false, signal: this.#signal, timeoutMs: this.#timeout});
  }
  async run() {
    check(!this.#started); this.#started = true; this.#evidence.state = 'blocked';
    try {
      const startedAt = this.#now().getTime();
      const before = await this.#configuration();
      const age = this.#now().getTime() - startedAt;
      check(!this.#signal?.aborted && Number.isFinite(age) && age >= 0 && age <= MAX_CONFIGURATION_AGE_MS);
      const bodies = [record('A'), record('B')];
      this.#evidence.state = 'claiming';
      const claims = await Promise.allSettled(bodies.map(body => this.#request('PUT', body)));
      check(!this.#signal?.aborted && claims.every(claim => claim.status === 'fulfilled'));
      const statuses = claims.map(claim => claim.value.status);
      check(statuses.filter(status => status === 200).length === 1 && statuses.filter(status => status === 412).length === 1);
      const winner = statuses.indexOf(200), response = claims[winner].value, bytes = bodies[winner];
      check(Buffer.isBuffer(response.body) && response.body.length === 0 && response.headers?.etag === etagFor(bytes));
      // A conclusive winner only; no readback or existing-object probe follows
      // timeout, reset, cancellation, unexpected status or any uncertain claim.
      const readback = await this.#request('GET', Buffer.alloc(0));
      check(readback?.status === 200 && Buffer.isBuffer(readback.body) && readback.body.equals(bytes) &&
        readback.headers?.etag === etagFor(bytes));
      const denied = await this.#request('PUT', record('existing-denial'));
      check(denied?.status === 412 && Buffer.isBuffer(denied.body));
      const after = await this.#configuration();
      check(JSON.stringify(after) === JSON.stringify(before) && !this.#signal?.aborted);
      this.#evidence = {...this.#evidence, state: 'offline-passed', winner,
        checkpoint_sha256: hash('sha256', bytes), checkpoint_bytes: bytes.length,
        configuration_sha256: hash('sha256', JSON.stringify(before)),
        retention_verified_in_fixture: true, permission_scope_verified_in_fixture: true};
      return this.evidence();
    } catch {
      this.#evidence.state = 'blocked';
      throw new Error('Qualification blocked or outcome uncertain; no retry, resume or cleanup');
    }
  }
}

export function runHostedQualification() {
  // Do not arm this in this preparation package. A separately authorized live
  // adapter, authenticated metadata reader and scoped credential path are absent.
  throw new Error('BLOCKED: hosted qualification is not enabled or authorized');
}
