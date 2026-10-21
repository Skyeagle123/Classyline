// Offline implementation of a consume-before-execution authority contract.
// No store, service, credentials or live adapter is provisioned by this module.
// A fake/local transaction proves control flow, NOT hosted durability/retention.
import {randomUUID, createHash} from 'node:crypto';
import {QUALIFICATION} from './pages-r2-fixed-transport.mjs';

export const AUTHORITY_TRANSPORT_VERIFIED = false;
export const BUDGET = Object.freeze({put: 3, get: 1, metadata: 10});
export const AUTHORIZATION_KEY = 'classyline/pr4/checkpoint-qualification/af06e616de69ce9c2a0d086ba0f9da43db4ff12e';
const grants = new WeakSet();
const fail = () => {throw new Error('Qualification authorization consumed, unavailable or uncertain; no retry');};

// The backend MUST atomically serialize get+put and acknowledge durable commit
// before resolving transaction(). Its record must never expire, reset or rewind.
// Only the current positive claim returns a grant; reading a record cannot resume.
export async function claimQualificationBudget(storage, {timeoutMs = 10000} = {}) {
  const nonce = randomUUID();
  const intent = Object.freeze({schema: 1, authorization: AUTHORIZATION_KEY,
    account: QUALIFICATION.account, bucket: QUALIFICATION.bucket, key: QUALIFICATION.key,
    application_sha: QUALIFICATION.sha, application_tree: QUALIFICATION.tree,
    consumed: true, resume_permitted: false, budget: BUDGET, nonce});
  let timer;
  try {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) fail();
    if (!storage || typeof storage.transaction !== 'function') fail();
    const acknowledged = await Promise.race([storage.transaction(async tx => {
      if (!tx || typeof tx.get !== 'function' || typeof tx.put !== 'function') fail();
      if (await tx.get(AUTHORIZATION_KEY) !== undefined) fail();
      await tx.put(AUTHORIZATION_KEY, intent);
      return nonce;
    }), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Authority uncertain')), timeoutMs);})]);
    if (acknowledged !== nonce) fail();
    const counts = {put: 0, get: 0, metadata: 0}; let blocked = false;
    const grant = Object.freeze({
      take(kind) {
        if (blocked || !Object.hasOwn(BUDGET, kind) || counts[kind] >= BUDGET[kind]) {blocked = true; fail();}
        counts[kind]++;
      },
      stop() {blocked = true;},
      evidence() {return Object.freeze({authorization: AUTHORIZATION_KEY, consumed: true,
        resume_permitted: false, counts: Object.freeze({...counts}), blocked,
        record_sha256: createHash('sha256').update(JSON.stringify(intent)).digest('hex')});}
    });
    grants.add(grant); return grant;
  } catch {fail();} finally {clearTimeout(timer);}
}
export function requireBudgetGrant(grant) {
  if (!grants.has(grant)) fail();
}
export async function claimHostedQualificationBudget() {
  // Do not replace this with a local file/artifact or caller-supplied success.
  // Atomic backend, fixed service identity, authentication and permanent retention
  // have not been qualified. No authority request may be sent until reviewed.
  if (!AUTHORITY_TRANSPORT_VERIFIED) fail();
  fail();
}
