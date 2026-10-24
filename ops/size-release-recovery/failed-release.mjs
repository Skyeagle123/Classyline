import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const FAILED_RUN = 40070135911;
export const FAILED_JOB = 120801596986;
export const FAILED_WORKFLOW = 394632411;
export const FAILED_SHA = 'e08316796a14476712bcf0f79f6606c62c7bc294';
export const FAILED_TREE = '97f29ba8066225d323531154b4227f3168794609';
export const FAILED_PATH = '.github/workflows/classyline-production-size-update.yml';
const freeze = value => {if (value && typeof value === 'object') {for (const child of Object.values(value)) freeze(child); Object.freeze(value);} return value;};
export const receipt = freeze(JSON.parse(readFileSync(new URL('./evidence/failed-release.json', import.meta.url))));
export const normalizeLog = value => value.replace(/\r\n/g, '\n').trimEnd() + '\n';
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(receipt.run_id, FAILED_RUN); assert.equal(receipt.job_id, FAILED_JOB);
assert.equal(receipt.workflow_id, FAILED_WORKFLOW); assert.equal(receipt.head_sha, FAILED_SHA);
assert.equal(receipt.head_tree, FAILED_TREE); assert.equal(receipt.path, FAILED_PATH);
assert.equal(receipt.zero_create_dispatches, true);
assert.equal(hash(normalizeLog(readFileSync(new URL('./evidence/failed-size-release.log', import.meta.url), 'utf8'))), receipt.normalized_log_sha256);

// An additive guard for a separately reviewed future workflow. This module
// has no network, dispatch, arm-write or deployment capability of its own.
export async function verifyConsumedSizeAttempt(get, readJobLog) {
  assert.equal(typeof get, 'function'); assert.equal(typeof readJobLog, 'function');
  const list = await get('/actions/workflows/classyline-production-size-update.yml/runs?event=workflow_dispatch&per_page=100');
  assert.equal(list.total_count, 1, 'Consumed workflow was reused');
  assert.equal(list.workflow_runs?.length, 1, 'Incomplete consumed history');
  const run = await get('/actions/runs/' + FAILED_RUN);
  for (const r of [list.workflow_runs[0], run]) {
    assert.equal(r.id, FAILED_RUN); assert.equal(r.workflow_id, FAILED_WORKFLOW);
    assert.equal(r.repository?.full_name, 'Skyeagle123/Classyline'); assert.equal(r.repository.id, 1096008352);
    assert.equal(r.path, FAILED_PATH); assert.equal(r.event, 'workflow_dispatch');
    assert.equal(r.actor?.login, 'Skyeagle123'); assert.equal(r.actor.id, 125151458);
    assert.equal(r.triggering_actor?.login, 'Skyeagle123'); assert.equal(r.triggering_actor.id, 125151458);
    assert.equal(r.head_branch, 'main'); assert.equal(r.head_sha, FAILED_SHA);
    assert.equal(r.head_commit?.id, FAILED_SHA); assert.equal(r.head_commit.tree_id, FAILED_TREE);
    assert.equal(r.run_number, 1); assert.equal(r.run_attempt, 1);
    assert.equal(r.status, 'completed'); assert.equal(r.conclusion, 'failure');
    assert.equal(r.created_at, receipt.created_at);
  }
  const commit = await get('/git/commits/' + FAILED_SHA);
  assert.equal(commit.sha, FAILED_SHA); assert.equal(commit.tree?.sha, FAILED_TREE);
  assert.deepEqual(commit.parents?.map(p => p.sha), ['00b25b282d66818632a2d214e7a52ffbd0f8a1cb']);
  const jobs = await get(`/actions/runs/${FAILED_RUN}/attempts/1/jobs?per_page=100`);
  assert.equal(jobs.total_count, 1); assert.equal(jobs.jobs?.length, 1);
  const j = jobs.jobs[0]; assert.equal(j.id, FAILED_JOB); assert.equal(j.name, 'deploy');
  assert.equal(j.run_id, FAILED_RUN); assert.equal(j.run_attempt, 1); assert.equal(j.head_sha, FAILED_SHA);
  assert.equal(j.status, 'completed'); assert.equal(j.conclusion, 'failure');
  assert.deepEqual(j.steps?.map(({number, name, status, conclusion}) => ({number, name, status, conclusion})), receipt.steps,
    'Historical steps changed; zero-create proof unavailable');
  const approvals = await get(`/actions/runs/${FAILED_RUN}/approvals`);
  assert.equal(approvals?.length, 1); const a = approvals[0];
  assert.equal(a.state, 'approved'); assert.equal(a.user?.login, 'Skyeagle123'); assert.equal(a.user.id, 125151458);
  assert.equal(a.environments?.length, 1); assert.equal(a.environments[0].name, 'classyline-production');
  assert.equal(a.environments[0].id, 24902198946); assert.equal(a.environments[0].can_admins_bypass, false);
  const log = await readJobLog(FAILED_JOB); assert.equal(typeof log, 'string');
  assert.equal(hash(normalizeLog(log)), receipt.normalized_log_sha256, 'Live failed logs changed or unavailable');
  return {consumed_run: FAILED_RUN, consumed_attempt: 1, zero_create_dispatches: true,
    log_sha256: receipt.normalized_log_sha256, replay_permitted: false};
}
