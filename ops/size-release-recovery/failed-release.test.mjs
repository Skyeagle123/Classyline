import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyConsumedSizeAttempt, receipt, FAILED_RUN, FAILED_JOB, FAILED_WORKFLOW, FAILED_SHA, FAILED_TREE, FAILED_PATH} from './failed-release.mjs';

function fixture() {
  const run = {id: FAILED_RUN, workflow_id: FAILED_WORKFLOW,
    repository: {full_name: 'Skyeagle123/Classyline', id: 1096008352},
    path: FAILED_PATH, event: 'workflow_dispatch', actor: {login: 'Skyeagle123', id: 125151458},
    triggering_actor: {login: 'Skyeagle123', id: 125151458}, head_branch: 'main', head_sha: FAILED_SHA,
    head_commit: {id: FAILED_SHA, tree_id: FAILED_TREE}, run_number: 1, run_attempt: 1,
    status: 'completed', conclusion: 'failure', created_at: receipt.created_at};
  const list = {total_count: 1, workflow_runs: [structuredClone(run)]};
  const jobs = {total_count: 1, jobs: [{id: FAILED_JOB, name: 'deploy', run_id: FAILED_RUN,
    run_attempt: 1, head_sha: FAILED_SHA, status: 'completed', conclusion: 'failure', steps: structuredClone(receipt.steps)}]};
  const approvals = [{state: 'approved', user: {login: 'Skyeagle123', id: 125151458},
    environments: [{name: 'classyline-production', id: 24902198946, can_admins_bypass: false}]}];
  const commit = {sha: FAILED_SHA, tree: {sha: FAILED_TREE}, parents: [{sha: '00b25b282d66818632a2d214e7a52ffbd0f8a1cb'}]};
  const data = {run, list, jobs, approvals, commit,
    log: readFileSync(new URL('./evidence/failed-size-release.log', import.meta.url), 'utf8')};
  data.get = async path => {
    if (path === '/actions/workflows/classyline-production-size-update.yml/runs?event=workflow_dispatch&per_page=100') return data.list;
    if (path === '/actions/runs/' + FAILED_RUN) return data.run;
    if (path === `/actions/runs/${FAILED_RUN}/attempts/1/jobs?per_page=100`) return data.jobs;
    if (path === `/actions/runs/${FAILED_RUN}/approvals`) return data.approvals;
    if (path === '/git/commits/' + FAILED_SHA) return data.commit;
    throw new Error('Unexpected read ' + path);
  };
  data.logs = async id => {assert.equal(id, FAILED_JOB); return data.log;};
  return data;
}
test('exact consumed audit failure is accepted as history, never as a release', async () => {
  const f = fixture(), r = await verifyConsumedSizeAttempt(f.get, f.logs);
  assert.equal(r.consumed_run, FAILED_RUN); assert.equal(r.zero_create_dispatches, true);
  assert.equal(r.replay_permitted, false);
});
const mutations = {
  'second old dispatch': f => {f.list.total_count = 2; f.list.workflow_runs.push(structuredClone(f.run));},
  'missing historical run': f => {f.list.workflow_runs = [];},
  'old rerun attempt 2': f => {f.run.run_attempt = 2;},
  'wrong source': f => {f.run.head_sha = 'f'.repeat(40);},
  'wrong tree': f => {f.run.head_commit.tree_id = 'f'.repeat(40);},
  'unexpected ancestry': f => {f.commit.parents.push({sha: 'f'.repeat(40)});},
  'wrong owner': f => {f.run.actor.id = 1;},
  'failure replaced by success': f => {f.run.conclusion = 'success';},
  'missing failed job': f => {f.jobs.jobs = [];},
  'truncated job list': f => {f.jobs.total_count = 2;},
  'job rerun': f => {f.jobs.jobs[0].run_attempt = 2;},
  'transport preparation executed': f => {f.jobs.jobs[0].steps.find(s => s.number === 10).conclusion = 'success';},
  'deployment step executed': f => {f.jobs.jobs[0].steps.find(s => s.number === 12).conclusion = 'failure';},
  'missing step evidence': f => {f.jobs.jobs[0].steps.pop();},
  'wrong approval': f => {f.approvals[0].user.login = 'other';},
  'approval bypass': f => {f.approvals[0].environments[0].can_admins_bypass = true;},
  'wrong environment': f => {f.approvals[0].environments[0].id = 1;},
  'altered audit logs': f => {f.log += 'changed';},
  'missing audit logs': f => {f.logs = async () => {throw Error('Unavailable');};},
};
for (const [name, mutate] of Object.entries(mutations))
  test('immutable failure evidence rejects ' + name, async () => {
    const f = fixture(); mutate(f);
    await assert.rejects(verifyConsumedSizeAttempt(f.get, f.logs));
  });
test('historical log normalization does not change semantic bytes', async () => {
  const f = fixture(); f.log = f.log.replace(/\n/g, '\r\n') + '\r\n';
  assert.equal((await verifyConsumedSizeAttempt(f.get, f.logs)).consumed_attempt, 1);
});
